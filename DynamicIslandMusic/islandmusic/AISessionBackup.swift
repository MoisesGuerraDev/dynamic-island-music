import AppKit
import CommonCrypto
import CryptoKit
import Defaults
import WebKit

/// Keeps an encrypted copy of the AI sign-ins (the cookies of the AI sites, never passwords). With no setup it lives in a
/// local folder of the app; the person can pick any other folder (Documents, a USB drive, OneDrive, Dropbox, iCloud...) and set
/// their own password to open the copy on another computer. The sign-ins come back from that file after a reinstall.
@MainActor
final class AISessionBackup: ObservableObject {
    static let shared = AISessionBackup()

    @Published private(set) var folderPath: String?
    @Published private(set) var message = ""

    static let fileName = "Sesiones-IA.dimsession"
    private static let magic = Data("DIMS1".utf8)
    /// Only the sites of the AI chats (and Google, which Gemini signs in with).
    private static let domains = ["claude.ai", "anthropic.com", "chatgpt.com", "openai.com", "deepseek.com", "google.com"]

    private var pending: Task<Void, Never>?

    init() { refreshFolderPath() }

    // MARK: Folder and passphrase

    // The keys live in a private file next to the copy (readable only by this user), not in the Keychain: every new build of an
    // app that is not signed by Apple looks like a different app to the Keychain, and macOS then asks for the Mac password.
    private struct Secrets: Codable {
        var auto: String?
        var custom: String?
    }

    private var secretsURL: URL { defaultFolder.appendingPathComponent("llave.json") }

    private func loadSecrets() -> Secrets {
        guard let data = try? Data(contentsOf: secretsURL), let secrets = try? JSONDecoder().decode(Secrets.self, from: data) else { return Secrets() }
        return secrets
    }

    private func saveSecrets(_ secrets: Secrets) {
        guard let data = try? JSONEncoder().encode(secrets) else { return }
        try? data.write(to: secretsURL, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: secretsURL.path)
    }

    /// Password the person set to open the copy on another computer (empty = not set).
    var customPassphrase: String {
        get { loadSecrets().custom ?? "" }
        set {
            var secrets = loadSecrets()
            secrets.custom = newValue.isEmpty ? nil : newValue
            saveSecrets(secrets)
        }
    }

