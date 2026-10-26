import Defaults
import SwiftUI

// MARK: - Components of the open notch

enum IslandComponent: String, Codable, CaseIterable, Identifiable, Defaults.Serializable {
    case player, calendar, notes, pomodoro, camera, chat, clipboard, shelf, game, performance

    var id: String { rawValue }

    var title: String {
        switch self {
        case .player: "Reproductor"
        case .calendar: "Calendario"
        case .notes: "Notas"
        case .pomodoro: "Temporizador"
        case .camera: "Cámara"
        case .chat: "Chat de IA"
        case .clipboard: "Portapapeles"
        case .shelf: "Bandeja"
        case .game: "Juego"
        case .performance: "Rendimiento"
        }
    }

    var symbol: String {
        switch self {
        case .player: "play.rectangle"
        case .calendar: "calendar"
        case .notes: "note.text"
        case .pomodoro: "timer"
        case .camera: "camera"
        case .chat: "sparkles"
        case .clipboard: "doc.on.clipboard"
        case .shelf: "tray"
        case .game: "gamecontroller"
        case .performance: "bolt"
        }
    }

    var defaultWidth: CGFloat {
        switch self {
        case .player: 312
        case .calendar: 222
        case .notes: 178
        case .pomodoro: 159
        case .camera: 178
        case .chat: 200
        case .clipboard: 190
        case .shelf: 190
        case .game: 150
        case .performance: 170
        }
    }

    var minWidth: CGFloat {
        switch self {
        case .player: 262
        case .calendar: 150
        case .notes: 130
        case .pomodoro: 140
        case .camera: 90
        case .chat: 180
        case .clipboard: 160
        case .shelf: 160
        case .game: 120
        case .performance: 150
        }
    }

    static var defaultConfigs: [ComponentConfig] {
        let onByDefault: Set<IslandComponent> = [.player, .calendar, .notes, .pomodoro, .camera]
        return allCases.map { ComponentConfig(id: $0, enabled: onByDefault.contains($0), width: $0.defaultWidth) }
    }
}

struct ComponentConfig: Codable, Equatable, Identifiable, Defaults.Serializable {
    var id: IslandComponent
    var enabled: Bool
    var width: CGFloat
}

enum GlowStyle: String, CaseIterable, Identifiable, Defaults.Serializable {
    case off, subtle, strong
    var id: String { rawValue }
    var title: String {
        switch self {
        case .off: "Apagado"
        case .subtle: "Sutil"
        case .strong: "Fuerte"
        }
    }
}

enum AIProvider: String, CaseIterable, Identifiable, Defaults.Serializable {
    case claude, openai, gemini, deepseek, ollama
    var id: String { rawValue }
    var title: String {
        switch self {
        case .claude: "Claude"
        case .openai: "ChatGPT"
        case .gemini: "Gemini"
        case .deepseek: "DeepSeek"
        case .ollama: "Ollama (local)"
        }
    }
    var letter: String {
        switch self {
        case .claude: "C"
        case .openai: "G"
        case .gemini: "Ge"
        case .deepseek: "D"
        case .ollama: "O"
        }
    }
    var color: Color {
        switch self {
        case .claude: Color(red: 0.85, green: 0.47, blue: 0.34)
        case .openai: Color(red: 0.06, green: 0.64, blue: 0.5)
        case .gemini: Color(red: 0.26, green: 0.52, blue: 0.96)
        case .deepseek: Color(red: 0.3, green: 0.42, blue: 0.95)
        case .ollama: Color(white: 0.55)
        }
    }
    var defaultModel: String {
        switch self {
        case .claude: "claude-haiku-5-5"
        case .openai: "gpt-4o-mini"
        case .gemini: "gemini-2.0-flash"
        case .deepseek: "deepseek-chat"
        case .ollama: "llama3.2"
        }
    }
    var needsKey: Bool { self != .ollama }

    /// Official web app. The person signs in there with their own account (also with Google), no API key needed.
    var webURL: URL? {
        switch self {
        case .claude: URL(string: "https://claude.ai/new")
        case .openai: URL(string: "https://chatgpt.com/")
        case .gemini: URL(string: "https://gemini.google.com/app")
        case .deepseek: URL(string: "https://chat.deepseek.com/")
        case .ollama: nil
        }
    }

