//
//  MusicManager.swift
//  DynamicIslandMusic
//
//  Created by Harsh Vardhan  Goswami  on 03/08/24.
//
import AppKit
import Combine
import Defaults
import SwiftUI

let defaultImage: NSImage = .init(
    systemSymbolName: "heart.fill",
    accessibilityDescription: "Album Art"
)!

class MusicManager: ObservableObject {
    // MARK: - Properties
    static let shared = MusicManager()
    private var cancellables = Set<AnyCancellable>()
    private var controllerCancellables = Set<AnyCancellable>()
    private var debounceIdleTask: Task<Void, Never>?

    // Helper to check if macOS has removed support for NowPlayingController
    public private(set) var isNowPlayingDeprecated: Bool = false
    private let mediaChecker = MediaChecker()

    // Active controller
    private var activeController: (any MediaControllerProtocol)?

    // Published properties for UI
    @Published var songTitle: String = "I'm Handsome"
    @Published var artistName: String = "Me"
    @Published var albumArt: NSImage = defaultImage
    @Published var isPlaying = false
    @Published var album: String = "Self Love"
    @Published var isPlayerIdle: Bool = true
    @Published var animations: IslandAnimations = .init()
    @Published var avgColor: NSColor = .white
    /// Most vivid color of the cover. Used for the glow around the notch and the highlights.
    @Published var glowColor: NSColor = .systemPurple
    /// Second color of the cover (or the first, turned a little, when the cover has only one).
    @Published var glowColor2: NSColor = NSColor(calibratedRed: 0.55, green: 0.4, blue: 0.95, alpha: 1)
    @Published var bundleIdentifier: String? = nil
    @Published var songDuration: TimeInterval = 0
    @Published var elapsedTime: TimeInterval = 0
    @Published var timestampDate: Date = .init()
    @Published var playbackRate: Double = 1
    @Published var isShuffled: Bool = false
    @Published var repeatMode: RepeatMode = .off
    @Published var volume: Double = 0.5
    @Published var volumeControlSupported: Bool = true
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    @Published var usingAppIconForArtwork: Bool = false
    @Published var currentLyrics: String = ""
    @Published var isFetchingLyrics: Bool = false
    @Published var syncedLyrics: [(time: Double, text: String)] = []
    @Published var canFavoriteTrack: Bool = false
    @Published var isFavoriteTrack: Bool = false

    private var artworkData: Data? = nil

    // Store last values at the time artwork was changed
    private var lastArtworkTitle: String = "I'm Handsome"
    private var lastArtworkArtist: String = "Me"
    private var lastArtworkAlbum: String = "Self Love"
    private var lastArtworkBundleIdentifier: String? = nil

    @Published var isFlipping: Bool = false
    private var flipWorkItem: DispatchWorkItem?

    @Published var isTransitioning: Bool = false
    private var transitionWorkItem: DispatchWorkItem?

    // MARK: - Initialization
    init() {
        // Listen for changes to the default controller preference
        NotificationCenter.default.publisher(for: Notification.Name.mediaControllerChanged)
            .sink { [weak self] _ in
                self?.setActiveControllerBasedOnPreference()
            }
            .store(in: &cancellables)

        startAutoObservers()
        startAutoProbe()
        Defaults.publisher(keys: .glowColorMode, .glowCustomHex, .glowCustomHex2, options: [])
            .sink { [weak self] _ in self?.calculateAverageColor() }
            .store(in: &cancellables)

        // Initialize deprecation check asynchronously
        Task { @MainActor in
            do {
                self.isNowPlayingDeprecated = try await self.mediaChecker.checkDeprecationStatus()
                print("Deprecation check completed: \(self.isNowPlayingDeprecated)")
            } catch {
                print("Failed to check deprecation status: \(error). Defaulting to false.")
                self.isNowPlayingDeprecated = false
            }
            
            // Initialize the active controller after deprecation check
            self.setActiveControllerBasedOnPreference()
        }
    }

    deinit {
        destroy()
    }
    
