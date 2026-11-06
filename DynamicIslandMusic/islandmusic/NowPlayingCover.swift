import Foundation

/// The picture of the song that is playing, taken from the system's Now Playing.
/// Apple Music does not give AppleScript the cover of songs it streams, but it does publish it to Now Playing.
enum NowPlayingCover {
    /// Two calls for the same song share one helper process instead of spawning a Perl each.
    private actor Gate {
        private var inFlight: [String: Task<Data?, Never>] = [:]

        func data(key: String, _ work: @escaping @Sendable () -> Data?) async -> Data? {
            if let task = inFlight[key] { return await task.value }
            let task = Task.detached(priority: .utility) { work() }
            inFlight[key] = task
            defer { inFlight[key] = nil }
            return await task.value
        }
    }

    private static let gate = Gate()

    static func data(bundleID: String, title: String) async -> Data? {
        await gate.data(key: "\(bundleID)|\(title)") { fetch(bundleID: bundleID, title: title) }
    }

    private static func fetch(bundleID: String, title: String) -> Data? {
        HelperProcessGuard.install()
        guard let script = Bundle.main.url(forResource: "mediaremote-adapter", withExtension: "pl"),
              let framework = Bundle.main.privateFrameworksPath?.appending("/MediaRemoteAdapter.framework") else { return nil }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = [script.path, framework, "get"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return nil }

        HelperProcessGuard.register(process)
        defer { HelperProcessGuard.unregister(process) }

        let watchdog = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 6, execute: watchdog)
        let output = pipe.fileHandleForReading.readDataToEndOfFile()
        watchdog.cancel()

        guard let info = (try? JSONSerialization.jsonObject(with: output)) as? [String: Any],
              let playing = info["title"] as? String, playing == title,
              (info["parentApplicationBundleIdentifier"] as? String ?? info["bundleIdentifier"] as? String) == bundleID,
              let encoded = info["artworkData"] as? String,
              let image = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters), image.count > 1000 else { return nil }
        return image
    }
}