    var accountHint: String {
        switch self {
        case .claude: "Inicia sesión con tu cuenta de Claude (te llega un código al correo, o entra con Google)."
        case .openai: "Inicia sesión con tu cuenta de ChatGPT (correo, Google o Apple)."
        case .gemini: "Inicia sesión con tu cuenta de Google."
        case .deepseek: "Inicia sesión con tu cuenta de DeepSeek (correo o Google)."
        case .ollama: ""
        }
    }
}

// MARK: - Keys

extension Defaults.Keys {
    // Layout
    static let islandComponents = Key<[ComponentConfig]>("islandComponents", default: IslandComponent.defaultConfigs)
    /// Size of the open notch content. 1.0 is the design size; the default is smaller and minimal.
    static let uiScale = Key<Double>("uiScale", default: 1.0)
    /// Horizontal offset of the island from the screen center, only for Macs without a notch (with a notch it stays over it).
    static let islandOffsetX = Key<Double>("islandOffsetX", default: 0)
    /// Look up the official HD cover when the player only gives a tiny picture (browser videos).
    static let artworkHD = Key<Bool>("artworkHD", default: true)
    /// How strong the cover color is around the notch (1 = normal).
    static let glowIntensity = Key<Double>("glowIntensity", default: 2.6)
    /// Where the glow color comes from: the cover of the song, or a color the person picks.
    static let glowColorMode = Key<GlowColorMode>("glowColorMode", default: .cover)
    static let glowCustomHex = Key<String>("glowCustomHex", default: "#FF3B5C")
    static let glowCustomHex2 = Key<String>("glowCustomHex2", default: "#4D7CFF")
    /// 0 = solid black notch, 1 = full glass.
    static let glassAmount = Key<Double>("glassAmount", default: 0)
    /// Shrink the closed notch's sides to the free room in the menu bar.
    static let fitMenuBar = Key<Bool>("fitMenuBar", default: true)
    /// Thin outline around the notch.
    static let notchBorder = Key<NotchBorder>("notchBorder", default: .off)
    /// The color glow breathes and drifts slowly while music plays.
    static let glowMotion = Key<Bool>("glowMotion", default: true)
    // The light inside the open notch has its own controls (the ones above are for the light around the closed island).
    static let innerIntensity = Key<Double>("innerIntensity", default: 2.6)
    static let innerSpread = Key<GlowSize>("innerSpread", default: .medium)
    static let innerDance = Key<GlowSize>("innerDance", default: .medium)
    static let innerMotion = Key<Bool>("innerMotion", default: true)
    /// How far the colored light spreads around the notch.
    static let glowSpread = Key<GlowSize>("glowSpread", default: .medium)
    /// How much the light moves with the beat.
    static let danceSize = Key<GlowSize>("danceSize", default: .medium)
    /// Follow the real sound of the Mac (asks for the system audio permission) instead of a simulated beat.
    static let realAudioBeat = Key<Bool>("realAudioBeat", default: false)
    static let manualSize = Key<Bool>("manualSize", default: false)
    static let manualOpenWidth = Key<Double>("manualOpenWidth", default: 900)

    // Look
    static let glowStyle = Key<GlowStyle>("glowStyle", default: .subtle)
    static let liquidGlassButtons = Key<Bool>("liquidGlassButtons", default: true)
    static let liquidGlassSystem = Key<Bool>("liquidGlassSystem", default: false)
    /// Open notch as translucent glass over the desktop (the closed notch stays black like the real one).

    // Pomodoro (every duration is free, in seconds)
    static let pomoFocusSeconds = Key<Double>("pomoFocusSeconds", default: 25 * 60)
    static let pomoRestSeconds = Key<Double>("pomoRestSeconds", default: 5 * 60)
    static let pomoSprints = Key<Int>("pomoSprints", default: 4)
    static let pomoSoundEnabled = Key<Bool>("pomoSoundEnabled", default: true)
    static let pomoSoundName = Key<String>("pomoSoundName", default: "Glass")
    static let pomoSoundVolume = Key<Double>("pomoSoundVolume", default: 0.8)
    static let pomoSoundRepeat = Key<Int>("pomoSoundRepeat", default: 2)
    static let pomoCustomSound = Key<Data?>("pomoCustomSound", default: nil)
    static let pomoNotify = Key<Bool>("pomoNotify", default: true)
    static let pomoAutoNext = Key<Bool>("pomoAutoNext", default: false)
    static let pomoOpenOnFinish = Key<Bool>("pomoOpenOnFinish", default: true)