    public func destroy() {
        debounceIdleTask?.cancel()
        cancellables.removeAll()
        controllerCancellables.removeAll()
        flipWorkItem?.cancel()
        transitionWorkItem?.cancel()

        // Release active controller
        activeController = nil
    }

    // MARK: - Automatic source

    /// While in automatic mode: Apple Music or Spotify that took over from the system's Now Playing because they are playing.
    private var autoOverride: MediaControllerType?
    private var autoObservers: [NSObjectProtocol] = []

    /// Apple Music and Spotify announce their state to everyone, so this needs no permission.
    private func startAutoObservers() {
        guard autoObservers.isEmpty else { return }
        let center = DistributedNotificationCenter.default()
        let sources: [(String, MediaControllerType)] = [
            ("com.apple.Music.playerInfo", .appleMusic),
            ("com.spotify.client.PlaybackStateChanged", .spotify),
        ]
        for (name, source) in sources {
            let token = center.addObserver(forName: NSNotification.Name(name), object: nil, queue: .main) { [weak self] note in
                let state = (note.userInfo?["Player State"] as? String)?.lowercased() ?? ""
                Task { @MainActor in self?.handleAutoEvent(source, playing: state == "playing") }
            }
            autoObservers.append(token)
        }
    }

    private var autoProbeTask: Task<Void, Never>?

