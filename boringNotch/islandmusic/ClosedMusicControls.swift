import SwiftUI

/// Previous / play-pause / next in the closed notch, to change the song without opening it.
struct ClosedMusicControls: View {
    let side: CGFloat
    @ObservedObject var music = MusicManager.shared
    @EnvironmentObject var vm: BoringViewModel

    static func width(side: CGFloat) -> CGFloat { 3 * side + 8 }

    var body: some View {
        HStack(spacing: 4) {
            ControlButton(symbol: "backward.fill", side: side) { MusicManager.shared.previousTrack() }
            ControlButton(symbol: music.isPlaying ? "pause.fill" : "play.fill", side: side) { MusicManager.shared.togglePlay() }
            ControlButton(symbol: "forward.fill", side: side) { MusicManager.shared.nextTrack() }
        }
        .onHover { vm.isHoveringClosedControls = $0 }
        .onDisappear { vm.isHoveringClosedControls = false }
    }

    private struct ControlButton: View {
        let symbol: String
        let side: CGFloat
        let action: () -> Void
        @State private var hovering = false

        var body: some View {
            Button(action: action) {
                Image(systemName: symbol)
                    .font(.system(size: side * 0.5, weight: .bold))
                    .foregroundStyle(.white.opacity(hovering ? 1 : 0.78))
                    .frame(width: side, height: side)
                    .background(Circle().fill(Color.white.opacity(hovering ? 0.16 : 0)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .scaleEffect(hovering ? 1.12 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hovering)
            .onHover { hovering = $0 }
        }
    }
}
