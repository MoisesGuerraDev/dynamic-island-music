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
    func vibrantColor() -> NSColor? { vibrantPalette()?.primary }

    /// The two main colors of the cover: the most prominent hue, and a clearly different one when the cover has it.
    func vibrantPalette() -> (primary: NSColor, secondary: NSColor?)? {
        guard let cg = cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let side = 28
        let bytesPerRow = side * 4
        var data = [UInt8](repeating: 0, count: side * bytesPerRow)
        guard let ctx = CGContext(
            data: &data, width: side, height: side, bitsPerComponent: 8, bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))

        // 12 hue bins of 30 degrees: weight and weighted color of each.
        var weight = [Double](repeating: 0, count: 12)
        var red = [Double](repeating: 0, count: 12), green = red, blue = red
        var rAvg = 0.0, gAvg = 0.0, bAvg = 0.0
        for i in 0..<(side * side) {
            let r = Double(data[i * 4]) / 255, g = Double(data[i * 4 + 1]) / 255, b = Double(data[i * 4 + 2]) / 255
            rAvg += r; gAvg += g; bAvg += b
            let mx = max(r, g, b), mn = min(r, g, b)
            let sat = mx == 0 ? 0 : (mx - mn) / mx
            guard sat > 0.28 && mx > 0.3 else { continue }
            let c = NSColor(red: r, green: g, blue: b, alpha: 1)
            let bin = min(11, Int(c.hueComponent * 12))
            let w = sat * sat * mx
            weight[bin] += w; red[bin] += r * w; green[bin] += g * w; blue[bin] += b * w
        }
        let n = Double(side * side)
        guard let top = weight.indices.max(by: { weight[$0] < weight[$1] }), weight[top] > 0.0001 else {
            return (NSColor(red: rAvg / n, green: gAvg / n, blue: bAvg / n, alpha: 1), nil)
        }
        func color(_ bin: Int) -> NSColor {
            NSColor(red: red[bin] / weight[bin], green: green[bin] / weight[bin], blue: blue[bin] / weight[bin], alpha: 1)
        }
        // A second hue at least 60 degrees away (2 bins around the circle) with a real share of the cover.
        var second: Int?
        for bin in weight.indices where bin != top {
            let distance = min(abs(bin - top), 12 - abs(bin - top))
            guard distance >= 2, weight[bin] >= weight[top] * 0.22 else { continue }
            if second == nil || weight[bin] > weight[second!] { second = bin }
        }
        return (color(top), second.map(color))
    }
}


// MARK: - Light behind the glass

/// Mouse position inside the open notch, shared with the ambient light.
@MainActor
final class PointerLight: ObservableObject {
    static let shared = PointerLight()
    @Published var point: CGPoint?
}

/// Colored light behind the components. It comes from the cover of the song, follows the mouse and, while music plays,
/// swells with the beat. Its size and how far it dances are set in Settings.
struct AmbientLight: View {
    @ObservedObject var pointer = PointerLight.shared
    @ObservedObject var music = MusicManager.shared
    @Default(.glowStyle) var style
    @Default(.glowIntensity) var intensity
    @Default(.glowMotion) var motion
    @Default(.glowSpread) var spreadSize
    @Default(.danceSize) var danceSize

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !(motion && music.isPlaying))) { tl in
            light(date: tl.date)
        }
        .allowsHitTesting(false)
    }

    private func light(date: Date) -> some View {
        let t = date.timeIntervalSinceReferenceDate
        let playing = music.isPlaying
        let dancing = motion && playing
        let beat = dancing ? BeatPulse.shared.sample(at: date) * danceSize.danceFactor : 0
        return GeometryReader { g in
            let c = Color(nsColor: music.glowColor)
            let c2 = Color(nsColor: music.glowColor2)
            let spread = spreadSize.spreadFactor
            let strength: Double = min(1, (style == .strong ? 1.0 : 0.9) * intensity * (0.8 + 0.3 * beat)) * (playing ? 1 : 0.6)
            let p = pointer.point
            let px = ((p?.x ?? g.size.width / 2) - g.size.width / 2) * 0.07
            let py = ((p?.y ?? g.size.height / 2) - g.size.height / 2) * 0.07
            // Slow drift, so the light moves a little behind the glass.
            let dx = dancing ? sin(t * 0.42) * g.size.width * 0.03 * danceSize.danceFactor : 0
            let dy = dancing ? cos(t * 0.31) * g.size.height * 0.05 * danceSize.danceFactor : 0
            let wA = g.size.width * (0.5 + 0.05 * beat) * spread
            let hA = g.size.height * (1.2 + 0.15 * beat) * spread
            let wB = g.size.width * (0.38 + 0.04 * beat) * spread
            let hB = g.size.height * (1.0 + 0.12 * beat) * spread
            ZStack {
                Ellipse()
                    .fill(RadialGradient(colors: [c.opacity(strength), c.opacity(strength * 0.45), .clear], center: .center, startRadius: 0, endRadius: wA / 2))
                    .frame(width: wA, height: hA)
                    .blur(radius: 18 * spread)
                    .position(x: g.size.width * 0.17 + px + dx, y: g.size.height * 0.6 + py + dy)
                Ellipse()
                    .fill(RadialGradient(colors: [c2.opacity(strength * 0.8), c2.opacity(strength * 0.3), .clear], center: .center, startRadius: 0, endRadius: wB / 2))
                    .frame(width: wB, height: hB)
                    .blur(radius: 24 * spread)
                    .position(x: g.size.width * 0.58 + px * 1.6 - dx * 1.4, y: g.size.height * 0.7 + py * 1.6 - dy * 1.2)
                if let p {
                    Circle()
                        .fill(RadialGradient(colors: [c.opacity(0.9), .clear], center: .center, startRadius: 0, endRadius: 80 * spread))
                        .frame(width: 180 * spread, height: 180 * spread)
                        .blur(radius: 18 * spread)
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

/// Color glow around the notch. It swells with the beat while music plays, always right around the notch.
struct NotchGlow: View {
    let shape: IslandShape
    let color: Color
    let opacity: Double
    let radius: CGFloat
    let dances: Bool
    var amount: Double = 1

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !dances)) { tl in
            let beat = dances ? BeatPulse.shared.sample(at: tl.date) * amount : 0
            shape
                .fill(color)
                .opacity(min(1, opacity * (0.55 + 0.8 * min(beat, 1.4))))
                .blur(radius: radius * (0.85 + 0.5 * beat))
                .scaleEffect(1 + 0.04 * beat)
                .offset(y: 6)
        }
        .allowsHitTesting(false)
    }
}

extension NSColor {
    /// The same color with its hue turned by this fraction of the color wheel.
    func shiftedHue(by delta: CGFloat) -> NSColor {
        let c = usingColorSpace(.sRGB) ?? self
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        return NSColor(hue: (h + delta).truncatingRemainder(dividingBy: 1), saturation: s, brightness: b, alpha: a)
    }

    convenience init?(hex: String) {
        var text = hex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        self.init(srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
                  blue: CGFloat(value & 0xFF) / 255, alpha: 1)
    }

    var hexString: String {
        let c = usingColorSpace(.sRGB) ?? self
        return String(format: "#%02X%02X%02X", Int((c.redComponent * 255).rounded()), Int((c.greenComponent * 255).rounded()),
                      Int((c.blueComponent * 255).rounded()))
    }
}
