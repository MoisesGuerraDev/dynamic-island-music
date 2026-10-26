import AppKit
import Defaults
import SwiftUI

extension View {
    /// Liquid Glass (macOS 26 and later) with a soft material as fallback on older systems.
    /// The user can turn it off in Settings.
    @ViewBuilder
    func islandGlass<S: Shape>(_ shape: S, interactive: Bool = true, tint: Color? = nil) -> some View {
        if Defaults[.liquidGlassButtons] {
            if #available(macOS 26.0, *) {
                if let tint {
                    self.glassEffect(interactive ? Glass.regular.tint(tint).interactive() : Glass.regular.tint(tint), in: shape)
                } else {
                    self.glassEffect(interactive ? Glass.regular.interactive() : Glass.regular, in: shape)
                }
            } else {
                self
                    .background(.ultraThinMaterial, in: shape)
                    .overlay(shape.stroke(Color.white.opacity(0.22), lineWidth: 0.6))
            }
        } else {
            self.background(Color.white.opacity(0.10), in: shape)
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
