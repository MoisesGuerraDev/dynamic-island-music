import AppKit
import Defaults
import SwiftUI

/// Highlight that follows the pointer over a glass control, plus a springy grow, like the design mockup.
struct GlassHover<S: Shape>: ViewModifier {
    let shape: S
    @State private var hovering = false
    @State private var unit = UnitPoint(x: 0.5, y: 0.3)
    @State private var size = CGSize(width: 30, height: 30)

    func body(content: Content) -> some View {
        content
            .background(GeometryReader { g in
                Color.clear
                    .onAppear { size = g.size }
                    .onChange(of: g.size) { _, s in size = s }
            })
            .overlay {
                shape
                    .fill(RadialGradient(
                        colors: [Color.white.opacity(0.7), Color.white.opacity(0)],
                        center: unit, startRadius: 0, endRadius: max(size.width, size.height) * 0.8))
                    .opacity(hovering ? 1 : 0)
                    .blendMode(.plusLighter)
                    .allowsHitTesting(false)
            }
            .scaleEffect(hovering ? 1.1 : 1)
            .animation(.spring(response: 0.34, dampingFraction: 0.55), value: hovering)
            .animation(.easeOut(duration: 0.12), value: unit)
            .onContinuousHover { phase in
                switch phase {
                case .active(let p):
                    unit = UnitPoint(x: size.width > 0 ? p.x / size.width : 0.5, y: size.height > 0 ? p.y / size.height : 0.5)
                    hovering = true
                case .ended:
                    hovering = false
                }
            }
    }
}

extension View {
    /// Liquid Glass (macOS 26 and later) with a soft material as fallback on older systems.
    /// The user can turn it off in Settings.
    @ViewBuilder
    func islandGlass<S: Shape>(_ shape: S, interactive: Bool = true, tint: Color? = nil) -> some View {
        if interactive {
            self.islandGlassBase(shape, interactive: true, tint: tint).modifier(GlassHover(shape: shape))
        } else {
            self.islandGlassBase(shape, interactive: false, tint: tint)
        }
    }

    @ViewBuilder
    fileprivate func islandGlassBase<S: Shape>(_ shape: S, interactive: Bool, tint: Color?) -> some View {
        if Defaults[.liquidGlassButtons] {
            if Defaults[.liquidGlassSystem], #available(macOS 26.0, *) {
                if let tint {
                    self.glassEffect(interactive ? Glass.regular.tint(tint).interactive() : Glass.regular.tint(tint), in: shape)
                } else {
                    self.glassEffect(interactive ? Glass.regular.interactive() : Glass.regular, in: shape)
                }
            } else {
                self.mockGlass(shape, tint: tint)
            }
        } else {
            self.background(Color.white.opacity(0.10), in: shape)
        }
    }

    /// The glass of the design mockup: translucent fill, bright rim on the top-left and bottom-right,
    /// soft inner glow and a drop shadow. The colored light behind it shows through.
    func mockGlass<S: Shape>(_ shape: S, tint: Color? = nil) -> some View {
        self.background {
            ZStack {
                shape.fill(Color.white.opacity(0.12))
                if let tint { shape.fill(tint.opacity(0.35)) }
                shape.fill(LinearGradient(colors: [Color.white.opacity(0.12), .clear], startPoint: .top, endPoint: .center))
                shape.stroke(Color.white.opacity(0.2), lineWidth: 10).blur(radius: 6).clipShape(shape)
                shape.stroke(
                    LinearGradient(
                        stops: [
                            .init(color: Color.white.opacity(0.8), location: 0),
                            .init(color: Color.white.opacity(0.06), location: 0.45),
                            .init(color: Color.white.opacity(0.42), location: 1),
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing),
                    lineWidth: 1.5)
            }
            .shadow(color: Color.black.opacity(0.4), radius: 7, y: 5)
        }
    }
}

/// Round glass button used in the header and the components.
struct GlassCircleButton: View {
    let symbol: String
    var size: CGFloat = 30
    var tint: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .islandGlass(Circle(), tint: tint)
    }
}

// MARK: - Cover color

extension NSImage {
    /// Most vivid color of the picture. A plain average of a dark cover with a red logo looks brown;
    /// this weights each pixel by how saturated and bright it is.
    func vibrantColor() -> NSColor? {
        guard let cg = cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let side = 24
        let bytesPerRow = side * 4
        var data = [UInt8](repeating: 0, count: side * bytesPerRow)
        guard let ctx = CGContext(
            data: &data, width: side, height: side, bitsPerComponent: 8, bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))

