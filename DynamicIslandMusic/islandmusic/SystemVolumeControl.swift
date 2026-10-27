import SwiftUI

/// Speaker next to the player buttons: shows when the Mac has no sound and controls the system volume,
/// whatever app is playing (a browser, an editor, a game). The slider hangs from it in a small panel, so it never
/// pushes or covers the components next to the player.
struct SystemVolumeControl: View {
    @ObservedObject var volume = VolumeManager.shared
    @State private var open = false
    @State private var value: Double = 0.5
    @State private var dragging = false

    private var silent: Bool { volume.isMuted || volume.rawVolume < 0.01 }

    private var icon: String {
        if silent { return "speaker.slash.fill" }
        return volume.rawVolume < 0.34 ? "speaker.wave.1.fill" : volume.rawVolume < 0.67 ? "speaker.wave.2.fill" : "speaker.wave.3.fill"
    }

    var body: some View {
        Button {
            if silent {
                if volume.isMuted { volume.toggleMuteAction() }
                if volume.rawVolume < 0.01 { volume.setAbsolute(0.4) }
            }
            open.toggle()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(silent ? Color(red: 1, green: 0.45, blue: 0.45) : .white)
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(silent ? "Sin sonido. Toca para activarlo" : "Volumen")
        .popover(isPresented: $open, arrowEdge: .bottom) {
            HStack(spacing: 10) {
                Button { volume.toggleMuteAction() } label: {
                    Image(systemName: icon)
                        .frame(width: 20)
                        .foregroundStyle(silent ? Color(red: 1, green: 0.45, blue: 0.45) : .primary)
                }
                .buttonStyle(.plain)
                CustomSlider(
                    value: $value, range: 0...1, color: .white, dragging: $dragging, lastDragged: .constant(.distantPast),
                    onValueChange: { volume.setAbsolute(Float32($0)) },
                    onDragChange: { volume.setAbsolute(Float32($0)) })
                    .frame(width: 150, height: 12)
                Text("\(Int((volume.isMuted ? 0 : volume.rawVolume) * 100)) %")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 40, alignment: .trailing)
            }
            .padding(14)
            .onAppear { SharingStateManager.shared.hold("volume", true) }
            .onDisappear { SharingStateManager.shared.hold("volume", false) }
        }
        .onAppear {
            volume.refresh()
            value = Double(volume.rawVolume)
        }
        .onReceive(volume.$rawVolume) { if !dragging { value = Double($0) } }
    }
}
