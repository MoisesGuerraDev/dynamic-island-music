import AppKit
import Defaults
import SwiftUI

/// Color of the light: automatic (follows what is playing), rainbow, or two colors the person picks with swatches,
/// the color wheel or the eyedropper. Used in the quick panel and in Settings.
struct GlowColorControls: View {
    @Default(.glowColorMode) var mode
    @Default(.glowCustomHex) var hex1
    @Default(.glowCustomHex2) var hex2

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Color", selection: $mode) {
                ForEach(GlowColorMode.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)

            switch mode {
            case .cover:
                Text("Toma los colores de lo que estás escuchando.")
                    .font(.caption).foregroundStyle(.secondary)
            case .rainbow:
                RainbowStrip()
                Text("Todos los colores, girando despacio, adentro y en la isla.")
                    .font(.caption).foregroundStyle(.secondary)
            case .custom:
                ColorSlot(title: "Color 1", hex: $hex1)
                ColorSlot(title: "Color 2", hex: $hex2)
            }
        }
    }
}

private struct RainbowStrip: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            let stops = (0...6).map { Color(hue: (t * 0.045 + Double($0) / 6).truncatingRemainder(dividingBy: 1), saturation: 0.95, brightness: 1) }
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(LinearGradient(colors: stops, startPoint: .leading, endPoint: .trailing))
                .frame(height: 12)
        }
    }
}

/// One color: swatches, the system color wheel and an eyedropper that picks any color on screen.
private struct ColorSlot: View {
    let title: String
    @Binding var hex: String

    private static let presets = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#32ADE6",
                                  "#4D7CFF", "#5856D6", "#AF52DE", "#FF2D55", "#F2F2F7"]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Text(title).font(.subheadline.weight(.medium)).frame(width: 52, alignment: .leading)
                ColorPicker("", selection: Binding(
                    get: { Color(nsColor: NSColor(hex: hex) ?? .systemPink) },
                    set: { hex = NSColor($0).hexString }), supportsOpacity: false)
                    .labelsHidden()
                    .help("Rueda de colores")
                Button {
                    NSColorSampler().show { picked in
                        if let picked { hex = picked.hexString }
                    }
                } label: {
                    Label("Gotero", systemImage: "eyedropper")
                }
                .help("Elige cualquier color de la pantalla")
                Spacer(minLength: 0)
            }
            HStack(spacing: 6) {
                ForEach(Self.presets, id: \.self) { preset in
                    let selected = hex.uppercased() == preset
                    Circle()
                        .fill(Color(nsColor: NSColor(hex: preset) ?? .gray))
                        .frame(width: 20, height: 20)
                        .overlay(Circle().stroke(Color.white.opacity(selected ? 0.95 : 0.2), lineWidth: selected ? 2.5 : 1))
                        .onTapGesture { hex = preset }
                }
            }
        }
    }
}
