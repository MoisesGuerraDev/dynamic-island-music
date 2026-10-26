import AppKit
import Defaults
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Window with icon tabs on top

struct IslandSettingsView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case components, general, glass, player, calendar, pomodoro, notes, ai, clipboard, performance, display, live, hud, battery, shelf, shortcuts, advanced, about
        var id: String { rawValue }
        var title: String {
            switch self {
            case .components: "Componentes"
            case .general: "General"
            case .glass: "Brillo"
            case .player: "Reproductor"
            case .calendar: "Calendario"
            case .pomodoro: "Pomodoro"
            case .notes: "Notas"
            case .ai: "IA"
            case .clipboard: "Portapapeles"
            case .performance: "Rendimiento"
            case .display: "Pantalla"
            case .live: "En vivo"
            case .hud: "HUDs"
            case .battery: "Batería"
            case .shelf: "Bandeja"
            case .shortcuts: "Atajos"
            case .advanced: "Avanzado"
            case .about: "Acerca de"
            }
        }
        var symbol: String {
            switch self {
            case .components: "square.grid.2x2"
            case .general: "gearshape"
            case .glass: "sparkles.rectangle.stack"
            case .player: "play.rectangle"
            case .calendar: "calendar"
            case .pomodoro: "timer"
            case .notes: "note.text"
            case .ai: "sparkles"
            case .clipboard: "doc.on.clipboard"
            case .performance: "bolt"
            case .display: "display"
            case .live: "waveform"
            case .hud: "dial.medium"
            case .battery: "battery.100.bolt"
            case .shelf: "tray"
            case .shortcuts: "keyboard"
            case .advanced: "gearshape.2"
            case .about: "info.circle"
            }
        }
    }

    @State private var tab: Tab = .components
    @State private var accentTrigger = UUID()

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(Tab.allCases) { t in
                        Button { tab = t } label: {
                            VStack(spacing: 3) {
                                Image(systemName: t.symbol).font(.system(size: 18, weight: .regular)).frame(height: 22)
                                Text(t.title).font(.system(size: 11))
                            }
                            .frame(width: 78, height: 50)
                            .foregroundStyle(tab == t ? Color.effectiveAccent : Color.secondary)
                            .background(tab == t ? Color.primary.opacity(0.09) : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            Divider()
            Group {
                switch tab {
                case .components: ComponentsSettings()
                case .general: GeneralSettings()
                case .glass: GlassSettings()
                case .player: Media()
                case .calendar: CalendarSettings()
                case .pomodoro: PomodoroSettings()
                case .notes: NotesSettings()
                case .ai: AISettings()
                case .clipboard: ClipboardSettings()
                case .performance: PerformanceSettings()
                case .display: DisplaySettings()
                case .live: LiveSettings()
                case .hud: HUD()
                case .battery: Charge()
                case .shelf: Shelf()
                case .shortcuts: Shortcuts()
                case .advanced: Advanced()
                case .about: AboutIsland()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .formStyle(.grouped)
        .frame(width: 780, height: 660)
        .background(Color(NSColor.windowBackgroundColor))
        .tint(.effectiveAccent)
        .id(accentTrigger)
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("AccentColorChanged"))) { _ in
            accentTrigger = UUID()
        }
    }
}

// MARK: - Components

struct ComponentsSettings: View {
    @ObservedObject var layout = LayoutManager.shared

    var body: some View {
        let usage = layout.usage(for: NSScreen.main?.displayUUID)
        VStack(alignment: .leading, spacing: 12) {
            Text("Componentes del notch").font(.title3.bold())
            Text("Enciende, apaga, ordena y cambia el tamaño. Lo que no cabe en tu pantalla pasa a otra página, nunca se aprieta. También puedes editar directo en el notch con el lápiz.")
                .font(.callout).foregroundStyle(.secondary)

            HStack {
                ProgressView(value: min(usage, 100), total: 100).tint(usage > 100 ? .orange : .accentColor)
                Text(String(format: "Espacio usado: %.0f%%", usage))
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(usage > 100 ? .orange : .secondary)
            }
            if usage > 100 {
                Text("No caben todos en esta pantalla: el resto pasa a la página 2 del notch.")
                    .font(.footnote).foregroundStyle(.orange)
            }

            List {
                ForEach(layout.configs) { cfg in
                    HStack(spacing: 10) {
                        Toggle("", isOn: Binding(get: { cfg.enabled }, set: { layout.setEnabled(cfg.id, $0) })).labelsHidden()
                        Image(systemName: cfg.id.symbol).frame(width: 22)
                        Text(cfg.id.title)
                        Spacer()
                        Text("\(Int(cfg.width)) pt").font(.system(.callout, design: .monospaced)).foregroundStyle(.secondary)
                        Stepper("", value: Binding(get: { cfg.width }, set: { layout.resize(cfg.id, to: $0) }), in: cfg.id.minWidth...520, step: 10)
                            .labelsHidden()
                    }
                    .padding(.vertical, 2)
                }
                .onMove { layout.configs.move(fromOffsets: $0, toOffset: $1) }
            }
            .listStyle(.inset)

            HStack {
                Button("Restablecer") { layout.reset() }
                Spacer()
                Text("Arrastra las filas para cambiar el orden.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(20)
    }
}

// MARK: - Brillo y vidrio

struct GlassSettings: View {
    @Default(.glowStyle) var glowStyle
    @Default(.liquidGlassButtons) var glassButtons

    var body: some View {
        Form {
            Section {
                Picker("Brillo alrededor del notch", selection: $glowStyle) {
                    ForEach(GlowStyle.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Brillo")
            } footer: {
                Text("El estilo lo eliges tú, pero el color siempre sale de la carátula de la canción que suena: si la portada es roja, el brillo es rojo.")
            }
            Section {
                Defaults.Toggle("Botones de vidrio", key: .liquidGlassButtons)
                Defaults.Toggle("Usar el Liquid Glass del sistema (macOS 26)", key: .liquidGlassSystem)
            } header: {
                Text("Vidrio")
            } footer: {
                Text("Por defecto el vidrio es el del diseño: translúcido, con borde brillante, y la luz de color de la carátula se ve a través y sigue al mouse. Si prefieres el Liquid Glass nativo de macOS 26, actívalo arriba.")
            }
        }
    }
}

// MARK: - Pomodoro

struct DurationField: View {
    let title: String
    @Default var seconds: Double
    var onChange: () -> Void = {}
    @State private var text = ""

    init(_ title: String, key: Defaults.Key<Double>, onChange: @escaping () -> Void = {}) {
        self.title = title
        _seconds = Default(key)
        self.onChange = onChange
    }

    var body: some View {
        LabeledContent(title) {
            TextField("", text: $text)
                .multilineTextAlignment(.trailing)
                .frame(width: 100)
                .font(.system(.body, design: .monospaced))
                .onSubmit(commit)
                .onAppear { text = TimeText.clock(seconds) }
                .onChange(of: seconds) { _, v in text = TimeText.clock(v) }
        }
    }

    private func commit() {
        if let s = TimeText.parse(text), s > 0 {
            seconds = s
            onChange()
        }
        text = TimeText.clock(seconds)
    }
}

struct PomodoroSettings: View {
    @ObservedObject var pomo = PomodoroManager.shared
    @Default(.pomoSprints) var sprints
    @Default(.pomoSoundEnabled) var soundOn
    @Default(.pomoSoundName) var soundName
    @Default(.pomoSoundVolume) var volume
    @Default(.pomoSoundRepeat) var repeats

    var body: some View {
        Form {
            Section {
                DurationField("Concentración", key: .pomoFocusSeconds) { pomo.durationsChanged() }
                DurationField("Descanso", key: .pomoRestSeconds) { pomo.durationsChanged() }
                Stepper("Número de sprints: \(sprints)", value: $sprints, in: 1...999)
            } header: {
                Text("Tiempos")
            } footer: {
                Text("Pon el tiempo que quieras, sin límite. Escribe 25 para 25 minutos, 1:30 para 1 minuto y 30 segundos, o 1:30:00 para una hora y media. Pulsa Intro para guardar.")
            }

            Section {
                Toggle("Sonar cuando termine", isOn: $soundOn)
                if soundOn {
                    Picker("Sonido", selection: $soundName) {
                        ForEach(PomodoroManager.systemSounds, id: \.self) { Text($0).tag($0) }
                    }
                    LabeledContent("Tu propio sonido") {
                        HStack {
                            Text(pomo.customSoundName ?? "Ninguno").foregroundStyle(.secondary).lineLimit(1)
                            Button("Elegir…") { pomo.chooseCustomSound() }
                            if pomo.customSoundName != nil { Button("Quitar") { pomo.clearCustomSound() } }
                        }
                    }
                    HStack {
                        Text("Volumen")
                        Slider(value: $volume, in: 0.1...1)
                    }
                    Stepper("Repetir el sonido \(repeats) \(repeats == 1 ? "vez" : "veces")", value: $repeats, in: 1...10)
                    HStack {
                        Button("Probar sonido") { pomo.previewSound() }
                        Button("Detener") { pomo.stopSound() }
                    }
                }
            } header: {
                Text("Sonido")
            }

            Section {
                Defaults.Toggle("Avisar con una notificación", key: .pomoNotify)
                Defaults.Toggle("Abrir el notch un momento al terminar", key: .pomoOpenOnFinish)
                Defaults.Toggle("Empezar solo la siguiente fase", key: .pomoAutoNext)
                Defaults.Toggle("Mostrar el tiempo con el notch cerrado", key: .livePomodoro)
            } header: {
                Text("Avisos")
            }
        }
    }
}

// MARK: - Notes

struct NotesSettings: View {
    @ObservedObject var notes = NotesManager.shared
    @Default(.notesShowAge) var showAge
    @Default(.notesHideDoneAfterDays) var hideAfter
    @State private var confirmDelete = false

    var body: some View {
        Form {
            Section {
                LabeledContent("Carpeta") { Text(notes.folderDisplay).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.trailing) }
                LabeledContent("Estado") { Text(notes.statusText).foregroundStyle(notes.pendingUploads > 0 ? .orange : .secondary) }
                HStack {
                    Button("Elegir carpeta en iCloud Drive…") { notes.chooseFolder() }
                    Button("Usar una carpeta local") { notes.useLocalFolder() }
                    Button("Mostrar en Finder") { notes.revealFolder() }
                }
            } header: {
                Text("Sincronizar con iCloud Drive")
            } footer: {
                Text("Cada nota es un archivo de texto (.md) en esa carpeta. Eliges la carpeta una sola vez y después todo es automático: iCloud la sincroniza con tu iPhone y tus otras computadoras sin pagar nada más. Las tareas se guardan como \"- [ ]\" y \"- [x]\" y se ven como casillas en Obsidian. iCloud Drive tiene que estar activado en este Mac.")
            }
            Section {
                Toggle("Mostrar cuánto hace que las creaste", isOn: $showAge)
                Stepper("Ocultar tareas hechas después de \(hideAfter) \(hideAfter == 1 ? "día" : "días")", value: $hideAfter, in: 0...365)
            } header: {
                Text("Notas y tareas")
            }
            Section {
                Button("Mover todas las notas a la papelera…", role: .destructive) { confirmDelete = true }
                    .confirmationDialog("¿Mover todas las notas a la papelera?", isPresented: $confirmDelete) {
                        Button("Mover a la papelera", role: .destructive) { notes.deleteAll() }
                    }
            } header: {
                Text("Datos")
            }
        }
    }
}

// MARK: - AI

struct AISettings: View {
    @ObservedObject var chat = AIChatManager.shared
    @Default(.aiProvider) var provider
    @Default(.aiEnabled) var enabled
    @Default(.aiSaveHistory) var saveHistory
    @State private var keys: [String: String] = [:]
    @State private var models: [String: String] = [:]

    var body: some View {
        Form {
            Section {
                Picker("IA por defecto", selection: $provider) {
                    ForEach(AIProvider.allCases) { Text($0.title).tag($0) }
                }
                .onChange(of: provider) { _, p in chat.provider = p }
            } footer: {
                Text("Es la que sale en el botón junto al calendario. Dentro del chat puedes cambiar de IA.")
            }

            ForEach(AIProvider.allCases) { p in
                Section {
                    Toggle("Disponible en el chat", isOn: Binding(
                        get: { enabled[p.rawValue] ?? false },
                        set: { var e = enabled; e[p.rawValue] = $0; enabled = e }))
                    TextField("Modelo", text: Binding(
                        get: { models[p.rawValue] ?? chat.model(for: p) },
                        set: { models[p.rawValue] = $0; chat.setModel($0, for: p) }))
                    if p.needsKey {
                        SecureField("Clave de API", text: Binding(
                            get: { keys[p.rawValue] ?? "" },
                            set: { keys[p.rawValue] = $0; KeychainStore.set($0, for: p.rawValue) }))
                    } else {
                        Text("Ollama corre en tu Mac (localhost:11434). No necesita clave ni internet.").font(.footnote).foregroundStyle(.secondary)
                    }
                } header: {
                    Text(p.title)
                }
            }

            Section {
                Toggle("Guardar el historial del chat en este Mac", isOn: $saveHistory)
                Button("Borrar el historial ahora", role: .destructive) { chat.clear() }
            } header: {
                Text("Privacidad")
            } footer: {
                Text("Cada persona pone su propia clave de API y paga solo lo que use a su proveedor; esta app no cobra ni recibe nada. La clave se guarda en el Llavero de macOS y los mensajes van directo de tu Mac al proveedor, sin servidor intermedio. No se usa tu suscripción de ChatGPT ni de Claude: eso lo prohíben sus términos en apps de terceros.")
            }
        }
        .onAppear {
            for p in AIProvider.allCases where p.needsKey { keys[p.rawValue] = KeychainStore.get(p.rawValue) ?? "" }
        }
    }
}

// MARK: - Clipboard

struct ClipboardSettings: View {
    @ObservedObject var clip = ClipboardManager.shared
    @Default(.clipMax) var maxItems
    @Default(.clipAutoDeleteDays) var days
    @Default(.clipIgnoredApps) var ignored

    var body: some View {
        Form {
            Section {
                Defaults.Toggle("Activar el portapapeles", key: .clipEnabled)
                Defaults.Toggle("Pausar", key: .clipPaused)
                Defaults.Toggle("Guardar el historial de texto en el disco", key: .clipPersist)
                Defaults.Toggle("Aviso breve al copiar", key: .clipToast)
                Stepper("Máximo de elementos: \(maxItems)", value: $maxItems, in: 5...500, step: 5)
                Stepper(days == 0 ? "No borrar solo" : "Borrar solo después de \(days) \(days == 1 ? "día" : "días")", value: $days, in: 0...365)
            } header: {
                Text("General")
            } footer: {
                Text("Se ignora todo lo que macOS marca como secreto y las apps de contraseñas de esta lista. Las imágenes solo se guardan en memoria.")
            }
            Section {
                ForEach(ignored, id: \.self) { id in
                    HStack {
                        Text(id).font(.system(.callout, design: .monospaced))
                        Spacer()
                        Button { ignored.removeAll { $0 == id } } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain)
                    }
                }
                Button("Agregar una app…") { addApp() }
            } header: {
                Text("Apps ignoradas")
            }
            Section {
                Button("Borrar el historial", role: .destructive) { clip.clear() }
            }
        }
    }

    private func addApp() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.application]
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .OK, let url = panel.url, let id = Bundle(url: url)?.bundleIdentifier, !ignored.contains(id) {
            ignored.append(id)
        }
    }
}

// MARK: - Performance

struct PerformanceSettings: View {
    var body: some View {
        Form {
            Section {
                Defaults.Toggle("Procesador (CPU)", key: .perfShowCPU)
                Defaults.Toggle("Tarjeta gráfica (GPU)", key: .perfShowGPU)
                Defaults.Toggle("Memoria (RAM)", key: .perfShowRAM)
                Defaults.Toggle("Frecuencia de la pantalla (Hz)", key: .perfShowRefresh)
                Defaults.Toggle("Estado térmico", key: .perfShowThermal)
            } header: {
                Text("Qué mostrar")
            } footer: {
                Text("Todo se lee de este Mac y no sale de él. La app solo mide mientras el componente está a la vista. Los FPS de otros programas no se pueden leer en macOS, por eso se muestra la frecuencia de la pantalla. Las temperaturas exactas no las da macOS sin permisos especiales: se muestra el estado térmico.")
            }
        }
    }
}

// MARK: - Screen and computer

struct DisplaySettings: View {
    @Default(.manualSize) var manual
    @Default(.manualOpenWidth) var manualWidth
    @Default(.uiScale) var scale
    @State private var screens: [SystemInfo.ScreenInfo] = []

    var body: some View {
        Form {
            Section {
                LabeledContent("Equipo") { Text(SystemInfo.friendlyModel) }
                LabeledContent("Identificador") { Text(SystemInfo.modelID).font(.system(.body, design: .monospaced)) }
                LabeledContent("Chip") { Text(SystemInfo.chip) }
                LabeledContent("Sistema") { Text("macOS \(SystemInfo.osVersion)") }
            } header: {
                Text("Equipo detectado")
            } footer: {
                Text("La app lee esto de tu Mac. No captura imágenes de tu pantalla ni la graba.")
            }

            ForEach(screens) { s in
                Section {
                    LabeledContent("Se ve como") { Text("\(Int(s.points.width)) × \(Int(s.points.height)) pt") }
                    LabeledContent("Pantalla real") { Text("\(Int(s.pixels.width)) × \(Int(s.pixels.height)) px  (\(Int(s.scale))x)") }
                    LabeledContent("Frecuencia") { Text("\(s.hz) Hz") }
                    LabeledContent("Notch") {
                        Text(s.notch.map { "\(Int($0.width)) × \(Int($0.height)) pt" } ?? "Sin notch: se dibuja arriba y al centro")
                    }
                    LabeledContent("Ancho máximo abierto") { Text("\(Int(s.capacity)) pt") }
                } header: {
                    Text(s.name)
                }
            }

            Section {
                HStack {
                    Text("Tamaño")
                    Slider(value: $scale, in: 0.55...1.1, step: 0.05)
                    Text("\(Int(scale * 100)) %").font(.system(.body, design: .monospaced)).frame(width: 60)
                }
            } header: {
                Text("Tamaño del notch")
            } footer: {
                Text("Más pequeño es más minimalista; 100 % es el tamaño del diseño original. Lo que no cabe pasa a otra página.")
            }
            Section {
                Toggle("Ajustar el ancho a mano", isOn: $manual)
                if manual {
                    HStack {
                        Slider(value: $manualWidth, in: 480...1300, step: 10)
                        Text("\(Int(manualWidth)) pt").font(.system(.body, design: .monospaced)).frame(width: 70)
                    }
                }
            } header: {
                Text("Ajuste manual")
            } footer: {
                Text("Apagado, la app se adapta sola: usa cerca del 72 % del ancho de cada pantalla. Los componentes que no caben pasan a otra página.")
            }
        }
        .onAppear { screens = SystemInfo.screens() }
        .onChange(of: manual) { _, _ in NotificationCenter.default.post(name: .islandLayoutChanged, object: nil) }
        .onChange(of: manualWidth) { _, _ in NotificationCenter.default.post(name: .islandLayoutChanged, object: nil) }
        .onChange(of: scale) { _, _ in NotificationCenter.default.post(name: .islandLayoutChanged, object: nil) }
    }
}

// MARK: - Live activities

struct LiveSettings: View {
    @ObservedObject var coordinator = BoringViewCoordinator.shared

    var body: some View {
        Form {
            Section {
                Toggle("Música sonando", isOn: $coordinator.musicLiveActivityEnabled)
                Defaults.Toggle("Pomodoro en marcha", key: .livePomodoro)
                Defaults.Toggle("Mostrar la carátula junto al temporizador si suena música", key: .liveMusic)
            } header: {
                Text("Qué se muestra con el notch cerrado")
            } footer: {
                Text("Si hay música y Pomodoro a la vez, la carátula va a la izquierda del notch y el tiempo del temporizador a la derecha. Cuando termina el Pomodoro, el notch se abre un momento y suena el aviso (se configura en la pestaña Pomodoro).")
            }
        }
    }
}

// MARK: - About

struct AboutIsland: View {
    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("App") { Text(AppInfo.name) }
                LabeledContent("Versión") { Text(version) }
                LabeledContent("Licencia") { Text("GPL-3.0, código abierto") }
                LabeledContent("Basada en") { Text("Boring Notch, de TheBoredTeam") }
                LabeledContent("Datos enviados") { Text("Ninguno") }
            } header: {
                Text("Esta app")
            } footer: {
                Text("No tiene telemetría ni analíticas. Solo se conecta a internet cuando tú lo pides: el chat de IA con tu proveedor, y las letras de las canciones. Las actualizaciones automáticas están desactivadas.")
            }
            Section {
                Button("Abrir la carpeta de datos") {
                    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                    NSWorkspace.shared.activateFileViewerSelecting([base])
                }
                Link("Boring Notch en GitHub", destination: URL(string: "https://github.com/TheBoredTeam/boring.notch")!)
            }
        }
    }
}
