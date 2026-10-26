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
        case .player: 300
        case .calendar: 190
        case .notes: 180
        case .pomodoro: 170
        case .camera: 130
        case .chat: 220
        case .clipboard: 210
        case .shelf: 210
        case .game: 160
        case .performance: 190
        }
    }

    var minWidth: CGFloat {
        switch self {
        case .player: 280
        case .calendar: 170
        case .notes: 150
        case .pomodoro: 160
        case .camera: 110
        case .chat: 190
        case .clipboard: 170
        case .shelf: 170
        case .game: 130
        case .performance: 160
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
    case claude, openai, gemini, ollama
    var id: String { rawValue }
    var title: String {
        switch self {
        case .claude: "Claude"
        case .openai: "ChatGPT"
        case .gemini: "Gemini"
        case .ollama: "Ollama (local)"
        }
    }
    var letter: String {
        switch self {
        case .claude: "C"
        case .openai: "G"
        case .gemini: "Ge"
        case .ollama: "O"
        }
    }
    var color: Color {
        switch self {
        case .claude: Color(red: 0.85, green: 0.47, blue: 0.34)
        case .openai: Color(red: 0.06, green: 0.64, blue: 0.5)
        case .gemini: Color(red: 0.26, green: 0.52, blue: 0.96)
        case .ollama: Color(white: 0.55)
        }
    }
    var defaultModel: String {
        switch self {
        case .claude: "claude-haiku-5-5"
        case .openai: "gpt-4o-mini"
        case .gemini: "gemini-2.0-flash"
        case .ollama: "llama3.2"
        }
    }
    var needsKey: Bool { self != .ollama }
}

// MARK: - Keys

extension Defaults.Keys {
    // Layout
    static let islandComponents = Key<[ComponentConfig]>("islandComponents", default: IslandComponent.defaultConfigs)
    static let manualSize = Key<Bool>("manualSize", default: false)
    static let manualOpenWidth = Key<Double>("manualOpenWidth", default: 900)

    // Look
    static let glowStyle = Key<GlowStyle>("glowStyle", default: .subtle)
    static let liquidGlassButtons = Key<Bool>("liquidGlassButtons", default: true)
    static let liquidGlassSystem = Key<Bool>("liquidGlassSystem", default: false)

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
    static let aiEnabled = Key<[String: Bool]>("aiEnabled", default: ["claude": true, "openai": true, "gemini": false, "ollama": true])
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
    static let liveMusic = Key<Bool>("liveMusic", default: true)
    static let livePomodoro = Key<Bool>("livePomodoro", default: true)
}
