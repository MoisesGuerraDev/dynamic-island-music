import Defaults
import SwiftUI

/// Pomodoro component of the open notch.
struct PomodoroView: View {
    @ObservedObject var pomo = PomodoroManager.shared
    @State private var draft = ""
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 6) {
            Text(pomo.label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(red: 0.6, green: 0.76, blue: 1))
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(Color.blue.opacity(0.18), in: Capsule())
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            timeDisplay

            ProgressView(value: pomo.progress)
                .progressViewStyle(.linear)
                .tint(Color(red: 0.3, green: 0.56, blue: 1))
                .frame(height: 3)

            HStack(spacing: 8) {
                GlassCircleButton(symbol: "arrow.counterclockwise", size: 28) { pomo.reset() }
                GlassCircleButton(symbol: pomo.isRunning ? "pause.fill" : "play.fill", size: 34) { pomo.toggle() }
                GlassCircleButton(symbol: "forward.end.fill", size: 28) { pomo.skip() }
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var timeDisplay: some View {
        if pomo.editingTime {
            TextField("25 · 1:30 · 1:30:00", text: $draft)
                .textFieldStyle(.plain)
                .multilineTextAlignment(.center)
                .font(.system(size: 22, weight: .semibold, design: .monospaced))
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))
                .focused($fieldFocused)
                .onSubmit(commit)
                .onAppear {
                    draft = TimeText.clock(pomo.remaining)
                    KeyboardFocus.shared.request()
                    DispatchQueue.main.async { fieldFocused = true }
                }
                .onExitCommand { cancel() }
        } else {
            let text = TimeText.clock(pomo.remaining)
            Button {
                pomo.pause()
                pomo.editingTime = true
            } label: {
                Text(text)
                    .font(.system(size: text.count >= 7 ? 26 : (text.count > 5 ? 34 : 42), weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .buttonStyle(.plain)
            .help("Toca para escribir el tiempo que quieras")
        }
    }

    private func commit() {
        if let s = TimeText.parse(draft) { pomo.setCurrentDuration(s) }
        cancel()
    }

    private func cancel() {
        pomo.editingTime = false
        KeyboardFocus.shared.release()
    }
}

/// Closed-notch live activity for the timer.
struct PomodoroLiveText: View {
    @ObservedObject var pomo = PomodoroManager.shared
    var body: some View {
        Text(TimeText.clock(pomo.remaining))
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color(red: 0.6, green: 0.76, blue: 1))
            .monospacedDigit()
    }
}
