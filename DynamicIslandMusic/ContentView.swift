//
//  ContentView.swift
//  boringNotchApp
//
//  Created by Harsh Vardhan Goswami  on 02/08/24
//  Modified by Richard Kunkli on 24/08/2024.
//

import AVFoundation
import Combine
import Defaults
import KeyboardShortcuts
import SwiftUI
import SwiftUIIntrospect

@MainActor
struct ContentView: View {
    @EnvironmentObject var vm: BoringViewModel
    @ObservedObject var webcamManager = WebcamManager.shared

    @ObservedObject var coordinator = BoringViewCoordinator.shared
    @ObservedObject var musicManager = MusicManager.shared
    @ObservedObject var batteryModel = BatteryStatusViewModel.shared
    @ObservedObject var brightnessManager = BrightnessManager.shared
    @ObservedObject var volumeManager = VolumeManager.shared
    @ObservedObject var layoutManager = LayoutManager.shared
    @ObservedObject var pomodoro = PomodoroManager.shared
    @ObservedObject var clipboard = ClipboardManager.shared
    @Default(.glowStyle) var glowStyle
    @Default(.glassAmount) var glassAmount
    @Default(.glowIntensity) var glowIntensity
    @Default(.notchBorder) var notchBorder
    @Default(.glowMotion) var glowMotion
    @Default(.glowSpread) var glowSpread
    @Default(.glowColorMode) var glowColorMode
    @Default(.danceSize) var danceSize
    @Default(.livePomodoro) var livePomodoro
    @Default(.liveControls) var liveControls
    @Default(.livePerformance) var livePerformance
    @Default(.liveBattery) var liveBattery
    @Default(.liveMax) var liveMax
    @Default(.livePriority) var livePriority
    @State private var hoverTask: Task<Void, Never>?
    @State private var isHovering: Bool = false
    @State private var anyDropDebounceTask: Task<Void, Never>?

    @State private var gestureProgress: CGFloat = .zero

    @State private var haptics: Bool = false

    @Namespace var albumArtNamespace

    @Default(.useMusicVisualizer) var useMusicVisualizer

    @Default(.showNotHumanFace) var showNotHumanFace