    /// Without a custom password the key is made on this Mac: nothing to type or remember.
    private var effectivePassphrase: String {
        var secrets = loadSecrets()
        if let custom = secrets.custom, !custom.isEmpty { return custom }
        if let auto = secrets.auto, !auto.isEmpty { return auto }
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, 32, &bytes)
        let key = Data(bytes).base64EncodedString()
        secrets.auto = key
        saveSecrets(secrets)
        return key
    }

    /// The folder the person chose, or the app's own local folder when they did not choose one.
    private var defaultFolder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Dynamic Island Music", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    var usesDefaultFolder: Bool { Defaults[.sessionFolderBookmark] == nil }

    private func refreshFolderPath() {
        folderPath = withFolder { $0.path } ?? defaultFolder.path
    }

    func useDefaultFolder() {
        Defaults[.sessionFolderBookmark] = nil
        refreshFolderPath()
        message = "Se guarda en la carpeta de la app."
    }

    func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.prompt = "Elegir"
        panel.message = "Elige dónde guardar la copia de tus sesiones de IA: Documentos, un USB, OneDrive, Dropbox, iCloud Drive o cualquier carpeta."
        panel.directoryURL = URL(fileURLWithPath: "/Users/\(NSUserName())/Documents")
        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url,
              let data = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        Defaults[.sessionFolderBookmark] = data
        refreshFolderPath()
        message = "Carpeta elegida."
    }

    private func withFolder<T>(_ body: (URL) throws -> T) -> T? {
        guard let data = Defaults[.sessionFolderBookmark] else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        let opened = url.startAccessingSecurityScopedResource()
        defer { if opened { url.stopAccessingSecurityScopedResource() } }
        return try? body(url)
    }

    // MARK: Backup and restore

    /// Called whenever the cookies change: saves a fresh copy a little later, if the person turned that on.
    func scheduleBackup() {
        guard Defaults[.sessionBackupAuto] else { return }
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled else { return }
            await backupNow(quiet: true)
        }
    }

    func backupNow(quiet: Bool = false) async {
        guard let count = await withFolderAsync({ folder in try await self.write(to: folder) }) else {
            if !quiet { message = "No pude guardar la copia." }
            return
        }
        if !quiet { message = count > 0 ? "Copia guardada (\(count) cookies de las IA)." : "No hay sesiones de IA que guardar todavía." }
    }

    func restore() async {
        let restored = await withFolderAsync { folder in try await self.read(from: folder) }
        switch restored {
        case .some(let count) where count > 0:
            message = "Sesiones restauradas (\(count) cookies). Las IA ya deberían estar abiertas."
            AIWebStore.shared.reloadAll()
        case .some:
            message = "La copia está vacía."
        case .none:
            message = "No pude leer la copia. Si viene de otra computadora, escribe la misma contraseña propia aquí abajo."
        }
    }

    /// After a reinstall or on a new Mac there are no AI cookies: bring them back from the folder.
    func restoreIfFresh() async {
        guard Defaults[.sessionBackupAuto] else { return }
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
        if cookies.contains(where: { Self.isAIDomain($0.domain) }) { return }
        await restore()
    }

    private func withFolderAsync<T>(_ body: @escaping (URL) async throws -> T) async -> T? {
        guard let data = Defaults[.sessionFolderBookmark] else { return try? await body(defaultFolder) }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        let opened = url.startAccessingSecurityScopedResource()
        defer { if opened { url.stopAccessingSecurityScopedResource() } }
        return try? await body(url)
    }

    private static func isAIDomain(_ domain: String) -> Bool {
        let host = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
        return domains.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// Writes the encrypted file into a folder. Returns how many cookies it holds.
    func write(to folder: URL, passphrase override: String? = nil) async throws -> Int {
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies().filter { Self.isAIDomain($0.domain) }
        let items: [[String: Any]] = cookies.map { cookie in
            var item: [String: Any] = ["name": cookie.name, "value": cookie.value, "domain": cookie.domain, "path": cookie.path,
                                       "secure": cookie.isSecure, "httpOnly": cookie.isHTTPOnly]
            if let expires = cookie.expiresDate { item["expires"] = expires.timeIntervalSince1970 }
            if let same = cookie.sameSitePolicy { item["sameSite"] = same.rawValue }
            return item
        }
        let plain = try JSONSerialization.data(withJSONObject: items)
        var salt = Data(count: 16)
        _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        let sealed = try AES.GCM.seal(plain, using: Self.key(passphrase: override ?? effectivePassphrase, salt: salt))
        guard let combined = sealed.combined else { throw CocoaError(.coderInvalidValue) }
        try (Self.magic + salt + combined).write(to: folder.appendingPathComponent(Self.fileName), options: .atomic)
        return items.count
    }

    /// Reads the file and puts its cookies back. Returns how many.
    func read(from folder: URL) async throws -> Int {
        let file = try Data(contentsOf: folder.appendingPathComponent(Self.fileName))
        guard file.count > Self.magic.count + 16, file.prefix(Self.magic.count) == Self.magic else { throw CocoaError(.fileReadCorruptFile) }
        let salt = file.subdata(in: Self.magic.count..<(Self.magic.count + 16))
        let combined = file.suffix(from: Self.magic.count + 16)
        let plain = try AES.GCM.open(try AES.GCM.SealedBox(combined: combined), using: Self.key(passphrase: effectivePassphrase, salt: salt))
        guard let items = try JSONSerialization.jsonObject(with: plain) as? [[String: Any]] else { throw CocoaError(.fileReadCorruptFile) }

        let store = WKWebsiteDataStore.default().httpCookieStore
        var count = 0
        for item in items {
            guard let name = item["name"] as? String, let value = item["value"] as? String,
                  let domain = item["domain"] as? String, let path = item["path"] as? String, Self.isAIDomain(domain) else { continue }
            var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: value, .domain: domain, .path: path]
            if item["secure"] as? Bool == true { properties[.secure] = "TRUE" }
            if item["httpOnly"] as? Bool == true { properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE" }
            if let expires = item["expires"] as? Double {
                let date = Date(timeIntervalSince1970: expires)
                if date < Date() { continue }
                properties[.expires] = date
            }
            if let same = item["sameSite"] as? String { properties[.sameSitePolicy] = HTTPCookieStringPolicy(rawValue: same) }
            if let cookie = HTTPCookie(properties: properties) {
                await store.setCookie(cookie)
                count += 1
            }
        }
        return count
    }

    private static func key(passphrase: String, salt: Data) -> SymmetricKey {
        var derived = [UInt8](repeating: 0, count: 32)
        passphrase.withCString { password in
            salt.withUnsafeBytes { saltBytes in
                _ = CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2), password, strlen(password),
                    saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 200_000, &derived, 32)
            }
        }
        return SymmetricKey(data: derived)
    }
}
