import SwiftUI

private let pomoBlue = Color(red: 0.3, green: 0.56, blue: 1)

/// Time and phase of the timer, on the left of the closed notch.
struct PomodoroClosedInfo: View {
    let compact: Bool
    @ObservedObject var pomo = PomodoroManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(TimeText.clock(pomo.remaining))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(pomo.phase == .focus ? "Concentración" : "Descanso")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(pomoBlue)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

/// Round badge on the right of the closed notch while the timer runs.
struct PomodoroClosedBadge: View {
    @ObservedObject var pomo = PomodoroManager.shared

    var body: some View {
        Image(systemName: pomo.phase == .focus ? "brain" : "cup.and.saucer.fill")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(pomoBlue)
            .frame(width: 22, height: 22)
            .background(Circle().fill(pomoBlue.opacity(0.22)))
    }
}

/// Reset, pause / resume and skip, shown while the pointer is over the closed notch.
struct PomodoroClosedControls: View {
    @ObservedObject var pomo = PomodoroManager.shared

    var body: some View {
        HStack(spacing: 6) {
            PomoMiniButton(symbol: "arrow.counterclockwise") { pomo.reset() }
            PomoMiniButton(symbol: pomo.isRunning ? "pause.fill" : "play.fill") { pomo.toggle() }
            PomoMiniButton(symbol: "forward.end.fill") { pomo.skip() }
        }
    }

    private struct PomoMiniButton: View {
        let symbol: String
        let action: () -> Void
        @State private var hovering = false

        var body: some View {
            Button(action: action) {
                Image(systemName: symbol)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(red: 0.55, green: 0.74, blue: 1))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(pomoBlue.opacity(hovering ? 0.4 : 0.22)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .scaleEffect(hovering ? 1.12 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hovering)
            .onHover { hovering = $0 }
        }
    }
}