    // Shared interactive spring for movement/resizing to avoid conflicting animations
    private let animationSpring = Animation.interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)

    private let extendedHoverPadding: CGFloat = 30
    private let zeroHeightHoverPadding: CGFloat = 10

    /// What the closed notch shows at its sides, following the settings: which activities are on, how many fit
    /// at once and which one wins when there are more.
    private var closedKinds: [LiveKind] {
        guard vm.notchState == .closed, !vm.hideOnClosed else { return [] }
        var candidates: [LiveKind] = []
        if coordinator.musicLiveActivityEnabled && (musicManager.isPlaying || !musicManager.isPlayerIdle) { candidates.append(.music) }
        if livePomodoro && pomodoro.isRunning { candidates.append(.pomodoro) }
        if livePerformance { candidates.append(.performance) }
        if liveBattery && batteryModel.isCharging { candidates.append(.battery) }
        let first: LiveKind = livePriority == .pomodoro ? .pomodoro : .music
        let ordered = candidates.filter { $0 == first } + candidates.filter { $0 != first }
        return Array(ordered.prefix(max(1, min(3, liveMax))))
    }

    private var showBorder: Bool {
        switch notchBorder {
        case .off: false
        case .openOnly: vm.notchState == .open
        case .always: true
        }
    }

    private var glowOn: Bool {
        glowStyle != .off && (vm.notchState == .open || musicManager.isPlaying || glowColorMode == .rainbow)
    }

    private var glowOpacity: Double {
        let base = glowStyle == .strong ? 0.55 : 0.34
        return min(1, base * glowIntensity * (vm.notchState == .closed ? 1.55 : 1.0))
    }

    private var glowRadius: CGFloat {
        let base: CGFloat = glowStyle == .strong ? 22 : 14
        return (base * glowSpread.spreadFactor + CGFloat(max(0, glowIntensity - 1)) * 3) * (vm.notchState == .closed ? 1.2 : 1)
    }

    private var topCornerRadius: CGFloat {
        vm.notchState == .open ? islandCorners.opened.top : islandCorners.closed.top
    }

    private var currentNotchShape: IslandShape {
        IslandShape(
            topRadius: topCornerRadius,
            bottomRadius: vm.notchState == .open ? islandCorners.opened.bottom : islandCorners.closed.bottom
        )
    }

    private var computedChinWidth: CGFloat {
        var chinWidth: CGFloat = vm.closedNotchSize.width

        if coordinator.expandingView.type == .battery && coordinator.expandingView.show
            && vm.notchState == .closed && Defaults[.showPowerStatusNotifications]
        {
            chinWidth = 640
        } else if !closedKinds.isEmpty && !coordinator.sneakPeek.show {
            chinWidth += ClosedActivityView.extraWidth(kinds: closedKinds, side: max(0, vm.effectiveClosedNotchHeight - 12))
        } else if !coordinator.expandingView.show && vm.notchState == .closed
            && (!musicManager.isPlaying && musicManager.isPlayerIdle) && Defaults[.showNotHumanFace]
            && !vm.hideOnClosed
        {
            chinWidth += (2 * max(0, vm.effectiveClosedNotchHeight - 12) + 20)
        }

        return chinWidth
    }

    var body: some View {
        // Calculate scale based on gesture progress only
        let gestureScale: CGFloat = {
            guard gestureProgress != 0 else { return 1.0 }
            let scaleFactor = 1.0 + gestureProgress * 0.01
            return max(0.6, scaleFactor)
        }()
        
        let onHome = vm.notchState == .open && coordinator.currentView == .home
        ZStack(alignment: .top) {
            VStack(spacing: 0) {
                let mainLayout = NotchLayout()
                    .frame(alignment: .top)
                    .padding(
                        .horizontal,
                        vm.notchState == .open
                        ? (onHome ? 0 : (Defaults[.cornerRadiusScaling]
                            ? (cornerRadiusInsets.opened.top) : (cornerRadiusInsets.opened.bottom)) + 20)
                        : cornerRadiusInsets.closed.bottom
                    )
                    .padding(.bottom, vm.notchState == .open ? (onHome ? 7 : 12) : 0)
                    .background {
                        ZStack {
                            Color.black
                            if glassAmount > 0.02 && vm.notchState == .open {
                                // Full glass: the desktop shows through, blurred, under a dark tint that is solid at the top.
                                VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                                    .opacity(glassAmount)
                                    .transition(.opacity)
                                LinearGradient(
                                    stops: [
                                        .init(color: .black, location: 0),
                                        .init(color: .black.opacity(1 - 0.12 * glassAmount), location: 0.2),
                                        .init(color: .black.opacity(1 - 0.55 * glassAmount), location: 1),
                                    ],
                                    startPoint: .top, endPoint: .bottom)
                            }
                            if glowStyle != .off && vm.notchState == .open {
                                AmbientLight().transition(.opacity)
                            }
                        }
                    }
                    .onContinuousHover(coordinateSpace: .local) { phase in
                        switch phase {
                        case .active(let p): PointerLight.shared.point = p
                        case .ended: PointerLight.shared.point = nil
                        }
                    }
                    .clipShape(currentNotchShape)
                    .overlay(alignment: .top) {
                        Rectangle()
                            .fill(.black)
                            .frame(height: 1)
                            .padding(.horizontal, topCornerRadius)
                    }
                    .overlay {
                        if glassAmount > 0.02 && vm.notchState == .open {
                            // Liquid glass edge: soft inner glow, sheen on top and a bright rim that fades toward the cover color.
                            ZStack {
                                currentNotchShape
                                    .stroke(Color.white.opacity(0.14), lineWidth: 12)
                                    .blur(radius: 7)
                                    .clipShape(currentNotchShape)
                                currentNotchShape
                                    .fill(LinearGradient(colors: [Color.white.opacity(0.09), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.4)))
                                if showBorder {
                                    currentNotchShape
                                        .stroke(
                                            LinearGradient(
                                                stops: [
                                                    .init(color: Color.white.opacity(0.7), location: 0),
                                                    .init(color: Color.white.opacity(0.08), location: 0.45),
                                                    .init(color: (glowStyle == .off ? Color.white : Color(nsColor: musicManager.glowColor)).opacity(0.75), location: 1),
                                                ],
                                                startPoint: .topLeading, endPoint: .bottomTrailing),
                                            lineWidth: 1.4)
                                }
                            }
                            .allowsHitTesting(false)
                        } else if showBorder && glowStyle != .off && (vm.notchState == .open || musicManager.isPlaying) {
                            currentNotchShape
                                .stroke(
                                    LinearGradient(
                                        colors: [.white.opacity(0.28), Color(nsColor: musicManager.glowColor).opacity(min(1, (glowStyle == .strong ? 0.95 : 0.7) * glowIntensity))],
                                        startPoint: .top, endPoint: .bottom),
                                    lineWidth: 1)
                                .allowsHitTesting(false)
                        }
                    }
                    .shadow(
                        color: ((vm.notchState == .open || isHovering) && Defaults[.enableShadow])
                            ? .black.opacity(0.7) : .clear, radius: Defaults[.cornerRadiusScaling] ? 6 : 4
                    )
                    .background {
                        if glowOn {
                            NotchGlow(shape: currentNotchShape, color: Color(nsColor: musicManager.glowColor),
                                      opacity: glowOpacity, radius: glowRadius, dances: glowMotion && musicManager.isPlaying,
                                      amount: danceSize.danceFactor, intensity: glowIntensity,
                                      rainbow: glowColorMode == .rainbow)
                        }
                    }
                    .padding(
                        .bottom,
                        vm.effectiveClosedNotchHeight == 0 ? 10 : 0
                    )
                
                mainLayout
                    .frame(height: vm.notchState == .open ? vm.notchSize.height : nil)
                    .conditionalModifier(true) { view in
                        let openAnimation = Animation.spring(response: 0.42, dampingFraction: 0.8, blendDuration: 0)
                        let closeAnimation = Animation.spring(response: 0.45, dampingFraction: 1.0, blendDuration: 0)
                        
                        return view
                            .animation(vm.notchState == .open ? openAnimation : closeAnimation, value: vm.notchState)
                            .animation(.smooth, value: gestureProgress)
                    }
                    .contentShape(Rectangle())
                    .onHover { hovering in
                        handleHover(hovering)
                    }
                    .onTapGesture {
                        doOpen()
                    }
                    .conditionalModifier(Defaults[.enableGestures]) { view in
                        view
                            .panGesture(direction: .down) { translation, phase in
                                handleDownGesture(translation: translation, phase: phase)
                            }
                    }
                    .conditionalModifier(Defaults[.closeGestureEnabled] && Defaults[.enableGestures]) { view in
                        view
                            .panGesture(direction: .up) { translation, phase in
                                handleUpGesture(translation: translation, phase: phase)
                            }
                    }
                    .onAppear {
                        Task {
                            try? await Task.sleep(for: .seconds(1))
                            await MainActor.run {
                                if coordinator.firstLaunch {
                                    withAnimation(vm.animation) {
                                        doOpen()
                                    }
                                }
                            }
                        }
                    }
                    .onReceive(NotificationCenter.default.publisher(for: .pomodoroFinished)) { _ in
                        guard vm.notchState == .closed else { return }
                        doOpen()
                        hoverTask?.cancel()
                        hoverTask = Task {
                            try? await Task.sleep(for: .seconds(8))
                            guard !Task.isCancelled else { return }
                            await MainActor.run {
                                if !isHovering && !SharingStateManager.shared.preventNotchClose { vm.close() }
                            }
                        }
                    }
                    .onReceive(NotificationCenter.default.publisher(for: .sharingDidFinish)) { _ in
                        if vm.notchState == .open && !isHovering && !vm.isBatteryPopoverActive {
                            hoverTask?.cancel()
                            hoverTask = Task {
                                try? await Task.sleep(for: .milliseconds(100))
                                guard !Task.isCancelled else { return }
                                await MainActor.run {
                                    if self.vm.notchState == .open && !self.isHovering && !self.vm.isBatteryPopoverActive && !SharingStateManager.shared.preventNotchClose {
                                        self.vm.close()
                                    }
                                }
                            }
                        }
                    }
                    .onChange(of: vm.notchState) { _, newState in
                        if newState == .closed && isHovering {
                            withAnimation {
                                isHovering = false
                            }
                        }
                    }
                    .onChange(of: vm.isBatteryPopoverActive) {
                        if !vm.isBatteryPopoverActive && !isHovering && vm.notchState == .open && !SharingStateManager.shared.preventNotchClose {
                            hoverTask?.cancel()
                            hoverTask = Task {
                                try? await Task.sleep(for: .milliseconds(100))
                                guard !Task.isCancelled else { return }
                                await MainActor.run {
                                    if !self.vm.isBatteryPopoverActive && !self.isHovering && self.vm.notchState == .open && !SharingStateManager.shared.preventNotchClose {
                                        self.vm.close()
                                    }
                                }
                            }
                        }
                    }
                    .sensoryFeedback(.alignment, trigger: haptics)
                    .contextMenu {
                        Button("Editar componentes") {
                            doOpen()
                            coordinator.currentView = .home
                            layoutManager.editing = true
                        }
                        Button("Ajustes") {
                            SettingsWindowController.shared.showWindow()
                        }
                        .keyboardShortcut(KeyEquivalent(","), modifiers: .command)
                        //                    Button("Edit") { // Doesnt work....
                        //                        let dn = DynamicNotch(content: EditPanelView())
                        //                        dn.toggle()
                        //                    }
                        //                    .keyboardShortcut("E", modifiers: .command)
                    }
                if vm.chinHeight > 0 {
                    Rectangle()
                        .fill(Color.black.opacity(0.01))
                        .frame(width: computedChinWidth, height: vm.chinHeight)
                }
            }
        }
        .padding(.bottom, 8)
        .padding(.horizontal, windowSidePadding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .compositingGroup()
        .scaleEffect(
            x: gestureScale,
            y: gestureScale,
            anchor: .top
        )
        .animation(.smooth, value: gestureProgress)
        .background(dragDetector)
        .environmentObject(vm)
        .onChange(of: vm.isHoveringClosedControls) { _, over in
            if !over && isHovering && vm.notchState == .closed && Defaults[.openNotchOnHover] {
                scheduleHoverOpen()
            }
        }
        .onChange(of: vm.anyDropZoneTargeting) { _, isTargeted in
            anyDropDebounceTask?.cancel()

            if isTargeted {
                if vm.notchState == .closed {
                    coordinator.currentView = .shelf
                    doOpen()
                }
                return
            }

            anyDropDebounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled else { return }

                if vm.dropEvent {
                    vm.dropEvent = false
                    return
                }

                vm.dropEvent = false
                if !SharingStateManager.shared.preventNotchClose {
                    vm.close()
                }
            }
        }
    }

    @ViewBuilder
    func NotchLayout() -> some View {
        VStack(alignment: .leading) {
            VStack(alignment: .leading) {
                if coordinator.firstLaunch {
                    Spacer()
                    HelloAnimation().frame(
                        width: getClosedNotchSize().width,
                        height: 80
                    ).onAppear(perform: {
                        vm.closeHello()
                    })
                    .padding(.top, 40)
                    Spacer()
                } else {
                    if coordinator.expandingView.type == .battery && coordinator.expandingView.show
                        && vm.notchState == .closed && Defaults[.showPowerStatusNotifications]
                    {
                        HStack(spacing: 0) {
                            HStack {
                                Text(batteryModel.statusText)
                                    .font(.subheadline)
                                    .foregroundStyle(.white)
                            }

                            Rectangle()
                                .fill(.black)
                                .frame(width: vm.closedNotchSize.width + 10)

                            HStack {
                                BoringBatteryView(
                                    batteryWidth: 30,
                                    isCharging: batteryModel.isCharging,
                                    isInLowPowerMode: batteryModel.isInLowPowerMode,
                                    isPluggedIn: batteryModel.isPluggedIn,
                                    levelBattery: batteryModel.levelBattery,
                                    isForNotification: true
                                )
                            }
                            .frame(width: 76, alignment: .trailing)
                        }
                        .frame(height: vm.effectiveClosedNotchHeight, alignment: .center)
                      } else if coordinator.sneakPeek.show && Defaults[.inlineHUD] && (coordinator.sneakPeek.type != .music) && (coordinator.sneakPeek.type != .battery) && vm.notchState == .closed {
                          InlineHUD(type: $coordinator.sneakPeek.type, value: $coordinator.sneakPeek.value, icon: $coordinator.sneakPeek.icon, hoverAnimation: $isHovering, gestureProgress: $gestureProgress)
                              .transition(.opacity)
                      } else if !closedKinds.isEmpty && (!coordinator.sneakPeek.show || coordinator.sneakPeek.type == .music) && (!coordinator.expandingView.show || coordinator.expandingView.type == .music) {
                          ClosedActivityView(kinds: closedKinds, albumArtNamespace: albumArtNamespace)
                              .frame(alignment: .center)
                      } else if !coordinator.expandingView.show && vm.notchState == .closed && (!musicManager.isPlaying && musicManager.isPlayerIdle) && Defaults[.showNotHumanFace] && !vm.hideOnClosed  {
                          BoringFaceAnimation()
                       } else if vm.notchState == .open {
                           BoringHeader()
                               .frame(height: max(24, vm.effectiveClosedNotchHeight))
                               .opacity(gestureProgress != 0 ? 1.0 - min(abs(gestureProgress) * 0.1, 0.3) : 1.0)
                       } else {
                           Rectangle().fill(.clear).frame(width: vm.closedNotchSize.width - 20, height: vm.effectiveClosedNotchHeight)
                       }

                      if coordinator.sneakPeek.show {
                          if (coordinator.sneakPeek.type != .music) && (coordinator.sneakPeek.type != .battery) && !Defaults[.inlineHUD] && vm.notchState == .closed {
                              SystemEventIndicatorModifier(
                                  eventType: $coordinator.sneakPeek.type,
                                  value: $coordinator.sneakPeek.value,
                                  icon: $coordinator.sneakPeek.icon,
                                  sendEventBack: { newVal in
                                      switch coordinator.sneakPeek.type {
                                      case .volume:
                                          VolumeManager.shared.setAbsolute(Float32(newVal))
                                      case .brightness:
                                          BrightnessManager.shared.setAbsolute(value: Float32(newVal))
                                      default:
                                          break
                                      }
                                  }
                              )
                              .padding(.bottom, 10)
                              .padding(.leading, 4)
                              .padding(.trailing, 8)
                          }
                          // Old sneak peek music
                          else if coordinator.sneakPeek.type == .music {
                              if vm.notchState == .closed && !vm.hideOnClosed && Defaults[.sneakPeekStyles] == .standard {
                                  HStack(alignment: .center) {
                                      Image(systemName: "music.note")
                                      GeometryReader { geo in
                                          MarqueeText(.constant(musicManager.songTitle + " - " + musicManager.artistName),  textColor: Defaults[.playerColorTinting] ? Color(nsColor: musicManager.glowColor).ensureMinimumBrightness(factor: 0.6) : .gray, minDuration: 1, frameWidth: geo.size.width)
                                      }
                                  }
                                  .foregroundStyle(.gray)
                                  .padding(.bottom, 10)
                              }
                          }
                      }
                      if let item = clipboard.toast, vm.notchState == .closed, !vm.hideOnClosed {
                          ClipboardToast(item: item)
                              .padding(.bottom, 8)
                              .frame(maxWidth: .infinity)
                      }
                  }
              }
              .conditionalModifier((coordinator.sneakPeek.show && (coordinator.sneakPeek.type == .music) && vm.notchState == .closed && !vm.hideOnClosed && Defaults[.sneakPeekStyles] == .standard) || (coordinator.sneakPeek.show && (coordinator.sneakPeek.type != .music) && (vm.notchState == .closed))) { view in
                  view
                      .fixedSize()
              }
              .zIndex(2)
            if vm.notchState == .open {
                VStack {
                    switch coordinator.currentView {
                    case .home:
                        IslandHomeView(albumArtNamespace: albumArtNamespace)
                    case .shelf:
                        ShelfView()
                    case .chat:
                        ChatTabView()
                    case .clipboard:
                        ClipboardTabView()
                    case .game:
                        SnakeTabView()
                    }
                }
                .transition(
                    .scale(scale: 0.8, anchor: .top)
                    .combined(with: .opacity)
                    .animation(.smooth(duration: 0.35))
                )
                .zIndex(1)
                .allowsHitTesting(vm.notchState == .open)
                .opacity(gestureProgress != 0 ? 1.0 - min(abs(gestureProgress) * 0.1, 0.3) : 1.0)
            }
        }
        .onDrop(of: [.fileURL, .url, .utf8PlainText, .plainText, .data], delegate: GeneralDropTargetDelegate(isTargeted: $vm.generalDropTargeting))
    }

    @ViewBuilder
    func BoringFaceAnimation() -> some View {
        HStack {
            HStack {
                Rectangle()
                    .fill(.clear)
                    .frame(
                        width: max(0, vm.effectiveClosedNotchHeight - 12),
                        height: max(0, vm.effectiveClosedNotchHeight - 12)
                    )
                Rectangle()
                    .fill(.black)
                    .frame(width: vm.closedNotchSize.width - 20)
                MinimalFaceFeatures()
            }
        }.frame(
            height: vm.effectiveClosedNotchHeight,
            alignment: .center
        )
    }

    @ViewBuilder
    var dragDetector: some View {
        if Defaults[.boringShelf] && vm.notchState == .closed {
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        .onDrop(of: [.fileURL, .url, .utf8PlainText, .plainText, .data], isTargeted: $vm.dragDetectorTargeting) { providers in
            vm.dropEvent = true
            ShelfStateViewModel.shared.load(providers)
            return true
        }
        } else {
            EmptyView()
        }
    }

    private func doOpen() {
        withAnimation(animationSpring) {
            vm.open()
        }
    }

    // MARK: - Hover Management

    /// Opens the notch once the pointer has rested on it, unless it is over the buttons at the sides.
    private func scheduleHoverOpen() {
        hoverTask?.cancel()
        hoverTask = Task {
            try? await Task.sleep(for: .seconds(Defaults[.minimumHoverDuration]))
            guard !Task.isCancelled else { return }

            await MainActor.run {
                guard self.vm.notchState == .closed,
                      self.isHovering,
                      !self.vm.isHoveringClosedControls,
                      !self.coordinator.sneakPeek.show else { return }

                self.doOpen()
            }
        }
    }

    private func handleHover(_ hovering: Bool) {
        hoverTask?.cancel()
        
        if hovering {
            withAnimation(animationSpring) {
                isHovering = true
            }
            
            if vm.notchState == .closed && Defaults[.enableHaptics] {
                haptics.toggle()
            }
            
            guard vm.notchState == .closed,
                  !coordinator.sneakPeek.show,
                  Defaults[.openNotchOnHover] else { return }

            scheduleHoverOpen()
        } else {
            hoverTask = Task {
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled else { return }
                
                await MainActor.run {
                    withAnimation(animationSpring) {
                        self.isHovering = false
                    }
                    
                    if self.vm.notchState == .open && !self.vm.isBatteryPopoverActive && !SharingStateManager.shared.preventNotchClose {
                        self.vm.close()
                    }
                }
            }
        }
    }

    // MARK: - Gesture Handling

    private func handleDownGesture(translation: CGFloat, phase: NSEvent.Phase) {
        guard vm.notchState == .closed else { return }

        if phase == .ended {
            withAnimation(animationSpring) { gestureProgress = .zero }
            return
        }

        withAnimation(animationSpring) {
            gestureProgress = (translation / Defaults[.gestureSensitivity]) * 20
        }

        if translation > Defaults[.gestureSensitivity] {
            if Defaults[.enableHaptics] {
                haptics.toggle()
            }
            withAnimation(animationSpring) {
                gestureProgress = .zero
            }
            doOpen()
        }
    }

    private func handleUpGesture(translation: CGFloat, phase: NSEvent.Phase) {
        guard vm.notchState == .open && !vm.isHoveringCalendar else { return }

        withAnimation(animationSpring) {
            gestureProgress = (translation / Defaults[.gestureSensitivity]) * -20
        }

        if phase == .ended {
            withAnimation(animationSpring) {
                gestureProgress = .zero
            }
        }

        if translation > Defaults[.gestureSensitivity] {
            withAnimation(animationSpring) {
                isHovering = false
            }
            if !SharingStateManager.shared.preventNotchClose { 
                gestureProgress = .zero
                vm.close()
            }

            if Defaults[.enableHaptics] {
                haptics.toggle()
            }
        }
    }
}

struct FullScreenDropDelegate: DropDelegate {
    @Binding var isTargeted: Bool
    let onDrop: () -> Void

    func dropEntered(info _: DropInfo) {
        isTargeted = true
    }

    func dropExited(info _: DropInfo) {
        isTargeted = false
    }

    func performDrop(info _: DropInfo) -> Bool {
        isTargeted = false
        onDrop()
        return true
    }

}

struct GeneralDropTargetDelegate: DropDelegate {
    @Binding var isTargeted: Bool

    func dropEntered(info: DropInfo) {
        isTargeted = true
    }

    func dropExited(info: DropInfo) {
        isTargeted = false
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        return DropProposal(operation: .cancel)
    }

    func performDrop(info: DropInfo) -> Bool {
        return false
    }
}

#Preview {
    let vm = BoringViewModel()
    vm.open()
    return ContentView()
        .environmentObject(vm)
        .frame(width: vm.notchSize.width, height: vm.notchSize.height)
}
