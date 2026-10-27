import CoreAudio
import Defaults
import SwiftUI

/// Which apps are sending sound to the speakers right now. Only asks the system who is playing; nothing is recorded.
enum AudioOutputProbe {
    static func isOutputting(prefixes: [String]) -> Bool {
        func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
            AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        }
        var list = address(kAudioHardwarePropertyProcessObjectList)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &list, 0, nil, &size) == noErr, size > 0 else { return false }
        var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &list, 0, nil, &size, &ids) == noErr else { return false }
        for id in ids {
            var bundle: Unmanaged<CFString>?
            var bundleSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
            var bundleAddress = address(kAudioProcessPropertyBundleID)
            guard AudioObjectGetPropertyData(id, &bundleAddress, 0, nil, &bundleSize, &bundle) == noErr,
                  let name = bundle?.takeRetainedValue() as String?,
                  prefixes.contains(where: { name == $0 || name.hasPrefix($0 + ".") || ($0.hasSuffix("WebKit") && name.hasPrefix($0)) }) else { continue }
            var running: UInt32 = 0
            var runningSize = UInt32(MemoryLayout<UInt32>.size)
            var runningAddress = address(kAudioProcessPropertyIsRunningOutput)
            if AudioObjectGetPropertyData(id, &runningAddress, 0, nil, &runningSize, &running) == noErr, running != 0 { return true }
        }
        return false
    }
}

/// Notices when the browser says it is playing but no sound reaches the speakers (the tab or the site got muted).
/// The notice has a switch that takes the person to the tab, where the speaker of the video is one tap away.
/// It stays until the sound returns or it is closed by hand.
@MainActor
final class SilentSound: ObservableObject {
    static let shared = SilentSound()

    /// Name of the browser that plays without sound, while that is the case.
    @Published private(set) var browser: String?
    @Published private(set) var working = false
    @Published private(set) var message: String?
    /// macOS has not given the permission to control the browser yet (or it was refused): the notice offers the settings.
    @Published private(set) var needsPermission = false

    private var timer: Timer?
    private var silentSeconds = 0
    /// Song for which the notice was closed by hand: it does not come back for it.
    private var dismissedTitle: String?

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated { SilentSound.shared.tick() }
        }
    }

    private func tick() {
        guard !working else { return }
        let music = MusicManager.shared
        let volume = VolumeManager.shared
        guard Defaults[.watchBrowserSound], music.isPlaying, let id = music.bundleIdentifier, let info = BrowserTabs.browsers[id],
              !volume.isMuted, volume.rawVolume > 0.01 else {
            if !needsPermission { clear(); dismissedTitle = nil }
            return
        }
        if AudioOutputProbe.isOutputting(prefixes: info.audio) {
            clear()
            dismissedTitle = nil
        } else if dismissedTitle == music.songTitle {
            silentSeconds = 0
        } else {
            // A few seconds of grace: a video that is still loading or buffering is silent for a moment too.
            silentSeconds += 1
            if silentSeconds >= 4, browser == nil {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { browser = info.name }
            }
        }
    }

    /// Closes the notice. It stays closed for this song.
    func dismiss() {
        dismissedTitle = MusicManager.shared.songTitle
        silentSeconds = 0
        needsPermission = false
        clear()
    }

    private func clear() {
        silentSeconds = 0
        if browser != nil { withAnimation(.easeOut(duration: 0.25)) { browser = nil } }
        if message != nil { message = nil }
        if needsPermission { needsPermission = false }
    }

    #if DEBUG
    func debugShow(_ on: Bool) { browser = on ? "Chrome" : nil }
    #endif

    /// The switch: takes the person to the tab that plays the song.
    func turnOn() {
        guard !working, let id = MusicManager.shared.bundleIdentifier, let info = BrowserTabs.browsers[id] else { return }
        let title = MusicManager.shared.songTitle
        working = true
        needsPermission = false
        message = "Te llevo a la pestaña…"
        switch BrowserTabs.show(bundleID: id, title: title) {
        case .shown:
            message = "Listo, estás en la pestaña. Toca el altavoz del video (o pulsa la tecla M) para quitar el silencio."
        case .browserOnly:
            message = "Abrí \(info.name). Busca la pestaña que suena y toca su altavoz."
        case .noTab:
            message = "No encontré la pestaña que suena. Ábrela en \(info.name) y toca su altavoz."
        case .notAllowed:
            needsPermission = true
            message = "Pulsa «Permitir» en el aviso de macOS para que la isla pueda llevarte a la pestaña. Si lo negaste: Ajustes ▸ Privacidad y seguridad ▸ Automatización."
        }
        working = false
    }
}

/// Notice under the island with an Apple-style switch: "Chrome sound is off, tap to go to the tab".
struct SilentSoundToast: View {
    @ObservedObject private var model = SilentSound.shared

    var body: some View {
        if let browser = model.browser {
            HStack(spacing: 10) {
                Image(systemName: "speaker.slash.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 1, green: 0.45, blue: 0.45))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Sonido de \(browser) desactivado").font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Text(model.message ?? "Pulsa el interruptor y te llevo a la pestaña.").font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.65)).lineLimit(5).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if model.needsPermission {
                    Button("Abrir Ajustes") {
                        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                    .controlSize(.small)
                } else {
                    Toggle("", isOn: Binding(get: { false }, set: { if $0 { model.turnOn() } }))
                        .toggleStyle(.switch)
                        .labelsHidden()
                }
                Button { model.dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.6))
                        .frame(width: 22, height: 22).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Cerrar")
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(width: 460)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.black))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.14), lineWidth: 1))
            .padding(.top, 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
