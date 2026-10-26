import Defaults
import LocalAuthentication
import SwiftUI

/// Asks for the fingerprint (or the Mac password) before the AI chat opens, so the signed-in session is not open to anyone
/// who walks up to the Mac. The sign-in itself stays saved by the web view, so it is not repeated.
@MainActor
final class AILock: ObservableObject {
    static let shared = AILock()
    @Published private(set) var unlocked = false
    @Published private(set) var failed = false
    private var unlockedAt: Date?

    init() {
        // The Mac locking or sleeping always locks the chat again.
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.lock() }
        }
        DistributedNotificationCenter.default().addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.lock() }
        }
    }

    /// Called when the notch closes: lock again only once the chosen time has passed.
    func lockIfExpired() {
        let minutes = Defaults[.aiLockMinutes]
        if minutes < 0 { return }
        if minutes > 0, let unlockedAt, Date().timeIntervalSince(unlockedAt) < Double(minutes) * 60 { return }
        lock()
    }

    var required: Bool { Defaults[.aiTouchID] }

    #if DEBUG
    func debugLog(_ text: String) {
        try? text.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("lock-state.txt"), atomically: true, encoding: .utf8)
    }
    #endif

    nonisolated static var biometricsAvailable: Bool {
        var error: NSError?
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    func lock() {
        unlocked = false
        failed = false
    }

    func unlock() {
        guard !unlocked else { return }
        let context = LAContext()
        context.localizedFallbackTitle = "Usar la contraseña del Mac"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Abrir el chat de IA") { ok, error in
            #if DEBUG
            try? "ok=\(ok) error=\(String(describing: error))\n".write(
                to: FileManager.default.temporaryDirectory.appendingPathComponent("lock-debug.txt"), atomically: true, encoding: .utf8)
            #endif
            Task { @MainActor in
                self.unlocked = ok
                self.failed = !ok
                if ok { self.unlockedAt = Date() }
            }
        }
    }
}

struct AILockView: View {
    @ObservedObject var lock = AILock.shared

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "touchid")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(.white.opacity(0.85))
            Text("Chat de IA bloqueado")
                .font(.system(size: 14, weight: .semibold))
            Text(lock.failed ? "No se pudo verificar. Inténtalo de nuevo." : "Usa tu huella para abrirlo.")
                .font(.system(size: 12))
                .foregroundStyle(.gray)
            Button("Usar huella") { lock.unlock() }
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { lock.unlock() }
    }
}
