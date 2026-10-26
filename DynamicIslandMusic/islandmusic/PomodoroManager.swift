import AppKit
import AVFoundation
import Combine
import Defaults
import SwiftUI
import UserNotifications

/// Pomodoro timer. Any duration is allowed and the end plays a sound that can be configured in Settings.
@MainActor
final class PomodoroManager: ObservableObject {
    static let shared = PomodoroManager()

    enum Phase { case focus, rest }

    @Published private(set) var phase: Phase = .focus
    @Published private(set) var remaining: TimeInterval = Defaults[.pomoFocusSeconds]
    @Published private(set) var isRunning = false
    @Published private(set) var sprint = 1
    @Published var editingTime = false

    private var endDate: Date?
    private var timer: Timer?
    private var player: AVAudioPlayer?
    private var soundRepeatsLeft = 0

    static let systemSounds = ["Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero", "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink"]

    private init() {}

    var phaseDuration: TimeInterval {
        phase == .focus ? Defaults[.pomoFocusSeconds] : Defaults[.pomoRestSeconds]
    }

    var progress: Double {
        let d = phaseDuration
        return d > 0 ? min(1, max(0, 1 - remaining / d)) : 0
    }

    var isActive: Bool { isRunning }

    var label: String {
        phase == .focus ? "Concentración (\(sprint)/\(Defaults[.pomoSprints]))" : "Descanso"
    }

    // MARK: Controls

    func toggle() { isRunning ? pause() : start() }

    func start() {
        guard remaining > 0 else { return }
        if Defaults[.pomoNotify] { Self.requestNotificationPermission() }
        endDate = Date().addingTimeInterval(remaining)
        isRunning = true
        schedule()
    }

    func pause() {
        if let endDate { remaining = max(0, endDate.timeIntervalSinceNow) }
        isRunning = false
        timer?.invalidate()
        timer = nil
        endDate = nil
    }

    func reset() {
        pause()
        stopSound()
        phase = .focus
        sprint = 1
        remaining = Defaults[.pomoFocusSeconds]
    }

    func skip() {
        let wasRunning = isRunning
        pause()
        advancePhase()
        if wasRunning { start() }
    }

    /// Sets the time of the current phase (seconds). Called from the notch or from Settings.
    func setCurrentDuration(_ seconds: TimeInterval) {
        guard seconds > 0 else { return }
        if phase == .focus { Defaults[.pomoFocusSeconds] = seconds } else { Defaults[.pomoRestSeconds] = seconds }
        pause()
        remaining = seconds
    }

    /// Call when the focus or rest duration changes in Settings.
    func durationsChanged() {
        if !isRunning { remaining = phaseDuration }
    }

    // MARK: Internals

    private func schedule() {
        timer?.invalidate()
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard let endDate else { return }
        let left = endDate.timeIntervalSinceNow
        if left <= 0 {
            remaining = 0
            finish()
        } else {
            remaining = left
        }
    }

    private func finish() {
        timer?.invalidate()
        timer = nil
        endDate = nil
        isRunning = false
        let finishedFocus = phase == .focus
        playEndSound()
        if Defaults[.pomoNotify] { postNotification(finishedFocus: finishedFocus) }
        if Defaults[.pomoOpenOnFinish] {
            NotificationCenter.default.post(name: .pomodoroFinished, object: nil)
        }
        advancePhase()
        if Defaults[.pomoAutoNext] { start() }
    }

    private func advancePhase() {
        if phase == .focus {
            phase = .rest
            remaining = Defaults[.pomoRestSeconds]
        } else {
            phase = .focus
            sprint = sprint >= Defaults[.pomoSprints] ? 1 : sprint + 1
            remaining = Defaults[.pomoFocusSeconds]
        }
    }

    // MARK: Sound

    func playEndSound() {
        guard Defaults[.pomoSoundEnabled] else { return }
        soundRepeatsLeft = max(1, Defaults[.pomoSoundRepeat])
        playOnce()
    }

    func previewSound() {
        soundRepeatsLeft = 1
        playOnce()
    }

    func stopSound() {
        soundRepeatsLeft = 0
        player?.stop()
        NSSound(named: NSSound.Name(Defaults[.pomoSoundName]))?.stop()
    }

    private func playOnce() {
        guard soundRepeatsLeft > 0 else { return }
        soundRepeatsLeft -= 1
        let volume = Float(Defaults[.pomoSoundVolume])
        if let url = customSoundURL() {
            let scoped = url.startAccessingSecurityScopedResource()
            if let p = try? AVAudioPlayer(contentsOf: url) {
                p.volume = volume
                p.play()
                player = p
                scheduleNext(after: p.duration, scopedURL: scoped ? url : nil)
                return
            }
            if scoped { url.stopAccessingSecurityScopedResource() }
        }
        if let s = NSSound(named: NSSound.Name(Defaults[.pomoSoundName])) {
            s.volume = volume
            s.play()
            scheduleNext(after: max(s.duration, 0.6), scopedURL: nil)
        } else {
            NSSound.beep()
        }
    }

    private func scheduleNext(after seconds: TimeInterval, scopedURL: URL?) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds + 0.25) { [weak self] in
            scopedURL?.stopAccessingSecurityScopedResource()
            self?.playOnce()
        }
    }

    private func customSoundURL() -> URL? {
        guard let data = Defaults[.pomoCustomSound] else { return nil }
        var stale = false
        return try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale)
    }

    func chooseCustomSound() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        panel.allowsMultipleSelection = false
        panel.message = "Elige el sonido que sonará cuando termine el Pomodoro"
        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .OK, let url = panel.url,
           let data = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        {
            Defaults[.pomoCustomSound] = data
        }
    }

    func clearCustomSound() { Defaults[.pomoCustomSound] = nil }

    var customSoundName: String? { customSoundURL()?.lastPathComponent }

    // MARK: Notification

    static func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func postNotification(finishedFocus: Bool) {
        let content = UNMutableNotificationContent()
        content.title = finishedFocus ? "Terminó la concentración" : "Terminó el descanso"
        content.body = finishedFocus ? "Toma un descanso." : "Vuelve a concentrarte."
        content.sound = nil
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}

// MARK: - Time formatting and parsing

enum TimeText {
    /// 90 -> "1:30", 5400 -> "1:30:00"
    static func clock(_ seconds: TimeInterval) -> String {
        let s = Int(seconds.rounded(.up))
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, r) }
        return String(format: "%d:%02d", m, r)
    }

    /// Accepts "25" (minutes), "1,5" (minutes), "0:30" (mm:ss) and "1:30:00" (h:mm:ss).
    static func parse(_ text: String) -> TimeInterval? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return nil }
        if t.contains(":") {
            let parts = t.split(separator: ":", omittingEmptySubsequences: false).map { Double($0) }
            guard parts.count <= 3, !parts.contains(where: { $0 == nil || $0! < 0 }) else { return nil }
            let v = parts.map { $0! }
            if v.count == 3 { return v[0] * 3600 + v[1] * 60 + v[2] }
            if v[1] > 59 { return nil }
            return v[0] * 60 + v[1]
        }
        guard let n = Double(t.replacingOccurrences(of: ",", with: ".")), n > 0 else { return nil }
        return (n * 60).rounded()
    }
}
