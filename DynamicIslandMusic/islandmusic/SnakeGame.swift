import Defaults
import SwiftUI

/// Small snake game for the Game tab. Works with arrow keys / WASD or by dragging in the direction you want.
@MainActor
final class SnakeModel: ObservableObject {
    struct P: Hashable { var x: Int; var y: Int }

    let cols = 36
    let rows = 9

    @Published var snake: [P] = [P(x: 6, y: 4), P(x: 5, y: 4), P(x: 4, y: 4)]
    @Published var food = P(x: 20, y: 4)
    @Published var score = 0
    @Published var best = UserDefaults.standard.integer(forKey: "snakeBest")
    @Published var running = false
    @Published var gameOver = false

    private var dir = P(x: 1, y: 0)
    private var nextDir = P(x: 1, y: 0)
    private var timer: Timer?

    func start() {
        snake = [P(x: 6, y: 4), P(x: 5, y: 4), P(x: 4, y: 4)]
        dir = P(x: 1, y: 0)
        nextDir = dir
        score = 0
        gameOver = false
        running = true
        placeFood()
        timer?.invalidate()
        let t = Timer(timeInterval: 0.11, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.step() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        running = false
    }

    func turn(_ d: P) {
        if d.x == -dir.x && d.y == -dir.y { return }
        nextDir = d
    }

    func turn(dx: CGFloat, dy: CGFloat) {
        if abs(dx) > abs(dy) { turn(P(x: dx > 0 ? 1 : -1, y: 0)) } else { turn(P(x: 0, y: dy > 0 ? 1 : -1)) }
    }

    private func placeFood() {
        var p = P(x: Int.random(in: 0..<cols), y: Int.random(in: 0..<rows))
        while snake.contains(p) { p = P(x: Int.random(in: 0..<cols), y: Int.random(in: 0..<rows)) }
        food = p
    }

    private func step() {
        dir = nextDir
        let head = P(x: snake[0].x + dir.x, y: snake[0].y + dir.y)
        if head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.contains(head) {
            stop()
            gameOver = true
            if score > best {
                best = score
                UserDefaults.standard.set(best, forKey: "snakeBest")
            }
            return
        }
        snake.insert(head, at: 0)
        if head == food {
            score += 1
            placeFood()
        } else {
            snake.removeLast()
        }
    }
}

struct SnakeTabView: View {
    @StateObject private var model = SnakeModel()
    @ObservedObject var musicManager = MusicManager.shared
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Serpiente").font(.system(size: 15, weight: .semibold))
                Text("Puntos: \(model.score)").font(.system(size: 12.5, weight: .semibold, design: .monospaced))
                Text("Récord: \(model.best)").font(.system(size: 11, design: .monospaced)).foregroundStyle(.gray)
                Button {
                    model.start()
                    KeyboardFocus.shared.request()
                    focused = true
                } label: {
                    Text(model.gameOver ? "Otra vez" : (model.running ? "Reiniciar" : "Comenzar"))
                        .font(.system(size: 12.5, weight: .semibold))
                        .padding(.horizontal, 16).padding(.vertical, 7)
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .islandGlass(Capsule())
                Text("Flechas, WASD o arrastra").font(.system(size: 10.5)).foregroundStyle(.gray)
            }
            .frame(width: 140, alignment: .leading)

            GeometryReader { geo in
                let cell = min(geo.size.width / CGFloat(model.cols), geo.size.height / CGFloat(model.rows))
                let color = Color(nsColor: musicManager.glowColor)
                Canvas { ctx, _ in
                    for (i, p) in model.snake.enumerated() {
                        let r = CGRect(x: CGFloat(p.x) * cell + 1, y: CGFloat(p.y) * cell + 1, width: cell - 2, height: cell - 2)
                        ctx.fill(Path(roundedRect: r, cornerRadius: 3), with: .color(color.opacity(max(0.35, 1 - Double(i) * 0.025))))
                    }
                    let f = CGRect(x: CGFloat(model.food.x) * cell + 3, y: CGFloat(model.food.y) * cell + 3, width: cell - 6, height: cell - 6)
                    ctx.fill(Path(ellipseIn: f), with: .color(.white))
                }
                .frame(width: cell * CGFloat(model.cols), height: cell * CGFloat(model.rows))
                .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
                .gesture(DragGesture(minimumDistance: 12).onChanged { v in model.turn(dx: v.translation.width, dy: v.translation.height) })
            }
            .focusable()
            .focused($focused)
            .onKeyPress(phases: .down) { press in
                switch press.key {
                case .upArrow: model.turn(.init(x: 0, y: -1))
                case .downArrow: model.turn(.init(x: 0, y: 1))
                case .leftArrow: model.turn(.init(x: -1, y: 0))
                case .rightArrow: model.turn(.init(x: 1, y: 0))
                default:
                    switch press.characters.lowercased() {
                    case "w": model.turn(.init(x: 0, y: -1))
                    case "s": model.turn(.init(x: 0, y: 1))
                    case "a": model.turn(.init(x: -1, y: 0))
                    case "d": model.turn(.init(x: 1, y: 0))
                    default: return .ignored
                    }
                }
                return .handled
            }
        }
        .padding(.top, 4)
        .onDisappear {
            model.stop()
            KeyboardFocus.shared.release()
        }
    }
}

struct GameComponentView: View {
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Juego", systemImage: "gamecontroller").font(.system(size: 12, weight: .semibold))
            Text("Serpiente").font(.system(size: 11)).foregroundStyle(.gray)
            Button {
                withAnimation(.smooth) { coordinator.currentView = .game }
            } label: {
                Text("Jugar").font(.system(size: 12, weight: .semibold)).padding(.horizontal, 20).padding(.vertical, 6).foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .islandGlass(Capsule())
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