        var rSum = 0.0, gSum = 0.0, bSum = 0.0, wSum = 0.0
        var rAvg = 0.0, gAvg = 0.0, bAvg = 0.0
        for i in 0..<(side * side) {
            let r = Double(data[i * 4]) / 255, g = Double(data[i * 4 + 1]) / 255, b = Double(data[i * 4 + 2]) / 255
            rAvg += r; gAvg += g; bAvg += b
            let mx = max(r, g, b), mn = min(r, g, b)
            let sat = mx == 0 ? 0 : (mx - mn) / mx
            let w = sat * sat * mx
            if sat > 0.28 && mx > 0.3 {
                rSum += r * w; gSum += g * w; bSum += b * w; wSum += w
            }
        }
        let n = Double(side * side)
        if wSum > 0.0001 {
            return NSColor(red: rSum / wSum, green: gSum / wSum, blue: bSum / wSum, alpha: 1)
        }
        return NSColor(red: rAvg / n, green: gAvg / n, blue: bAvg / n, alpha: 1)
    }
}


// MARK: - Light behind the glass

/// Mouse position inside the open notch, shared with the ambient light.
@MainActor
final class PointerLight: ObservableObject {
    static let shared = PointerLight()
    @Published var point: CGPoint?
}

/// Soft colored light behind the components. It comes from the cover of the song and follows the mouse,
/// so the glass buttons show the color moving behind them.
struct AmbientLight: View {
    @ObservedObject var pointer = PointerLight.shared
    @ObservedObject var music = MusicManager.shared
    @Default(.glowStyle) var style
    @Default(.glowIntensity) var intensity
    @Default(.glowMotion) var motion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: !(motion && music.isPlaying))) { tl in
            light(time: tl.date.timeIntervalSinceReferenceDate)
        }
        .allowsHitTesting(false)
    }

    private func light(time t: Double) -> some View {
        GeometryReader { g in
            let c = Color(nsColor: music.glowColor)
            // Slow drift, so the red light moves behind the glass.
            let drift = (motion && music.isPlaying)
            let dx = drift ? sin(t * 0.42) * g.size.width * 0.045 : 0
            let dy = drift ? cos(t * 0.31) * g.size.height * 0.07 : 0
            let strength: Double = min(1, (style == .strong ? 1.0 : 0.9) * intensity) * (music.isPlaying ? 1 : 0.6)
            let p = pointer.point
            let px = ((p?.x ?? g.size.width / 2) - g.size.width / 2) * 0.07
            let py = ((p?.y ?? g.size.height / 2) - g.size.height / 2) * 0.07
            ZStack {
                Ellipse()
                    .fill(RadialGradient(colors: [c.opacity(strength), c.opacity(strength * 0.35), .clear], center: .center, startRadius: 0, endRadius: g.size.width * 0.34))
                    .frame(width: g.size.width * 0.8, height: g.size.height * 1.7)
                    .blur(radius: 30)
                    .position(x: g.size.width * 0.14 + px + dx, y: g.size.height * 0.62 + py + dy)
                Ellipse()
                    .fill(RadialGradient(colors: [c.opacity(strength * 0.7), .clear], center: .center, startRadius: 0, endRadius: g.size.width * 0.25))
                    .frame(width: g.size.width * 0.5, height: g.size.height * 1.3)
                    .blur(radius: 40)
                    .hueRotation(.degrees(38))
                    .position(x: g.size.width * 0.5 + px * 1.6 - dx * 1.4, y: g.size.height * 0.7 + py * 1.6 - dy * 1.2)
                if let p {
                    Circle()
                        .fill(RadialGradient(colors: [c.opacity(0.95), .clear], center: .center, startRadius: 0, endRadius: 95))
                        .frame(width: 210, height: 210)
                        .blur(radius: 22)
                        .blendMode(.screen)
                        .position(p)
                        .transition(.opacity)
                }
            }
            .saturation(1 + 0.45 * max(0, intensity - 1))
            .animation(.interactiveSpring(response: 0.28, dampingFraction: 0.85), value: p)
            .animation(.smooth(duration: 0.6), value: music.glowColor)
        }
    }
}
