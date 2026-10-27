import Foundation

/// Presses the play/pause, next and previous keys of the keyboard, which macOS sends to the player that is showing.
/// The app is sandboxed, so the helper (the same one that measures the menu bar) does it. It needs the Accessibility
/// permission; macOS asks for it once, the first time.
@MainActor
enum MediaKeys {
    enum Key: Int { case playPause = 16, next = 17, previous = 18 }

    private static var asked = false

    /// true when the key was pressed. false when the helper has no permission yet: the caller falls back to the normal command.
    static func press(_ key: Key) async -> Bool {
        // With no player known, the key would start Apple Music: use the normal command instead.
        guard MusicManager.shared.bundleIdentifier != nil else { return false }
        if await XPCHelperClient.shared.pressMediaKey(key.rawValue) { return true }
        if !asked {
            asked = true
            XPCHelperClient.shared.requestAccessibilityAuthorization()
        }
        return false
    }
}
