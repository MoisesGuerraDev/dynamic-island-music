import Defaults
import SwiftUI

/// Button in the open notch that opens the light controls right there, so they can be tuned while watching the effect.
struct GlowQuickButton: View {
    @State private var open = false

    var body: some View {
        GlassCircleButton(symbol: "slider.horizontal.3", size: 25) { open.toggle() }
            .help("Brillo y baile")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                GlowQuickControls()
                    .onAppear { SharingStateManager.shared.hold("glow", true) }
                    .onDisappear { SharingStateManager.shared.hold("glow", false) }
            }
    }
}

struct GlowQuickControls: View {
    @Default(.innerIntensity) var innerIntensity
    @Default(.innerSpread) var innerSpread
    @Default(.innerDance) var innerDance
    @Default(.innerMotion) var innerMotion
    @Default(.glowIntensity) var glowIntensity
    @Default(.glowSpread) var glowSpread
    @Default(.danceSize) var danceSize
    @Default(.glowMotion) var glowMotion
    @Default(.lightsDance) var lightsDance
    @Default(.coverDances) var coverDances

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GlowColorControls()
            Divider()
            Toggle("Las luces bailan con la música", isOn: $lightsDance)
                .toggleStyle(.switch)
            Toggle("La carátula baila con la música", isOn: $coverDances)
                .toggleStyle(.switch)
            Divider()
            group("Luz de adentro", intensity: $innerIntensity, spread: $innerSpread, motion: $innerMotion, dance: $innerDance)
            Divider()
            group("Luz de afuera (isla cerrada)", intensity: $glowIntensity, spread: $glowSpread, motion: $glowMotion, dance: $danceSize)
            HStack {
                Spacer()
                Button("Más ajustes…") {
                    SettingsRouter.shared.requested = .glass
                    SettingsWindowController.shared.showWindow()
                }
            }
        }
        .padding(16)
        .frame(width: 400)
    }

    private func group(_ title: String, intensity: Binding<Double>, spread: Binding<GlowSize>, motion: Binding<Bool>, dance: Binding<GlowSize>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            IntensityRow(title: "Intensidad", value: intensity)
            Picker("Tamaño", selection: spread) {
                ForEach(GlowSize.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            DancePicker(title: "Baile", motion: motion, size: dance)
        }
    }
}
