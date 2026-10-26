import Defaults
import SwiftUI

/// Things the closed notch can show at its sides.
enum LiveKind: String, CaseIterable, Identifiable {
    case music, pomodoro, performance, battery
    var id: String { rawValue }

    var title: String {
        switch self {
        case .music: "Música"
        case .pomodoro: "Pomodoro"
        case .performance: "Rendimiento"
        case .battery: "Batería"
        }
    }
}

/// Closed notch with live activities. Music goes on the left and the rest on the right, both sides always the same width
/// so the middle sits right over the camera cutout. Hovering a side swaps its content for buttons, so you can change the
/// song or pause the timer without opening the panel; the middle still opens it.
struct ClosedActivityView: View {
    let kinds: [LiveKind]
    let albumArtNamespace: Namespace.ID

    @EnvironmentObject var vm: BoringViewModel
    @ObservedObject var music = MusicManager.shared
    @ObservedObject var pomo = PomodoroManager.shared
    @ObservedObject var perf = PerformanceMonitor.shared
    @ObservedObject var battery = BatteryStatusViewModel.shared
    @Default(.liveControls) private var controlsOn
    @Default(.liveSpectrum) private var spectrumOn
    @Default(.coloredSpectrogram) private var coloredSpectrogram
    @State private var earHover = false

    private var hoverControls: Bool { earHover && controlsOn }
    private var side: CGFloat { max(0, vm.effectiveClosedNotchHeight - 12) }

    private var leftKinds: [LiveKind] {
        kinds.contains(.music) ? [.music] : Array(kinds.prefix(1))
    }

    private var rightKinds: [LiveKind] {
        kinds.contains(.music) ? kinds.filter { $0 != .music } : Array(kinds.dropFirst())
    }

    private var onlyMusic: Bool { kinds == [.music] }
    private var onlyPomodoro: Bool { kinds == [.pomodoro] }

    // MARK: Widths

    private func width(_ kind: LiveKind, left: Bool) -> CGFloat {
        switch kind {
        case .music: return side
        case .pomodoro: return onlyPomodoro && left ? 56 : 62
        case .performance: return 58
        case .battery: return 46
        }
    }

    private func total(_ list: [LiveKind], left: Bool) -> CGFloat {
        list.reduce(0) { $0 + width($1, left: left) } + CGFloat(max(0, list.count - 1)) * 6
    }

    /// Both ears get the same width.
    private var ear: CGFloat {
        let companion: CGFloat = onlyMusic ? 18 : (onlyPomodoro ? 24 : 0)
        let base = max(total(leftKinds, left: true), total(rightKinds, left: false), companion, 24)
        if hoverControls && (kinds.contains(.music) || kinds.contains(.pomodoro)) { return max(base, 88) }
        return base
    }

    // MARK: Body

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                ForEach(leftKinds) { item($0, left: true) }
            }
            .frame(width: ear, alignment: .leading)
            .onHover { earHover = $0 }

            Rectangle()
                .fill(.black)
                .frame(width: vm.closedNotchSize.width - cornerRadiusInsets.closed.top)

            HStack(spacing: 6) {
                if rightKinds.isEmpty {
                    companion
                } else {
                    ForEach(rightKinds) { item($0, left: false) }
                }
            }
            .frame(width: ear, alignment: .trailing)
            .onHover { earHover = $0 }
        }
        .frame(height: vm.effectiveClosedNotchHeight, alignment: .center)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hoverControls)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: kinds)
        .onChange(of: earHover) { _, over in vm.isHoveringClosedControls = over && controlsOn }
        .onDisappear {
            earHover = false
            vm.isHoveringClosedControls = false
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private func item(_ kind: LiveKind, left: Bool) -> some View {
        switch kind {
        case .music:
            if hoverControls && !onlyMusic {
                ClosedMusicControls(side: side)
            } else {
                cover
            }
        case .pomodoro:
            if onlyPomodoro && left {
                PomodoroClosedInfo(compact: !hoverControls)
            } else if hoverControls {
                PomodoroClosedControls()
            } else {
                HStack(spacing: 4) {
                    Image(systemName: "timer")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color(red: 0.43, green: 0.66, blue: 1))
                    Text(TimeText.clock(pomo.remaining))
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
        case .performance:
            PerformanceLiveText(perf: perf)
        case .battery:
            HStack(spacing: 3) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(red: 0.2, green: 0.78, blue: 0.35))
                Text("\(Int(battery.levelBattery.rounded()))%")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
            }
        }
    }

    /// What fills the right ear when nothing else is there.
    @ViewBuilder
    private var companion: some View {
        if onlyMusic {
            if hoverControls {
                ClosedMusicControls(side: side)
            } else if spectrumOn {
                Rectangle()
                    .fill(coloredSpectrogram ? Color(nsColor: music.glowColor).gradient : Color.gray.gradient)
                    .frame(width: 18, height: 12)
                    .mask { AudioSpectrumView(isPlaying: $music.isPlaying).frame(width: 16, height: 12) }
            }
        } else if onlyPomodoro {
            if hoverControls { PomodoroClosedControls() } else { PomodoroClosedBadge() }
        }
    }

    private var cover: some View {
        Image(nsImage: music.albumArt)
            .resizable()
            .scaledToFill()
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .matchedGeometryEffect(id: "albumArt", in: albumArtNamespace)
    }

    /// Extra width of the closed notch, for the chin below it.
    static func extraWidth(kinds: [LiveKind], side: CGFloat) -> CGFloat {
        2 * max(side, 58) + 12
    }
}

private struct PerformanceLiveText: View {
    @ObservedObject var perf: PerformanceMonitor

    var body: some View {
        Text("CPU \(Int((perf.cpu * 100).rounded()))%")
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .monospacedDigit()
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize()
            .onAppear { perf.acquire() }
            .onDisappear { perf.release() }
    }
}
