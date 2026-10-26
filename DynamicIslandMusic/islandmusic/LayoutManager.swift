import AppKit
import Combine
import Defaults
import SwiftUI

/// Keeps the list of components of the open notch: order, size, on/off, pages and edit mode.
@MainActor
final class LayoutManager: ObservableObject {
    static let shared = LayoutManager()

    @Published var configs: [ComponentConfig] {
        didSet {
            Defaults[.islandComponents] = configs
            NotificationCenter.default.post(name: .islandLayoutChanged, object: nil)
        }
    }
    @Published var editing = false {
        didSet { NotificationCenter.default.post(name: .islandLayoutChanged, object: nil) }
    }
    /// Component being dragged in edit mode (not persisted).
    var draggedComponent: IslandComponent?

    @Published var pageIndex = 0 {
        didSet { NotificationCenter.default.post(name: .islandLayoutChanged, object: nil) }
    }

    /// Horizontal padding that wraps all the components inside the notch (design units).
    static let sidePadding: CGFloat = 14
    /// Height of the row of components in design units, before the scale.
    static let designHeight: CGFloat = 140

    var scale: CGFloat { CGFloat(max(0.5, min(1.2, Defaults[.uiScale]))) }

    private init() {
        var stored = Defaults[.islandComponents]
        // Make sure every known component exists (new versions can add components).
        for c in IslandComponent.allCases where !stored.contains(where: { $0.id == c }) {
            stored.append(ComponentConfig(id: c, enabled: false, width: c.defaultWidth))
        }
        configs = stored
    }

    // MARK: Capacity

    /// Maximum open width for a screen: about 72 % of the screen, never more than 1300 pt.
    func capacity(for screenUUID: String?) -> CGFloat {
        if Defaults[.manualSize] { return CGFloat(Defaults[.manualOpenWidth]) }
        let screen = screenUUID.flatMap { NSScreen.screen(withUUID: $0) } ?? NSScreen.main
        let w = screen?.frame.width ?? 1470
        return min((w * 0.75).rounded(), 1300)
    }

    var enabled: [ComponentConfig] { configs.filter { $0.enabled } }

    /// Components that do not fit on one page go to the next one instead of being squeezed.
    func pages(capacity: CGFloat) -> [[ComponentConfig]] {
        let room = capacity / scale - 2 * Self.sidePadding
        var pages: [[ComponentConfig]] = []
        var current: [ComponentConfig] = []
        var sum: CGFloat = 0
        for c in enabled {
            if !current.isEmpty && sum + c.width > room {
                pages.append(current)
                current = []
                sum = 0
            }
            current.append(c)
            sum += c.width
        }
        if !current.isEmpty { pages.append(current) }
        return pages
    }

    func currentPage(capacity: CGFloat) -> [ComponentConfig] {
        let p = pages(capacity: capacity)
        guard !p.isEmpty else { return [] }
        return p[min(max(pageIndex, 0), p.count - 1)]
    }

    /// Width the open notch needs on the current page.
    func openWidth(for screenUUID: String?) -> CGFloat {
        let cap = capacity(for: screenUUID)
        let page = currentPage(capacity: cap)
        let sum = page.reduce(0) { $0 + $1.width } + 2 * Self.sidePadding
        return max(520, min(cap, sum * scale))
    }

    /// Size of the open notch for the tab that is showing (the home row sizes itself from its components).
    func openSize(for screenUUID: String?, view: NotchViews) -> CGSize {
        let cap = capacity(for: screenUUID)
        let width = view == .home ? openWidth(for: screenUUID) : min(cap, max(680, openWidth(for: screenUUID)))
        var height = 46 + Self.designHeight * scale + 7 + (editing && view == .home ? 34 : 0)
        var finalWidth = width
        if view == .chat {
            // The web chat needs room to read and write; the key-based chat is a bit shorter.
            let web = AIChatManager.shared.usesWeb(AIChatManager.shared.provider)
            height = web ? 440 : 300
            finalWidth = min(cap, 720)
        }
        return CGSize(width: finalWidth, height: height)
    }

    func usage(for screenUUID: String?) -> Double {
        let cap = capacity(for: screenUUID)
        let sum = enabled.reduce(0) { $0 + $1.width } + 2 * Self.sidePadding
        return Double(sum * scale / cap) * 100
    }

    // MARK: Edit

    func isEnabled(_ id: IslandComponent) -> Bool {
        configs.first(where: { $0.id == id })?.enabled ?? false
    }

    func setEnabled(_ id: IslandComponent, _ value: Bool) {
        guard let i = configs.firstIndex(where: { $0.id == id }) else { return }
        configs[i].enabled = value
        clampPage()
    }

    func resize(_ id: IslandComponent, to width: CGFloat) {
        guard let i = configs.firstIndex(where: { $0.id == id }) else { return }
        configs[i].width = max(id.minWidth, min(520, width.rounded()))
    }

    func move(_ id: IslandComponent, before target: IslandComponent) {
        guard id != target,
              let from = configs.firstIndex(where: { $0.id == id }),
              let to = configs.firstIndex(where: { $0.id == target }) else { return }
        let item = configs.remove(at: from)
        let dest = configs.firstIndex(where: { $0.id == target }) ?? to
        configs.insert(item, at: dest)
    }

    func reset() {
        configs = IslandComponent.defaultConfigs
        pageIndex = 0
    }

    private func clampPage() {
        let count = max(1, pages(capacity: capacity(for: nil)).count)
        if pageIndex >= count { pageIndex = count - 1 }
    }
}

extension Notification.Name {
    static let islandLayoutChanged = Notification.Name("islandLayoutChanged")
    static let pomodoroFinished = Notification.Name("pomodoroFinished")
}

// MARK: - Keyboard focus for the notch panel

/// The notch panel never takes keyboard focus by itself. A text field asks for it here, and gives it
/// back when it is done, so typing works without stealing focus from the app you were using.
@MainActor
final class KeyboardFocus: ObservableObject {
    static let shared = KeyboardFocus()
    private(set) var wantsKey = false

    func request() {
        wantsKey = true
        SharingStateManager.shared.preventNotchClose = true
        // The notch floats over whatever app is in front. For typing to reach it, the app has to be the active one:
        // without this the panel never becomes the key window and text fields (and web pages) ignore the keyboard.
        if !NSApp.isActive { NSApp.activate(ignoringOtherApps: true) }
        for w in NSApp.windows where w is DynamicIslandMusicSkyLightWindow {
            w.makeKeyAndOrderFront(nil)
        }
    }

    func release() {
        wantsKey = false
        SharingStateManager.shared.preventNotchClose = false
        for w in NSApp.windows where w is DynamicIslandMusicSkyLightWindow {
            if w.isKeyWindow { w.resignKey() }
        }
    }
}
