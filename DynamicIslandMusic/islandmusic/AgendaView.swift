import Defaults
import EventKit
import SwiftUI

/// Agenda tab: every task, note and upcoming event in one place. Tasks can be checked, everything can be deleted
/// (notes and tasks go to the Trash; events are removed from the calendar after a confirmation).
struct AgendaView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case all = "Todo", tasks = "Tareas", notes = "Notas", events = "Eventos"
        var id: Self { self }
    }

    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject private var notes = NotesManager.shared
    @ObservedObject private var calendar = CalendarManager.shared
    @State private var filter: Filter = .all
    @State private var confirmClear = false
    @State private var confirmEvent: String?
    @State private var eventError: String?
    @Default(.agendaDays) private var upcomingDays

    // MARK: Data

    private var tasks: [NoteItem] {
        notes.items.filter(\.isTask).sorted { a, b in
            if a.done != b.done { return !a.done }
            switch (a.due, b.due) {
            case let (x?, y?): return x < y
            case (.some, nil): return true
            case (nil, .some): return false
            default: return a.created > b.created
            }
        }
    }

    private var plainNotes: [NoteItem] { notes.items.filter { !$0.isTask } }

    private var events: [EventModel] {
        calendar.upcoming.filter { e in
            if case .reminder(let completed) = e.type { return !completed }
            return e.end > Date()
        }
    }

    private var doneCount: Int { notes.items.filter { $0.isTask && $0.done }.count }

    private var eventStatus: EKAuthorizationStatus {
        _ = calendar.calendarAuthorizationStatus // re-read after the permission prompt
        return EKEventStore.authorizationStatus(for: .event)
    }

    private func count(_ f: Filter) -> Int {
        switch f {
        case .all: tasks.count + plainNotes.count + events.count
        case .tasks: tasks.count
        case .notes: plainNotes.count
        case .events: events.count
        }
    }

    // MARK: Layout

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            if let eventError {
                Text(eventError).font(.system(size: 11)).foregroundStyle(.red.opacity(0.9))
            }
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 6) {
                    if filter == .all || filter == .tasks { tasksSection }
                    if filter == .all || filter == .notes { notesSection }
                    if filter == .all || filter == .events { eventsSection }
                }
                .padding(.bottom, 6)
            }
            .onHover { vm.isHoveringCalendar = $0 }
        }
        .padding(.top, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear { notes.reload() }
        .onDisappear { vm.isHoveringCalendar = false }
        .task(id: upcomingDays) { await calendar.loadUpcoming(days: upcomingDays) }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            Task { await calendar.loadUpcoming(days: upcomingDays) }
        }
        .onChange(of: filter) { _, _ in
            confirmClear = false
            confirmEvent = nil
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("Agenda").font(.system(size: 14, weight: .semibold))
            HStack(spacing: 2) {
                ForEach(Filter.allCases) { f in
                    Button { withAnimation(.smooth(duration: 0.2)) { filter = f } } label: {
                        HStack(spacing: 4) {
                            Text(f.rawValue)
                            Text("\(count(f))").foregroundStyle(filter == f ? Color.white.opacity(0.7) : Color.gray.opacity(0.8))
                        }
                        .font(.system(size: 11.5, weight: .semibold).monospacedDigit())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .foregroundStyle(filter == f ? Color.white : Color.gray)
                        .background(filter == f ? Color.white.opacity(0.2) : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .islandGlass(Capsule(), interactive: false)
            Spacer(minLength: 4)
            if doneCount > 0 && (filter == .all || filter == .tasks) { clearDoneButton }
            QuickAddButton()
                .scaleEffect(0.82)
                .frame(width: 28, height: 28)
        }
    }

    @ViewBuilder
    private var clearDoneButton: some View {
        if confirmClear {
            HStack(spacing: 6) {
                Text("¿Mandar \(doneCount) a la Papelera?").font(.system(size: 11)).foregroundStyle(.white.opacity(0.8))
                pill("Sí", tint: .red.opacity(0.55)) {
                    notes.deleteDone()
                    confirmClear = false
                }
                pill("No") { confirmClear = false }
            }
        } else {
            pill("Borrar completadas", systemImage: "checkmark.circle") { confirmClear = true }
                .help("Manda a la Papelera las \(doneCount) tareas hechas")
        }
    }

    // MARK: Sections

    @ViewBuilder
    private var tasksSection: some View {
        sectionTitle("Tareas", count: tasks.count)
        if tasks.isEmpty {
            emptyText("No hay tareas. Crea una con el +.")
        } else {
            ForEach(tasks) { taskRow($0) }
        }
    }

    @ViewBuilder
    private var notesSection: some View {
        sectionTitle("Notas", count: plainNotes.count)
        if plainNotes.isEmpty {
            emptyText("No hay notas.")
        } else {
            ForEach(plainNotes) { noteRow($0) }
        }
    }

    @ViewBuilder
    private var eventsSection: some View {
        sectionTitle("Próximos \(upcomingDays) días", count: events.count)
        switch eventStatus {
        case .fullAccess:
            if events.isEmpty {
                emptyText("Sin eventos en los próximos \(upcomingDays) días.")
            } else {
                ForEach(events, id: \.agendaKey) { eventRow($0) }
            }
        case .notDetermined:
            HStack(spacing: 8) {
                emptyText("Permite el acceso a Calendarios para ver tus eventos aquí.")
                pill("Dar acceso") {
                    Task {
                        await calendar.checkCalendarAuthorization()
                        await calendar.loadUpcoming(days: upcomingDays)
                    }
                }
            }
        default:
            HStack(spacing: 8) {
                emptyText("Sin acceso a Calendarios. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Calendarios.")
                pill("Abrir") {
                    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars") {
                        NSWorkspace.shared.open(url)
                    }
                }
            }
        }
    }

    // MARK: Rows

    private func taskRow(_ item: NoteItem) -> some View {
        row {
            Button { notes.toggle(item) } label: {
                Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 14))
                    .foregroundStyle(item.done ? Color.blue : Color.gray)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .help(item.done ? "Marcar como pendiente" : "Marcar como hecha")
            VStack(alignment: .leading, spacing: 1) {
                Text(item.text)
                    .font(.system(size: 12))
                    .strikethrough(item.done)
                    .foregroundStyle(item.done ? Color.gray : Color.white)
                    .lineLimit(2)
                if let due = item.due, !item.done {
                    Label(Reminders.whenText(due), systemImage: "bell.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(due < Date() ? Color.red.opacity(0.85) : Color(red: 0.43, green: 0.66, blue: 1))
                } else {
                    Text(NotesManager.age(item.created)).font(.system(size: 10)).foregroundStyle(.gray)
                }
            }
            Spacer(minLength: 4)
            trashButton("Mandar a la Papelera") { notes.delete(item) }
        }
        .contextMenu { Button("Mostrar en Finder") { NSWorkspace.shared.activateFileViewerSelecting([item.url]) } }
    }

    private func noteRow(_ item: NoteItem) -> some View {
        row {
            Image(systemName: "circle.fill")
                .font(.system(size: 5))
                .foregroundStyle(.yellow)
                .frame(width: 14)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.text).font(.system(size: 12)).foregroundStyle(.white).lineLimit(3)
                Text(NotesManager.age(item.created)).font(.system(size: 10)).foregroundStyle(.gray)
            }
            Spacer(minLength: 4)
            trashButton("Mandar a la Papelera") { notes.delete(item) }
        }
        .contextMenu { Button("Mostrar en Finder") { NSWorkspace.shared.activateFileViewerSelecting([item.url]) } }
    }

    private func eventRow(_ event: EventModel) -> some View {
        let key = event.agendaKey
        let canDelete = !event.type.isBirthday && !event.calendar.isSubscribed
        return row {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(nsColor: event.calendar.color))
                .frame(width: 3, height: 26)
                .padding(.horizontal, 5.5)
            Button {
                if let url = event.calendarAppURL() { NSWorkspace.shared.open(url) }
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(event.title.isEmpty ? "Sin título" : event.title)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text("\(whenText(event)) · \(event.calendar.title)")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(event.type.isReminder ? "Abrir en Recordatorios" : "Abrir en Calendario")
            if confirmEvent == key {
                Text(event.type.isReminder ? "¿Borrar de Recordatorios?" : "¿Borrar del Calendario?")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize()
                pill("Borrar", tint: .red.opacity(0.55)) {
                    confirmEvent = nil
                    Task { eventError = await calendar.delete(event) }
                }
                pill("No") { confirmEvent = nil }
            } else if canDelete {
                trashButton(event.type.isReminder ? "Borrar recordatorio" : "Borrar evento") {
                    eventError = nil
                    confirmEvent = key
                }
            }
        }
    }

    // MARK: Pieces

    private func row<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(alignment: .center, spacing: 8) { content() }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func sectionTitle(_ title: String, count: Int) -> some View {
        HStack(spacing: 6) {
            Text(title.uppercased()).font(.system(size: 10, weight: .bold)).foregroundStyle(.gray)
            Text("\(count)").font(.system(size: 10, weight: .semibold).monospacedDigit()).foregroundStyle(.gray.opacity(0.8))
        }
        .padding(.top, 6)
        .padding(.leading, 2)
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5))
            .foregroundStyle(.gray)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, 2)
    }

    private func trashButton(_ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "trash")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.55))
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private func pill(_ title: String, systemImage: String? = nil, tint: Color? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let systemImage { Label(title, systemImage: systemImage) } else { Text(title) }
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .fixedSize()
        }
        .buttonStyle(.plain)
        .islandGlass(Capsule(), tint: tint)
    }

    private func whenText(_ e: EventModel) -> String {
        guard e.isAllDay else { return Reminders.whenText(e.start) }
        let cal = Calendar.current
        if cal.isDateInToday(e.start) { return "hoy · todo el día" }
        if cal.isDateInTomorrow(e.start) { return "mañana · todo el día" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es")
        f.dateFormat = "EEE d MMM"
        return f.string(from: e.start) + " · todo el día"
    }
}

private extension EventModel {
    /// A repeating event shares its id between occurrences; the start tells them apart.
    var agendaKey: String { "\(id)|\(start.timeIntervalSince1970)" }
}