    // Notes
    static let notesFolderBookmark = Key<Data?>("notesFolderBookmark", default: nil)
    static let notesShowAge = Key<Bool>("notesShowAge", default: true)
    static let notesHideDoneAfterDays = Key<Int>("notesHideDoneAfterDays", default: 1)

    // AI chat
    static let aiProvider = Key<AIProvider>("aiProvider", default: .claude)
    static let aiEnabled = Key<[String: Bool]>("aiEnabled", default: ["claude": true, "openai": true, "gemini": true, "deepseek": true, "ollama": false])
    /// Advanced: talk to the provider with an API key instead of signing in to its website.
    static let aiUseKey = Key<[String: Bool]>("aiUseKey", default: [:])
    static let aiModels = Key<[String: String]>("aiModels", default: [:])
    static let aiSaveHistory = Key<Bool>("aiSaveHistory", default: true)

    // Clipboard
    static let clipEnabled = Key<Bool>("clipEnabled", default: true)
    static let clipPaused = Key<Bool>("clipPaused", default: false)
    static let clipMax = Key<Int>("clipMax", default: 50)
    static let clipPersist = Key<Bool>("clipPersist", default: true)
    static let clipToast = Key<Bool>("clipToast", default: true)
    static let clipIgnoredApps = Key<[String]>("clipIgnoredApps", default: [
        "com.apple.Passwords", "com.agilebits.onepassword7", "com.1password.1password",
        "com.bitwarden.desktop", "org.keepassxc.keepassxc",
    ])
    static let clipAutoDeleteDays = Key<Int>("clipAutoDeleteDays", default: 7)

    // Performance
    static let perfShowCPU = Key<Bool>("perfShowCPU", default: true)
    static let perfShowGPU = Key<Bool>("perfShowGPU", default: true)
    static let perfShowRAM = Key<Bool>("perfShowRAM", default: true)
    static let perfShowRefresh = Key<Bool>("perfShowRefresh", default: true)
    static let perfShowThermal = Key<Bool>("perfShowThermal", default: true)

    // Live activities in the closed notch
    static let liveControls = Key<Bool>("liveControls", default: true)
    static let liveSpectrum = Key<Bool>("liveSpectrum", default: true)
    static let livePerformance = Key<Bool>("livePerformance", default: false)
    static let liveBattery = Key<Bool>("liveBattery", default: false)
    /// How many live activities fit at once in the closed notch (1 to 3).
    static let liveMax = Key<Int>("liveMax", default: 2)
    /// Which activity wins when there are more than fit.
    static let livePriority = Key<LivePriority>("livePriority", default: .music)
    static let livePomodoro = Key<Bool>("livePomodoro", default: true)
}

enum LivePriority: String, Defaults.Serializable {
    case music, pomodoro
}

enum NotchBorder: String, CaseIterable, Identifiable, Defaults.Serializable {
    case off, openOnly, always
    var id: String { rawValue }
    var title: String {
        switch self {
        case .off: "Sin borde"
        case .openOnly: "Solo abierto"
        case .always: "Siempre"
        }
    }
}

enum GlowColorMode: String, CaseIterable, Identifiable, Defaults.Serializable {
    /// Follows what is playing: the colors of the cover.
    case cover
    /// Every color, slowly turning.
    case rainbow
    /// Two colors the person picks.
    case custom
    var id: String { rawValue }
    var title: String {
        switch self {
        case .cover: "Automático"
        case .rainbow: "Arcoíris"
        case .custom: "Mis colores"
        }
    }
}

enum GlowSize: String, CaseIterable, Identifiable, Defaults.Serializable {
    case small, medium, large
    var id: String { rawValue }
    var title: String {
        switch self {
        case .small: "Chico"
        case .medium: "Mediano"
        case .large: "Grande"
        }
    }
    /// Size of the light around the notch.
    var spreadFactor: CGFloat {
        switch self {
        case .small: 0.6
        case .medium: 0.85
        case .large: 1.2
        }
    }
    /// Size of the light inside the open notch (medium is the look the person approved).
    var innerFactor: CGFloat {
        switch self {
        case .small: 0.75
        case .medium: 1.12
        case .large: 1.5
        }
    }
    /// How far the beat moves the light.
    var danceFactor: Double {
        switch self {
        case .small: 0.55
        case .medium: 1.0
        case .large: 1.7
        }
    }
}
