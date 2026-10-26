//
//  DynamicIslandMusicApp.swift
//  DynamicIslandMusicApp
//
//  Created by Harsh Vardhan  Goswami  on 02/08/24.
//

import AVFoundation
import Combine
import notify
import Defaults
import KeyboardShortcuts
import Sparkle
import SwiftUI

@main
struct DynamicNotchApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @Default(.menubarIcon) var showMenuBarIcon
    @Environment(\.openWindow) var openWindow

    let updaterController: SPUStandardUpdaterController

    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)

        // Initialize the settings window controller with the updater controller
        SettingsWindowController.shared.setUpdaterController(updaterController)
    }

    var body: some Scene {
        MenuBarExtra("Dynamic Island Music", systemImage: "sparkle", isInserted: $showMenuBarIcon) {
            Button("Settings") {
                SettingsWindowController.shared.showWindow()
            }
            .keyboardShortcut(KeyEquivalent(","), modifiers: .command)
            Divider()
            Button("Reiniciar la app") {
                ApplicationRelauncher.restart()
            }
            Button("Quit", role: .destructive) {
                NSApplication.shared.terminate(self)
            }
            .keyboardShortcut(KeyEquivalent("Q"), modifiers: .command)
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var windows: [String: NSWindow] = [:] // UUID -> NSWindow
    var viewModels: [String: IslandViewModel] = [:] // UUID -> IslandViewModel
    var window: NSWindow?
    let vm: IslandViewModel = .init()
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    var quickShareService = QuickShareService.shared
    var whatsNewWindow: NSWindow?
    var timer: Timer?
    var closeNotchTask: Task<Void, Never>?
    private var previousScreens: [NSScreen]?
    private var onboardingWindowController: NSWindowController?
    private var screenLockedObserver: Any?
    private var screenUnlockedObserver: Any?
    private var isScreenLocked: Bool = false
    private var windowScreenDidChangeObserver: Any?
    private var dragDetectors: [String: DragDetector] = [:] // UUID -> DragDetector
    private var sizeObservers: [ObjectIdentifier: AnyCancellable] = [:]

    /// The window only covers what is needed, so it never blocks clicks in the menu bar around the notch.
    private func observeWindowSize(_ window: NSWindow, viewModel: IslandViewModel) {
        sizeObservers[ObjectIdentifier(window)] = Publishers.CombineLatest(
                viewModel.$notchSize,
                Defaults.publisher(.islandOffsetX).map(\.newValue))
            .receive(on: RunLoop.main)
            .sink { [weak self, weak window, weak viewModel] size, _ in
                guard let self, let window, let viewModel else { return }
                self.fitWindow(window, notchSize: size, viewModel: viewModel, delayShrink: true)
            }
    }

    /// Window size needed around the notch: its width plus room for the glow, and enough height for the open panel.
    private func windowTarget(for notchSize: CGSize) -> CGSize {
        CGSize(
            width: min(windowSize.width, max(640, notchSize.width + 2 * windowSidePadding)),
            height: max(windowSize.height, notchSize.height + editExtraHeight + shadowPadding))
    }

    private func fitWindow(_ window: NSWindow, notchSize: CGSize, viewModel: IslandViewModel, delayShrink: Bool) {
        let desired = windowTarget(for: notchSize)
        let screenNow = viewModel.screenUUID.flatMap { NSScreen.screen(withUUID: $0) } ?? window.screen ?? NSScreen.main
        let wantedX = screenNow.map { islandCenterX(on: $0, windowWidth: desired.width) - desired.width / 2 } ?? window.frame.minX
        guard abs(desired.width - window.frame.width) > 0.5 || abs(desired.height - window.frame.height) > 0.5
                || abs(wantedX - window.frame.minX) > 0.5 else { return }
        let apply = { [weak window, weak viewModel] in
            guard let window, let viewModel else { return }
            let target = self.windowTarget(for: viewModel.notchSize)
            let screen = viewModel.screenUUID.flatMap { NSScreen.screen(withUUID: $0) } ?? window.screen ?? NSScreen.main
            guard let frame = screen?.frame else { return }
            let centerX = self.islandCenterX(on: screen ?? NSScreen.main!, windowWidth: target.width)
            window.setFrame(
                NSRect(x: centerX - target.width / 2, y: frame.maxY - target.height, width: target.width, height: target.height),
                display: true)
        }
        if delayShrink && (desired.width < window.frame.width || desired.height < window.frame.height) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55, execute: apply)
        } else {
            apply()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        NotificationCenter.default.removeObserver(self)
        if let observer = screenLockedObserver {
            DistributedNotificationCenter.default().removeObserver(observer)
            screenLockedObserver = nil
        }
        if let observer = screenUnlockedObserver {
            DistributedNotificationCenter.default().removeObserver(observer)
            screenUnlockedObserver = nil
        }
        MusicManager.shared.destroy()
        cleanupDragDetectors()
        cleanupWindows()
    }

    @MainActor
    func onScreenLocked(_ notification: Notification) {
        isScreenLocked = true
        if !Defaults[.showOnLockScreen] {
            cleanupWindows()
        } else {
            enableSkyLightOnAllWindows()
        }
    }

    @MainActor
    func onScreenUnlocked(_ notification: Notification) {
        isScreenLocked = false
        if !Defaults[.showOnLockScreen] {
            adjustWindowPosition(changeAlpha: true)
        } else {
            disableSkyLightOnAllWindows()
        }
    }
    
    @MainActor
    private func enableSkyLightOnAllWindows() {
        if Defaults[.showOnAllDisplays] {
            windows.values.forEach { window in
                if let skyWindow = window as? DynamicIslandMusicSkyLightWindow {
                    skyWindow.enableSkyLight()
                }
            }
        } else {
            if let skyWindow = window as? DynamicIslandMusicSkyLightWindow {
                skyWindow.enableSkyLight()
            }
        }
    }
    
    @MainActor
    private func disableSkyLightOnAllWindows() {
        // Delay disabling SkyLight to avoid flicker during unlock transition
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            await MainActor.run {
                if Defaults[.showOnAllDisplays] {
                    self.windows.values.forEach { window in
                        if let skyWindow = window as? DynamicIslandMusicSkyLightWindow {
                            skyWindow.disableSkyLight()
                        }
                    }
                } else {
                    if let skyWindow = self.window as? DynamicIslandMusicSkyLightWindow {
                        skyWindow.disableSkyLight()
                    }
                }
            }
        }
    }

    private func cleanupWindows(shouldInvert: Bool = false) {
        let shouldCleanupMulti = shouldInvert ? !Defaults[.showOnAllDisplays] : Defaults[.showOnAllDisplays]
        
        if shouldCleanupMulti {
            windows.values.forEach { window in
                window.close()
                NotchSpaceManager.shared.notchSpace.windows.remove(window)
            }
            windows.removeAll()
            viewModels.removeAll()
        } else if let window = window {
            window.close()
            NotchSpaceManager.shared.notchSpace.windows.remove(window)
            if let obs = windowScreenDidChangeObserver {
                NotificationCenter.default.removeObserver(obs)
                windowScreenDidChangeObserver = nil
            }
            self.window = nil
        }
    }

    private func cleanupDragDetectors() {
        dragDetectors.values.forEach { detector in
            detector.stopMonitoring()
        }
        dragDetectors.removeAll()
    }

    private func setupDragDetectors() {
        cleanupDragDetectors()

        guard Defaults[.expandedDragDetection] else { return }

        if Defaults[.showOnAllDisplays] {
            for screen in NSScreen.screens {
                setupDragDetectorForScreen(screen)
            }
        } else {
            let preferredScreen: NSScreen? = window?.screen
                ?? NSScreen.screen(withUUID: coordinator.selectedScreenUUID)
                ?? NSScreen.main

            if let screen = preferredScreen {
                setupDragDetectorForScreen(screen)
            }
        }
    }

    private func setupDragDetectorForScreen(_ screen: NSScreen) {
        guard let uuid = screen.displayUUID else { return }
        
        let screenFrame = screen.frame
        // Only a small zone around the closed notch reacts to a dragged file, so moving a file across the top of
        // the screen does not open the shelf by accident.
        let closedSize = getClosedNotchSize(screenUUID: uuid)
        let notchHeight = closedSize.height + 20
        let notchWidth = closedSize.width + 110
        
        // Create notch region at the top-center of the screen, right around the closed notch
        let notchRegion = CGRect(
            x: screenFrame.midX - notchWidth / 2,
            y: screenFrame.maxY - notchHeight,
            width: notchWidth,
            height: notchHeight
        )
        
        let detector = DragDetector(notchRegion: notchRegion)
        
        detector.onDragEntersNotchRegion = { [weak self] in
            Task { @MainActor in
                self?.handleDragEntersNotchRegion(onScreen: screen)
            }
        }
        
        dragDetectors[uuid] = detector
        detector.startMonitoring()
    }

    private func handleDragEntersNotchRegion(onScreen screen: NSScreen) {
        guard let uuid = screen.displayUUID else { return }
        
        if Defaults[.showOnAllDisplays], let viewModel = viewModels[uuid] {
            viewModel.open()
            coordinator.currentView = .shelf
        } else if !Defaults[.showOnAllDisplays], let windowScreen = window?.screen, screen == windowScreen {
            vm.open()
            coordinator.currentView = .shelf
        }
    }

    private func createDynamicIslandMusicWindow(for screen: NSScreen, with viewModel: IslandViewModel) -> NSWindow {
        let rect = NSRect(x: 0, y: 0, width: windowSize.width, height: windowSize.height)
        let styleMask: NSWindow.StyleMask = [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow]
        
        let window = DynamicIslandMusicSkyLightWindow(contentRect: rect, styleMask: styleMask, backing: .buffered, defer: false)
        
        // Enable SkyLight only when screen is locked
        if isScreenLocked {
            window.enableSkyLight()
        } else {
            window.disableSkyLight()
        }

        window.contentView = NSHostingView(
            rootView: ContentView()
                .environmentObject(viewModel)
        )

        window.orderFrontRegardless()
        NotchSpaceManager.shared.notchSpace.windows.insert(window)
        observeWindowSize(window, viewModel: viewModel)

        // Observe when the window's screen changes so we can update drag detectors
        windowScreenDidChangeObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didChangeScreenNotification,
            object: window,
            queue: .main) { [weak self] _ in
                Task { @MainActor in
                    self?.setupDragDetectors()
                }
        }
        return window
    }

    /// Center of the island: over the camera notch when there is one, otherwise the middle of the screen plus the
    /// offset chosen in Settings (kept inside the screen).
    private func islandCenterX(on screen: NSScreen, windowWidth: CGFloat) -> CGFloat {
        let frame = screen.frame
        guard screen.safeAreaInsets.top == 0 else { return frame.midX }
        let room = max(0, frame.width / 2 - windowWidth / 2)
        let offset = max(-room, min(room, CGFloat(Defaults[.islandOffsetX])))
        return frame.midX + offset
    }

    @MainActor
    private func positionWindow(_ window: NSWindow, on screen: NSScreen, changeAlpha: Bool = false) {
        if changeAlpha {
            window.alphaValue = 0
        }

        let screenFrame = screen.frame
        window.setFrameOrigin(
            NSPoint(
                x: islandCenterX(on: screen, windowWidth: window.frame.width) - window.frame.width / 2,
                y: screenFrame.origin.y + screenFrame.height - window.frame.height
            ))
        window.alphaValue = 1
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        BeatPulse.shared.applyPreference()
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            await AISessionBackup.shared.restoreIfFresh()
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenConfigurationDidChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            forName: Notification.Name.selectedScreenChanged, object: nil, queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                self?.adjustWindowPosition(changeAlpha: true)
                self?.setupDragDetectors()
            }
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name.notchHeightChanged, object: nil, queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                self?.adjustWindowPosition()
                self?.setupDragDetectors()
            }
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name.automaticallySwitchDisplayChanged, object: nil, queue: nil
        ) { [weak self] _ in
            guard let self = self, let window = self.window else { return }
            Task { @MainActor in
                window.alphaValue = self.coordinator.selectedScreenUUID == self.coordinator.preferredScreenUUID ? 1 : 0
            }
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name.showOnAllDisplaysChanged, object: nil, queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                self.cleanupWindows(shouldInvert: true)
                self.adjustWindowPosition(changeAlpha: true)
                self.setupDragDetectors()
            }
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name.expandedDragDetectionChanged, object: nil, queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                self?.setupDragDetectors()
            }
        }

        // Use closure-based observers for DistributedNotificationCenter and keep tokens for removal
        screenLockedObserver = DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name(rawValue: "com.apple.screenIsLocked"),
            object: nil, queue: .main) { [weak self] notification in
                Task { @MainActor in
                    self?.onScreenLocked(notification)
                }
        }

        screenUnlockedObserver = DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name(rawValue: "com.apple.screenIsUnlocked"),
            object: nil, queue: .main) { [weak self] notification in
                Task { @MainActor in
                    self?.onScreenUnlocked(notification)
                }
        }

        KeyboardShortcuts.onKeyDown(for: .toggleSneakPeek) { [weak self] in
            guard let self = self else { return }
            if Defaults[.sneakPeekStyles] == .inline {
                let newStatus = !self.coordinator.expandingView.show
                self.coordinator.toggleExpandingView(status: newStatus, type: .music)
            } else {
                self.coordinator.toggleSneakPeek(
                    status: !self.coordinator.sneakPeek.show,
                    type: .music,
                    duration: 3.0
                )
            }
        }

        KeyboardShortcuts.onKeyDown(for: .toggleNotchOpen) { [weak self] in
            Task { [weak self] in
                guard let self = self else { return }

                let mouseLocation = NSEvent.mouseLocation

                var viewModel = self.vm

                if Defaults[.showOnAllDisplays] {
                    for screen in NSScreen.screens {
                        if screen.frame.contains(mouseLocation) {
                            if let uuid = screen.displayUUID, let screenViewModel = self.viewModels[uuid] {
                                viewModel = screenViewModel
                                break
                            }
                        }
                    }
                }

                self.closeNotchTask?.cancel()
                self.closeNotchTask = nil

                switch viewModel.notchState {
                case .closed:
                    await MainActor.run {
                        viewModel.open()
                    }

                    let task = Task { [weak viewModel] in
                        do {
                            try await Task.sleep(for: .seconds(3))
                            await MainActor.run {
                                viewModel?.close()
                            }
                        } catch { }
                    }
                    self.closeNotchTask = task
                case .open:
                    await MainActor.run {
                        viewModel.close()
                    }
                }
            }
        }

        #if DEBUG
        installDebugHooks()
        #endif

        if !Defaults[.showOnAllDisplays] {
            let viewModel = self.vm
            let window = createDynamicIslandMusicWindow(
                for: NSScreen.main ?? NSScreen.screens.first!, with: viewModel)
            self.window = window
            adjustWindowPosition(changeAlpha: true)
        } else {
            adjustWindowPosition(changeAlpha: true)
        }

        setupDragDetectors()

        if coordinator.firstLaunch {
            DispatchQueue.main.async {
                self.showOnboardingWindow()
            }
            playWelcomeSound()
        } else if MusicManager.shared.isNowPlayingDeprecated
            && (Defaults[.mediaController] == .nowPlaying || Defaults[.mediaController] == .automatic)
        {
            DispatchQueue.main.async {
                self.showOnboardingWindow(step: .musicPermission)
            }
        }
        if Defaults[.hudReplacement] {
            Task { @MainActor in
               let authorized = await XPCHelperClient.shared.isAccessibilityAuthorized()
                if authorized {
                    MediaKeyInterceptor.shared.start(requireAccessibility: true, promptIfNeeded: false)
                } else {
                    let granted = await XPCHelperClient.shared.ensureAccessibilityAuthorization(promptIfNeeded: false)
                    if granted {
                        MediaKeyInterceptor.shared.start(requireAccessibility: true, promptIfNeeded: false)
                    }
                }
            }
        }

        previousScreens = NSScreen.screens
    }

    #if DEBUG
    /// Test hooks, only in debug builds: `notifyutil -p dim.debug.open`, `dim.debug.tab.chat`, ...
    private func installDebugHooks() {
        func hook(_ name: String, _ action: @escaping @MainActor () -> Void) {
            var token: Int32 = 0
            notify_register_dispatch(name, &token, DispatchQueue.main) { _ in
                Task { @MainActor in action() }
            }
        }
        hook("dim.debug.open") { withAnimation { self.vm.open() } }
        hook("dim.debug.close") { withAnimation { self.vm.close() } }
        hook("dim.debug.tab.home") { self.coordinator.currentView = .home }
        hook("dim.debug.tab.chat") { self.coordinator.currentView = .chat }
        hook("dim.debug.tab.clipboard") { self.coordinator.currentView = .clipboard }
        hook("dim.debug.tab.game") { self.coordinator.currentView = .game }
        hook("dim.debug.tab.shelf") { self.coordinator.currentView = .shelf }
        hook("dim.debug.edit.on") { LayoutManager.shared.editing = true }
        hook("dim.debug.edit.off") { LayoutManager.shared.editing = false }
        hook("dim.debug.pomo.toggle") { PomodoroManager.shared.toggle() }
        hook("dim.debug.pomo.short") { PomodoroManager.shared.setCurrentDuration(5); PomodoroManager.shared.start() }
        hook("dim.debug.settings") { SettingsWindowController.shared.showWindow() }
        hook("dim.debug.enable.all") { for c in IslandComponent.allCases { LayoutManager.shared.setEnabled(c, true) } }
        hook("dim.debug.reset") { LayoutManager.shared.reset() }
        hook("dim.debug.ai.probe") { AIWebStore.shared.debugProbe() }
        hook("dim.debug.ai.setcookie") { AIWebStore.shared.debugSetSessionCookie() }
        hook("dim.debug.backup.write") { AIWebStore.shared.debugBackupTest(step: "write") }
        hook("dim.debug.backup.delete") { AIWebStore.shared.debugBackupTest(step: "delete") }
        hook("dim.debug.backup.default") { AIWebStore.shared.debugBackupTest(step: "default") }
        hook("dim.debug.backup.read") { AIWebStore.shared.debugBackupTest(step: "read") }
        hook("dim.debug.cookie.names") { AIWebStore.shared.debugCookieNames() }
        hook("dim.debug.cookie.set") { AIWebStore.shared.debugCookie(set: true) }
        hook("dim.debug.cookie.dump") { AIWebStore.shared.debugCookie(set: false) }
        hook("dim.debug.ai.claude") { AIChatManager.shared.provider = .claude }
        hook("dim.debug.ai.chatgpt") { AIChatManager.shared.provider = .openai }
        hook("dim.debug.ai.gemini") { AIChatManager.shared.provider = .gemini }
        hook("dim.debug.ai.deepseek") { AIChatManager.shared.provider = .deepseek }
        hook("dim.debug.settings.performance") {
            SettingsRouter.shared.requested = .performance
            SettingsWindowController.shared.showWindow()
        }
        hook("dim.debug.perf.on") {
            LayoutManager.shared.setEnabled(.camera, false)
            LayoutManager.shared.setEnabled(.performance, true)
        }
        hook("dim.debug.perf.off") {
            LayoutManager.shared.setEnabled(.performance, false)
            LayoutManager.shared.setEnabled(.camera, true)
        }
        hook("dim.debug.gap.small") { MenuBarSpace.shared.debugForce(gap: 10) }
        hook("dim.debug.gap.clear") { MenuBarSpace.shared.debugForce(gap: nil) }
    }
    #endif

    func playWelcomeSound() {
        // No welcome sound: the original one belongs to Dynamic Island Music.
    }

    func deviceHasNotch() -> Bool {
        if #available(macOS 12.0, *) {
            for screen in NSScreen.screens {
                if screen.safeAreaInsets.top > 0 {
                    return true
                }
            }
        }
        return false
    }

    @objc func screenConfigurationDidChange() {
        let currentScreens = NSScreen.screens

        let screensChanged =
            currentScreens.count != previousScreens?.count
            || Set(currentScreens.compactMap { $0.displayUUID })
                != Set(previousScreens?.compactMap { $0.displayUUID } ?? [])
            || Set(currentScreens.map { $0.frame }) != Set(previousScreens?.map { $0.frame } ?? [])

        previousScreens = currentScreens

        if screensChanged {
            DispatchQueue.main.async { [weak self] in
                self?.cleanupWindows()
                self?.adjustWindowPosition()
                self?.setupDragDetectors()
            }
        }
    }

    @objc func adjustWindowPosition(changeAlpha: Bool = false) {
        if Defaults[.showOnAllDisplays] {
            let currentScreenUUIDs = Set(NSScreen.screens.compactMap { $0.displayUUID })

            // Remove windows for screens that no longer exist
            for uuid in windows.keys where !currentScreenUUIDs.contains(uuid) {
                if let window = windows[uuid] {
                    window.close()
                    NotchSpaceManager.shared.notchSpace.windows.remove(window)
                    windows.removeValue(forKey: uuid)
                    viewModels.removeValue(forKey: uuid)
                }
            }

            // Create or update windows for all screens
            for screen in NSScreen.screens {
                guard let uuid = screen.displayUUID else { continue }
                
                if windows[uuid] == nil {
                    let viewModel = IslandViewModel(screenUUID: uuid)
                    let window = createDynamicIslandMusicWindow(for: screen, with: viewModel)

                    windows[uuid] = window
                    viewModels[uuid] = viewModel
                }

                if let window = windows[uuid], let viewModel = viewModels[uuid] {
                    positionWindow(window, on: screen, changeAlpha: changeAlpha)

                    if viewModel.notchState == .closed {
                        viewModel.close()
                    }
                }
            }
        } else {
            let selectedScreen: NSScreen

            if let preferredScreen = NSScreen.screen(withUUID: coordinator.preferredScreenUUID ?? "") {
                coordinator.selectedScreenUUID = coordinator.preferredScreenUUID ?? ""
                selectedScreen = preferredScreen
            } else if Defaults[.automaticallySwitchDisplay], let mainScreen = NSScreen.main,
                      let mainUUID = mainScreen.displayUUID {
                coordinator.selectedScreenUUID = mainUUID
                selectedScreen = mainScreen
            } else {
                if let window = window {
                    window.alphaValue = 0
                }
                return
            }

            vm.screenUUID = selectedScreen.displayUUID
            vm.notchSize = getClosedNotchSize(screenUUID: selectedScreen.displayUUID)

            if window == nil {
                window = createDynamicIslandMusicWindow(for: selectedScreen, with: vm)
            }

            if let window = window {
                positionWindow(window, on: selectedScreen, changeAlpha: changeAlpha)

                if vm.notchState == .closed {
                    vm.close()
                }
            }
        }
    }

    @objc func togglePopover(_ sender: Any?) {
        if window?.isVisible == true {
            window?.orderOut(nil)
        } else {
            window?.orderFrontRegardless()
        }
    }

    @objc func showMenu() {
        statusItem?.menu?.popUp(positioning: nil, at: NSEvent.mouseLocation, in: nil)
    }

    @objc func quitAction() {
        NSApplication.shared.terminate(self)
    }

    private func showOnboardingWindow(step: OnboardingStep = .welcome) {
        if onboardingWindowController == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 400, height: 600),
                styleMask: [.titled, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            window.center()
            window.title = "Onboarding"
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.contentView = NSHostingView(
                rootView: OnboardingView(
                    step: step,
                    onFinish: {
                        window.orderOut(nil)
//                        NSApp.setActivationPolicy(.accessory)
                        window.close()
                        NSApp.deactivate()
                    },
                    onOpenSettings: {
                        window.close()
                        SettingsWindowController.shared.showWindow()
                    }
                ))
            window.isRestorable = false
            window.identifier = NSUserInterfaceItemIdentifier("OnboardingWindow")

            onboardingWindowController = NSWindowController(window: window)
        }

//        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        onboardingWindowController?.window?.makeKeyAndOrderFront(nil)
        onboardingWindowController?.window?.orderFrontRegardless()
    }
}

extension Notification.Name {
    static let selectedScreenChanged = Notification.Name("SelectedScreenChanged")
    static let notchHeightChanged = Notification.Name("NotchHeightChanged")
    static let showOnAllDisplaysChanged = Notification.Name("showOnAllDisplaysChanged")
    static let automaticallySwitchDisplayChanged = Notification.Name("automaticallySwitchDisplayChanged")
    static let expandedDragDetectionChanged = Notification.Name("expandedDragDetectionChanged")
}

extension CGRect: @retroactive Hashable {
    public func hash(into hasher: inout Hasher) {
        hasher.combine(origin.x)
        hasher.combine(origin.y)
        hasher.combine(size.width)
        hasher.combine(size.height)
    }

    public static func == (lhs: CGRect, rhs: CGRect) -> Bool {
        return lhs.origin == rhs.origin && lhs.size == rhs.size
    }
}