    /// The notifications above only arrive when the state changes. This also catches Apple Music or Spotify that were
    /// already playing when the app started, while the system's Now Playing points at something paused (a video, say).
    private func startAutoProbe() {
        autoProbeTask?.cancel()
        autoProbeTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                await self?.probeAutoSources()
            }
        }
    }

    @MainActor
    private func probeAutoSources() async {
        guard Defaults[.mediaController] == .automatic, !isNowPlayingDeprecated, autoOverride == nil, !isPlaying else { return }
        let candidates: [(bundle: String, name: String, source: MediaControllerType)] = [
            ("com.apple.Music", "Music", .appleMusic),
            ("com.spotify.client", "Spotify", .spotify),
        ]
        for candidate in candidates {
            guard !NSRunningApplication.runningApplications(withBundleIdentifier: candidate.bundle).isEmpty else { continue }
            let state = await Task.detached { Self.playerState(of: candidate.name) }.value
            if state == "playing" {
                handleAutoEvent(candidate.source, playing: true)
                return
            }
        }
    }

    nonisolated private static func playerState(of app: String) -> String {
        var error: NSDictionary?
        let script = NSAppleScript(source: "tell application \"\(app)\" to return player state as string")
        return script?.executeAndReturnError(&error).stringValue?.lowercased() ?? ""
    }

    @MainActor
    private func handleAutoEvent(_ source: MediaControllerType, playing: Bool) {
        guard Defaults[.mediaController] == .automatic, !isNowPlayingDeprecated else { return }
        if playing {
            guard autoOverride != source else { return }
            autoOverride = source
            if let controller = createController(for: source) { setActiveController(controller) }
        } else if autoOverride == source {
            autoOverride = nil
            if let controller = createController(for: .nowPlaying) { setActiveController(controller) }
        }
    }

    // MARK: - HD cover

    private var hdCoverTask: Task<Void, Never>?
    private var hdCoverCache: [String: Data] = [:]

    /// Browser videos only give a tiny picture. Look up the official cover and swap it in when it matches the song.
    private func enhanceArtwork(title: String, artist: String, original: Data?) {
        guard Defaults[.artworkHD], !title.isEmpty else { return }
        if let original {
            let rep = NSBitmapImageRep(data: original)
            let side = max(rep?.pixelsWide ?? 0, rep?.pixelsHigh ?? 0)
            // A picture that cannot be read counts as none; a big one needs no replacement.
            if side > 0 { guard side < 500 else { return } }
        }

        let key = "\(artist)|\(title)".lowercased()
        hdCoverTask?.cancel()
        hdCoverTask = Task { [weak self] in
            let cached = await MainActor.run { self?.hdCoverCache[key] }
            let data: Data?
            if let cached { data = cached } else { data = await ArtworkSearch.hdCover(title: title, artist: artist) }
            guard let data, !Task.isCancelled, let image = NSImage(data: data) else { return }
            await MainActor.run {
                guard let self, self.songTitle == title else { return }
                self.hdCoverCache[key] = data
                self.usingAppIconForArtwork = false
                self.updateAlbumArt(newAlbumArt: image)
            }
        }
    }

    // MARK: - Setup Methods
    private func createController(for type: MediaControllerType) -> (any MediaControllerProtocol)? {
        // Cleanup previous controller
        if activeController != nil {
            controllerCancellables.removeAll()
            activeController = nil
        }

        let newController: (any MediaControllerProtocol)?

        switch type {
        case .nowPlaying, .automatic:
            // Only create NowPlayingController if not deprecated on this macOS version
            if !self.isNowPlayingDeprecated {
                newController = NowPlayingController()
            } else {
                return nil
            }
        case .appleMusic:
            newController = AppleMusicController()
        case .spotify:
            newController = SpotifyController()
        case .youtubeMusic:
            newController = YouTubeMusicController()
        }

        // Set up state observation for the new controller
        if let controller = newController {
            controller.playbackStatePublisher
                .receive(on: DispatchQueue.main)
                .sink { [weak self] state in
                    guard let self = self,
                          self.activeController === controller else { return }
                    self.updateFromPlaybackState(state)
                }
                .store(in: &controllerCancellables)
        }

        return newController
    }

    private func setActiveControllerBasedOnPreference() {
        let preferredType = Defaults[.mediaController]
        print("Preferred Media Controller: \(preferredType)")

        // If NowPlaying is deprecated but that's the preference, use Apple Music instead
        autoOverride = nil
        let controllerType = (self.isNowPlayingDeprecated && (preferredType == .nowPlaying || preferredType == .automatic))
            ? .appleMusic
            : preferredType

        if let controller = createController(for: controllerType) {
            setActiveController(controller)
        } else if controllerType != .appleMusic, let fallbackController = createController(for: .appleMusic) {
            // Fallback to Apple Music if preferred controller couldn't be created
            setActiveController(fallbackController)
        }
    }

    private func setActiveController(_ controller: any MediaControllerProtocol) {
        // Cancel any existing flip animation
        flipWorkItem?.cancel()

        // Set new active controller
        activeController = controller
        
        self.canFavoriteTrack = controller.supportsFavorite

        // Get current state from active controller
        forceUpdate()
    }

    // MARK: - Update Methods
    @MainActor
    private func updateFromPlaybackState(_ incoming: PlaybackState) {
        // A player that has no picture sometimes sends an empty one: that is the same as none.
        var state = incoming
        if state.artwork?.isEmpty == true { state.artwork = nil }
        // Check for playback state changes (playing/paused)
        if state.isPlaying != self.isPlaying {
            NSLog("Playback state changed: \(state.isPlaying ? "Playing" : "Paused")")
            withAnimation(.smooth) {
                self.isPlaying = state.isPlaying
                self.updateIdleState(state: state.isPlaying)
            }

            if state.isPlaying && !state.title.isEmpty && !state.artist.isEmpty {
                self.updateSneakPeek()
            }
        }

        // Check for changes in track metadata using last artwork change values
        let titleChanged = state.title != self.lastArtworkTitle
        let artistChanged = state.artist != self.lastArtworkArtist
        let albumChanged = state.album != self.lastArtworkAlbum
        let bundleChanged = state.bundleIdentifier != self.lastArtworkBundleIdentifier

        // Check for artwork changes
        let artworkChanged = state.artwork != nil && state.artwork != self.artworkData
        let hasContentChange = titleChanged || artistChanged || albumChanged || artworkChanged || bundleChanged

        // Handle artwork and visual transitions for changed content
        if hasContentChange {
            self.triggerFlipAnimation()

            if artworkChanged, let artwork = state.artwork {
                self.updateArtwork(artwork)
                self.enhanceArtwork(title: state.title, artist: state.artist, original: artwork)
            } else if state.artwork == nil {
                // Try to use app icon if no artwork but track changed
                if let appIconImage = AppIconAsNSImage(for: state.bundleIdentifier) {
                    self.usingAppIconForArtwork = true
                    self.updateAlbumArt(newAlbumArt: appIconImage)
                }
                // No cover from the player: look the song up so the notch shows the real album, not the app's icon.
                self.enhanceArtwork(title: state.title, artist: state.artist, original: nil)
            }
            self.artworkData = state.artwork

            if artworkChanged || state.artwork == nil {
                // Update last artwork change values
                self.lastArtworkTitle = state.title
                self.lastArtworkArtist = state.artist
                self.lastArtworkAlbum = state.album
                self.lastArtworkBundleIdentifier = state.bundleIdentifier
            }

            // Only update sneak peek if there's actual content and something changed
            if !state.title.isEmpty && !state.artist.isEmpty && state.isPlaying {
                self.updateSneakPeek()
            }

            // Fetch lyrics on content change
            self.fetchLyricsIfAvailable(bundleIdentifier: state.bundleIdentifier, title: state.title, artist: state.artist)
        }

        let timeChanged = state.currentTime != self.elapsedTime
        let durationChanged = state.duration != self.songDuration
        let playbackRateChanged = state.playbackRate != self.playbackRate
        let shuffleChanged = state.isShuffled != self.isShuffled
        let repeatModeChanged = state.repeatMode != self.repeatMode
        let volumeChanged = state.volume != self.volume
        
        if state.title != self.songTitle {
            self.songTitle = state.title
        }

        if state.artist != self.artistName {
            self.artistName = state.artist
        }

        if state.album != self.album {
            self.album = state.album
        }

        if timeChanged {
            self.elapsedTime = state.currentTime
        }

        if durationChanged {
            self.songDuration = state.duration
        }

        if playbackRateChanged {
            self.playbackRate = state.playbackRate
        }
        
        if shuffleChanged {
            self.isShuffled = state.isShuffled
        }

        if state.bundleIdentifier != self.bundleIdentifier {
            self.bundleIdentifier = state.bundleIdentifier
            // Update volume control support from active controller
            self.volumeControlSupported = activeController?.supportsVolumeControl ?? false
        }

        if repeatModeChanged {
            self.repeatMode = state.repeatMode
        }
        if state.isFavorite != self.isFavoriteTrack {
            self.isFavoriteTrack = state.isFavorite
        }
        
        if volumeChanged {
            self.volume = state.volume
        }
        
        self.timestampDate = state.lastUpdated
    }

    func toggleFavoriteTrack() {
        guard canFavoriteTrack else { return }
        // Toggle based on current state
        setFavorite(!isFavoriteTrack)
    }

    @MainActor
    private func toggleAppleMusicFavorite() async {
        let script = """
        tell application \"Music\"
            if it is running then
                try
                    set loved of current track to (not loved of current track)
                    return loved of current track
                on error
                    return false
                end try
            else
                return false
            end if
        end tell
        """

        if let result = try? await AppleScriptHelper.execute(script) {
            let loved = result.booleanValue
            self.isFavoriteTrack = loved
            self.forceUpdate()
        }
    }

    func setFavorite(_ favorite: Bool) {
        guard canFavoriteTrack else { return }
        guard let controller = activeController else { return }

        Task { @MainActor in
            await controller.setFavorite(favorite)
            try? await Task.sleep(for: .milliseconds(150))
            await controller.updatePlaybackInfo()
        }
    }

    /// Placeholder dislike function
    func dislikeCurrentTrack() {
        setFavorite(false)
    }

    // MARK: - Lyrics
    private func fetchLyricsIfAvailable(bundleIdentifier: String?, title: String, artist: String) {
        guard Defaults[.enableLyrics], !title.isEmpty else {
            DispatchQueue.main.async {
                self.isFetchingLyrics = false
                self.currentLyrics = ""
            }
            return
        }

        // Prefer native Apple Music lyrics when available
        if let bundleIdentifier = bundleIdentifier, bundleIdentifier.contains("com.apple.Music") {
            Task { @MainActor in
                self.isFetchingLyrics = true
                self.currentLyrics = ""
                do {
                    let script = """
                    tell application \"Music\"
                        if it is running then
                            if player state is playing or player state is paused then
                                try
                                    set l to lyrics of current track
                                    if l is missing value then
                                        return \"\"
                                    else
                                        return l
                                    end if
                                on error
                                    return \"\"
                                end try
                            else
                                return \"\"
                            end if
                        else
                            return \"\"
                        end if
                    end tell
                    """
                    if let result = try await AppleScriptHelper.execute(script), let lyricsString = result.stringValue, !lyricsString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        self.currentLyrics = lyricsString.trimmingCharacters(in: .whitespacesAndNewlines)
                        self.isFetchingLyrics = false
                        self.syncedLyrics = []
                        return
                    }
                } catch {
                    // fall through to web lookup
                }
                await self.fetchLyricsFromWeb(title: title, artist: artist)
            }
        } else {
            Task { @MainActor in
                self.isFetchingLyrics = true
                self.currentLyrics = ""
                await self.fetchLyricsFromWeb(title: title, artist: artist)
            }
        }
    }

    private func normalizedQuery(_ string: String) -> String {
        string
            .folding(options: .diacriticInsensitive, locale: .current)
            .replacingOccurrences(of: "\u{FFFD}", with: "")
    }

    @MainActor
    private func fetchLyricsFromWeb(title: String, artist: String) async {
        let cleanTitle = normalizedQuery(title)
        let cleanArtist = normalizedQuery(artist)
        guard let encodedTitle = cleanTitle.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let encodedArtist = cleanArtist.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            self.currentLyrics = ""
            self.isFetchingLyrics = false
            return
        }

        // LRCLIB simple search (no auth): https://lrclib.net/api/search?track_name=...&artist_name=...
        let urlString = "https://lrclib.net/api/search?track_name=\(encodedTitle)&artist_name=\(encodedArtist)"
        guard let url = URL(string: urlString) else {
            self.currentLyrics = ""
            self.isFetchingLyrics = false
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                self.currentLyrics = ""
                self.isFetchingLyrics = false
                return
            }
            if let jsonArray = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
               let first = jsonArray.first {
                // Prefer plain lyrics (syncedLyrics may also be present)
                let plain = (first["plainLyrics"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let synced = (first["syncedLyrics"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let resolved = plain.isEmpty ? synced : plain
                self.currentLyrics = resolved
                self.isFetchingLyrics = false
                if !synced.isEmpty {
                    self.syncedLyrics = self.parseLRC(synced)
                } else {
                    self.syncedLyrics = []
                }
            } else {
                self.currentLyrics = ""
                self.isFetchingLyrics = false
                self.syncedLyrics = []
            }
        } catch {
            self.currentLyrics = ""
            self.isFetchingLyrics = false
            self.syncedLyrics = []
        }
    }

    // MARK: - Synced lyrics helpers
    private func parseLRC(_ lrc: String) -> [(time: Double, text: String)] {
        var result: [(Double, String)] = []
        lrc.split(separator: "\n").forEach { lineSub in
            let line = String(lineSub)
            // Match [mm:ss.xx] or [m:ss]
            let pattern = #"\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]"#
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
            let nsLine = line as NSString
            if let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) {
                let minStr = nsLine.substring(with: match.range(at: 1))
                let secStr = nsLine.substring(with: match.range(at: 2))
                let csRange = match.range(at: 3)
                let centiStr = csRange.location != NSNotFound ? nsLine.substring(with: csRange) : "0"
                let minutes = Double(minStr) ?? 0
                let seconds = Double(secStr) ?? 0
                let centis = Double(centiStr) ?? 0
                let time = minutes * 60 + seconds + centis / 100.0
                let textStart = match.range.location + match.range.length
                let text = nsLine.substring(from: textStart).trimmingCharacters(in: .whitespaces)
                if !text.isEmpty {
                    result.append((time, text))
                }
            }
        }
        return result.sorted { $0.0 < $1.0 }
    }

    func lyricLine(at elapsed: Double) -> String {
        guard !syncedLyrics.isEmpty else { return currentLyrics }
        // Binary search for last line with time <= elapsed
        var low = 0
        var high = syncedLyrics.count - 1
        var idx = 0
        while low <= high {
            let mid = (low + high) / 2
            if syncedLyrics[mid].time <= elapsed {
                idx = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return syncedLyrics[idx].text
    }

    private func triggerFlipAnimation() {
        // Cancel any existing animation
        flipWorkItem?.cancel()

        // Create a new animation
        let workItem = DispatchWorkItem { [weak self] in
            self?.isFlipping = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self?.isFlipping = false
            }
        }

        flipWorkItem = workItem
        DispatchQueue.main.async(execute: workItem)
    }

    private func updateArtwork(_ artworkData: Data) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            if let artworkImage = NSImage(data: artworkData) {
                DispatchQueue.main.async { [weak self] in
                    self?.usingAppIconForArtwork = false
                    self?.updateAlbumArt(newAlbumArt: artworkImage)
                }
            }
        }
    }

    private func updateIdleState(state: Bool) {
        if state {
            isPlayerIdle = false
            debounceIdleTask?.cancel()
        } else {
            debounceIdleTask?.cancel()
            debounceIdleTask = Task { [weak self] in
                guard let self = self else { return }
                try? await Task.sleep(for: .seconds(Defaults[.waitInterval]))
                withAnimation {
                    self.isPlayerIdle = !self.isPlaying
                }
            }
        }
    }

    private var workItem: DispatchWorkItem?

    func updateAlbumArt(newAlbumArt: NSImage) {
        workItem?.cancel()
        withAnimation(.smooth) {
            self.albumArt = newAlbumArt
            if Defaults[.coloredSpectrogram] {
                self.calculateAverageColor()
            }
        }
    }

    // MARK: - Playback Position Estimation
    public func estimatedPlaybackPosition(at date: Date = Date()) -> TimeInterval {
        guard isPlaying else { return min(elapsedTime, songDuration) }

        let timeDifference = date.timeIntervalSince(timestampDate)
        let estimated = elapsedTime + (timeDifference * playbackRate)
        return min(max(0, estimated), songDuration)
    }

    func calculateAverageColor() {
        albumArt.averageColor { [weak self] color in
            DispatchQueue.main.async {
                withAnimation(.smooth) {
                    self?.avgColor = color ?? .white
                    guard let self else { return }
                    if self.usingAppIconForArtwork {
                        // The app's own icon says nothing about the song: soft neutral light instead of the icon's color.
                        self.glowColor = NSColor(calibratedRed: 0.62, green: 0.6, blue: 0.92, alpha: 1)
                        self.glowColor2 = NSColor(calibratedRed: 0.5, green: 0.62, blue: 0.95, alpha: 1)
                        return
                    }
                    if let palette = self.albumArt.vibrantPalette() {
                        self.glowColor = palette.primary
                        self.glowColor2 = palette.secondary ?? palette.primary.shiftedHue(by: 0.11)
                    } else {
                        self.glowColor = color ?? .systemPurple
                        self.glowColor2 = self.glowColor
                    }
                    if Defaults[.glowColorMode] == .custom {
                        let first = NSColor(hex: Defaults[.glowCustomHex]) ?? .systemPink
                        self.glowColor = first
                        self.glowColor2 = NSColor(hex: Defaults[.glowCustomHex2]) ?? first.shiftedHue(by: 0.09)
                    }
                }
            }
        }
    }

    private func updateSneakPeek() {
        if isPlaying && Defaults[.enableSneakPeek] {
            if Defaults[.sneakPeekStyles] == .standard {
                coordinator.toggleSneakPeek(status: true, type: .music)
            } else {
                coordinator.toggleExpandingView(status: true, type: .music)
            }
        }
    }

    // MARK: - Public Methods for controlling playback
    func playPause() {
        Task {
            await activeController?.togglePlay()
        }
    }

    func play() {
        Task {
            await activeController?.play()
        }
    }

    func pause() {
        Task {
            await activeController?.pause()
        }
    }

    func toggleShuffle() {
        Task {
            await activeController?.toggleShuffle()
        }
    }

    func toggleRepeat() {
        Task {
            await activeController?.toggleRepeat()
        }
    }
    
    func togglePlay() {
        Task {
            await activeController?.togglePlay()
        }
    }

    func nextTrack() {
        let before = songTitle
        let browserID = bundleIdentifier.flatMap { BrowserTabs.browsers[$0] != nil ? $0 : nil }
        Task {
            // A single YouTube video has no "next". If that is what is playing, open its Mix (the list YouTube builds from it)
            // in the same tab right away and skip once the new page is playing; the button always moves forward.
            if let id = browserID, BrowserTabs.startMix(bundleID: id, title: before) {
                for delay in [2.4, 1.0, 1.0, 1.0, 1.0, 1.0] {
                    try? await Task.sleep(for: .seconds(delay))
                    if !songTitle.isEmpty && songTitle != before { break }
                    await activeController?.nextTrack()
                }
                return
            }
            await activeController?.nextTrack()
        }
    }

    func previousTrack() {
        Task {
            await activeController?.previousTrack()
        }
    }

    func seek(to position: TimeInterval) {
        Task {
            await activeController?.seek(to: position)
        }
    }
    func skip(seconds: TimeInterval) {
        let newPos = min(max(0, elapsedTime + seconds), songDuration)
        seek(to: newPos)
    }
    
    func setVolume(to level: Double) {
        if let controller = activeController {
            Task {
                await controller.setVolume(level)
            }
        }
    }
    func openMusicApp() {
        guard let bundleID = bundleIdentifier else {
            print("Error: appBundleIdentifier is nil")
            return
        }

        let workspace = NSWorkspace.shared
        if let appURL = workspace.urlForApplication(withBundleIdentifier: bundleID) {
            let configuration = NSWorkspace.OpenConfiguration()
            workspace.openApplication(at: appURL, configuration: configuration) { (app, error) in
                if let error = error {
                    print("Failed to launch app with bundle ID: \(bundleID), error: \(error)")
                } else {
                    print("Launched app with bundle ID: \(bundleID)")
                }
            }
        } else {
            print("Failed to find app with bundle ID: \(bundleID)")
        }
    }

    func forceUpdate() {
        // Request immediate update from the active controller
        Task { [weak self] in
            if self?.activeController?.isActive() == true {
                if let youtubeController = self?.activeController as? YouTubeMusicController {
                    await youtubeController.pollPlaybackState()
                } else {
                    await self?.activeController?.updatePlaybackInfo()
                }
                // Sync volume after update
                await self?.syncVolumeFromActiveApp()
            }
        }
    }
    
    
    func syncVolumeFromActiveApp() async {
        guard let bundleID = bundleIdentifier, !bundleID.isEmpty else { return }
        
        var script: String?
        if bundleID == "com.apple.Music" {
            script = "tell application \"Music\" to get sound volume"
        } else if bundleID == "com.spotify.client" {
            script = "tell application \"Spotify\" to get sound volume"
        } else {
            // For unsupported apps, don't sync volume
            return
        }
        
        if let volumeScript = script,
           let result = try? await AppleScriptHelper.execute(volumeScript) {
            let volumeValue = result.int32Value
            let currentVolume = Double(volumeValue) / 100.0
            
            await MainActor.run {
                if abs(currentVolume - self.volume) > 0.01 {
                    self.volume = currentVolume
                }
            }
        }
    }
}
