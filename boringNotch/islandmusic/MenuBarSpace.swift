import AppKit
import Combine

/// Free room in the menu bar on each side of the camera notch. The closed notch uses it so its sides never cover a
/// menu title or a status icon; when those move, the notch follows and stays centered.
@MainActor
final class MenuBarSpace: ObservableObject {
    static let shared = MenuBarSpace()

    /// Free points between the notch and the last menu title on the left (nil = not known).
    @Published private(set) var left: CGFloat?
    /// Free points between the notch and the first status icon on the right (nil = not known).
    @Published private(set) var right: CGFloat?

    private var users = 0
    private var timer: Timer?
    private var tokens: [NSObjectProtocol] = []
    private var screenUUID: String?
    private var measuring = false

    func start(screenUUID: String?) {
        self.screenUUID = screenUUID
        users += 1
        guard users == 1 else { refresh(); return }
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didActivateApplicationNotification, NSWorkspace.activeSpaceDidChangeNotification] {
            tokens.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            })
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    func stop() {
        users = max(0, users - 1)
        guard users == 0 else { return }
        timer?.invalidate()
        timer = nil
        tokens.forEach { NSWorkspace.shared.notificationCenter.removeObserver($0) }
        tokens.removeAll()
    }

    #if DEBUG
    private var forced = false
    /// Test hook: pretend the menu bar is full (small gaps) or measured normally again (nil).
    func debugForce(gap: CGFloat?) {
        forced = gap != nil
        if let gap { left = gap; right = gap } else { refresh() }
    }
    #endif

    func refresh() {
        #if DEBUG
        if forced { return }
        #endif
        guard !measuring else { return }
        guard let screen = screenUUID.flatMap({ NSScreen.screen(withUUID: $0) }) ?? NSScreen.main,
              let leftArea = screen.auxiliaryTopLeftArea, let rightArea = screen.auxiliaryTopRightArea else {
            left = nil
            right = nil
            return
        }
        let notchLeft = leftArea.maxX
        let notchRight = rightArea.minX
        let screenRight = screen.frame.maxX
        // Screen coordinates here have their origin at the top left of the main display.
        let topY = (NSScreen.screens.first?.frame.maxY ?? screen.frame.maxY) - screen.frame.maxY
        let screenLeft = screen.frame.minX

        measuring = true
        Task.detached {
            let gaps = await XPCHelperClient.shared.menuBarGaps(
                notchLeft: notchLeft, notchRight: notchRight, screenLeft: screenLeft, screenRight: screenRight, y: topY + 12)
            await MainActor.run {
                self.left = gaps?.left
                self.right = gaps?.right
                self.measuring = false
                #if DEBUG
                let line = gaps.map { String(format: "left=%.0f right=%.0f\n", $0.left, $0.right) } ?? "unknown\n"
                try? line.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("menubar.txt"), atomically: true, encoding: .utf8)
                #endif
            }
        }
    }
}
