import AppKit
import Defaults
import EventKit
import Foundation
import SwiftUI
import UserNotifications

extension Notification.Name {
    /// A task reached its warning time: the notch opens on the Agenda for a moment.
    static let reminderDue = Notification.Name("reminderDue")
}

/// macOS keeps the notifications of the app in front silent, only in the Notification Center. The notch is in front
/// whenever you type in it, so without this the reminders would arrive without banner and without sound.
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationPresenter()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}

/// The warning that shows under the notch for a few seconds when a reminder is due, so it is seen whatever you are doing
/// (it does not depend on the macOS notification permission).
@MainActor
final class ReminderToast: ObservableObject {
    static let shared = ReminderToast()

    struct Item: Equatable {
        let id = UUID()
        let title: String
        let body: String
    }

    @Published private(set) var current: Item?
    private var hideTask: Task<Void, Never>?

    func show(title: String, body: String) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { current = Item(title: title, body: body) }
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(12))
            guard !Task.isCancelled else { return }
            dismiss()
        }
    }

    func dismiss() {
        hideTask?.cancel()
        withAnimation(.easeOut(duration: 0.25)) { current = nil }
    }
}

struct ReminderToastView: View {
    @ObservedObject private var toast = ReminderToast.shared

    var body: some View {
        if let item = toast.current {
            HStack(spacing: 10) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 1, green: 0.8, blue: 0.3))
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Text(item.body).font(.system(size: 11)).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                }
                Spacer(minLength: 8)
                Button { toast.dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.6))
                        .frame(width: 20, height: 20).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .frame(width: 330)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.black))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.14), lineWidth: 1))
            .padding(.top, 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

/// Reminders: tasks with a date (a line "⏰ 2026-10-27 10:00 · 10" in the note, same format as Windows) and events
/// saved in the Mac calendar with an alarm. Both warn the chosen number of minutes before.
enum Reminders {
    static let leads: [(minutes: Int, label: String)] = [
        (0, "A la hora"), (5, "5 min antes"), (10, "10 min antes"), (15, "15 min antes"), (30, "30 min antes"), (60, "1 hora antes"),
    ]

    // MARK: Line in the note

    private static let lineFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f
    }()

    static func line(due: Date, lead: Int) -> String { "⏰ \(lineFormat.string(from: due)) · \(lead)" }

    static func parse(_ line: String) -> (due: Date, lead: Int)? {
        guard line.hasPrefix("⏰") else { return nil }
        let parts = line.dropFirst().components(separatedBy: "·").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let due = lineFormat.date(from: parts[0]) else { return nil }
        return (due, max(0, parts.count > 1 ? Int(parts[1]) ?? 0 : 0))
    }

    static func leadText(_ minutes: Int) -> String { minutes >= 60 && minutes % 60 == 0 ? "\(minutes / 60) h" : "\(minutes) min" }

    static func whenText(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es")
        let cal = Calendar.current
        if cal.isDateInToday(date) { f.dateFormat = "'hoy' HH:mm" }
        else if cal.isDateInTomorrow(date) { f.dateFormat = "'mañana' HH:mm" }
        else { f.dateFormat = "EEE d MMM, HH:mm" }
        return f.string(from: date)
    }

    // MARK: Notifications of tasks

    private static var scheduled: [String: Date] = [:]
    private static var started = false
    private static var firstSync = false
    /// Open tasks with a warning still to come, and the warnings already given (id + time), for the sound and the notch.
    private static var upcoming: [String: (title: String, body: String, fire: Date)] = [:]
    private static var given: Set<String> = []
    private static var ticker: Timer?
    private static let lateLimit: TimeInterval = 5 * 60

    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private static func body(for item: NoteItem, fire: Date) -> String {
        item.lead == 0 ? "Es ahora" : "En \(leadText(item.lead)), \(whenText(item.due ?? fire))"
    }

    /// Keeps one pending notification per open task with a future reminder. Called after every reload of the notes.
    @MainActor
    static func sync(_ items: [NoteItem]) {
        let center = UNUserNotificationCenter.current()
        if !started {
            // Notifications left from the last run may belong to tasks that are now done or deleted (only the task ones).
            started = true
            center.getPendingNotificationRequests { requests in
                let old = requests.map(\.identifier).filter { $0.hasPrefix("task.") }
                center.removePendingNotificationRequests(withIdentifiers: old)
            }
            firstSync = true
            ticker = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { _ in
                MainActor.assumeIsolated { tick() }
            }
        }
        var wanted: [String: (item: NoteItem, fire: Date)] = [:]
        upcoming = [:]
        for item in items where item.isTask && !item.done {
            guard let due = item.due else { continue }
            let fire = due.addingTimeInterval(-Double(item.lead) * 60)
            if Date().timeIntervalSince(fire) < lateLimit { upcoming[item.id] = (item.text, body(for: item, fire: fire), fire) }
            if fire > Date() && Defaults[.remindNotify] { wanted[item.id] = (item, fire) }
        }
        if firstSync {
            // Warnings whose time passed before the app started were already given in an earlier run: do not repeat them.
            firstSync = false
            for (id, u) in upcoming where u.fire <= Date() { given.insert("\(id)|\(u.fire.timeIntervalSince1970)") }
        }
        let stale = scheduled.keys.filter { wanted[$0]?.fire != scheduled[$0] }
        if !stale.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: stale.map { "task." + $0 })
            for id in stale { scheduled[id] = nil }
        }
        for (id, w) in wanted where scheduled[id] != w.fire {
            let content = UNMutableNotificationContent()
            content.title = w.item.text
            content.body = body(for: w.item, fire: w.fire)
            // The app plays the sound chosen in Settings itself, so the notification stays quiet.
            content.sound = nil
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: w.fire)
            center.add(UNNotificationRequest(
                identifier: "task." + id, content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
            scheduled[id] = w.fire
        }
    }

    /// At the warning time: the sound and the notch, besides the notification (missed ones are not given late).
    @MainActor
    private static func tick() {
        let now = Date()
        for (id, u) in upcoming where u.fire <= now && now.timeIntervalSince(u.fire) < lateLimit {
            let key = "\(id)|\(u.fire.timeIntervalSince1970)"
            guard !given.contains(key) else { continue }
            given.insert(key)
            if Defaults[.remindSound] { playSound() }
            ReminderToast.shared.show(title: u.title, body: u.body)
            if Defaults[.remindOpenIsland] { NotificationCenter.default.post(name: .reminderDue, object: nil) }
        }
    }

    static func playSound() {
        NSSound(named: NSSound.Name(Defaults[.remindSoundName]))?.play()
    }

    /// "Probar aviso" in Settings: the same notification and sound a task would give, right now.
    static func test() {
        requestPermission()
        let content = UNMutableNotificationContent()
        content.title = "Así se ven tus recordatorios"
        content.body = "Es ahora"
        content.sound = nil
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "test." + UUID().uuidString, content: content, trigger: nil))
        if Defaults[.remindSound] { playSound() }
        Task { @MainActor in ReminderToast.shared.show(title: "Así se ven tus recordatorios", body: "Es ahora") }
    }

    // MARK: Events

    /// Saves an event in the default calendar of the Mac with an alarm. Returns an error message, or nil when it worked.
    static func addEvent(title: String, start: Date, lead: Int) async -> String? {
        let store = EKEventStore()
        let granted = (try? await store.requestFullAccessToEvents()) ?? false
        guard granted else { return "Permite el acceso a Calendarios en Ajustes del Sistema › Privacidad y seguridad." }
        guard let calendar = store.defaultCalendarForNewEvents else { return "No hay un calendario donde guardarlo." }
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = start
        event.endDate = start.addingTimeInterval(3600)
        event.calendar = calendar
        event.addAlarm(EKAlarm(relativeOffset: -Double(lead) * 60))
        do {
            try store.save(event, span: .thisEvent)
            return nil
        } catch {
            return "No se pudo guardar el evento."
        }
    }
}
