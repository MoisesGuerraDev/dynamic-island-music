import AppKit
import Combine
import Defaults
import SwiftUI

struct NoteItem: Identifiable, Equatable {
    let id: String          // file name
    var url: URL
    var text: String
    var isTask: Bool
    var done: Bool
    var created: Date
    var due: Date? = nil
    var lead: Int = 0
}

/// Notes and tasks stored as plain Markdown files, one file per note.
/// The folder can be anywhere. If it is inside iCloud Drive, iCloud syncs it to the other devices for free.
@MainActor
final class NotesManager: ObservableObject {
    static let shared = NotesManager()

    @Published private(set) var items: [NoteItem] = []
    @Published private(set) var folder: URL
    @Published private(set) var pendingUploads = 0
    @Published private(set) var lastReload = Date()
    @Published var adding = false

    private var accessedURL: URL?
    private var pollTimer: Timer?

    private init() {
        folder = NotesManager.localFolder()
        resolveFolder()
        reload()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.reload() }
        }
    }

    // MARK: Folder

    private static func localFolder() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Notas", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    var isICloud: Bool { folder.path.contains("Mobile Documents") }

    var folderDisplay: String {
        if isICloud {
            let comps = folder.pathComponents
            if let i = comps.firstIndex(of: "com~apple~CloudDocs") {
                let rest = comps[(i + 1)...].joined(separator: " › ")
                return rest.isEmpty ? "iCloud Drive" : "iCloud Drive › \(rest)"
            }
            return "iCloud"
        }
        return folder.path.hasPrefix(NSHomeDirectory()) ? "~" + folder.path.dropFirst(NSHomeDirectory().count) : folder.path
    }

    var statusText: String {
        if !isICloud { return "Guardadas en esta carpeta de tu Mac" }
        return pendingUploads > 0 ? "Sincronizando \(pendingUploads)…" : "Sincronizado con iCloud Drive"
    }

    private func stopAccess() {
        accessedURL?.stopAccessingSecurityScopedResource()
        accessedURL = nil
    }

    private func resolveFolder() {
        stopAccess()
        if let data = Defaults[.notesFolderBookmark] {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale),
               url.startAccessingSecurityScopedResource()
            {
                accessedURL = url
                folder = url
                if stale, let fresh = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) {
                    Defaults[.notesFolderBookmark] = fresh
                }
                return
            }
        }
        folder = NotesManager.localFolder()
    }

    /// Lets the user pick the folder once. The panel opens inside iCloud Drive.
    func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Usar esta carpeta"
        panel.message = "Elige una carpeta dentro de iCloud Drive (o crea una nueva). Tus notas se guardarán ahí y iCloud las sincroniza."
        let icloud = URL(fileURLWithPath: NSHomeDirectory() + "/Library/Mobile Documents/com~apple~CloudDocs")
        if FileManager.default.fileExists(atPath: icloud.path) { panel.directoryURL = icloud }
        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url,
              let data = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        else { return }
        Defaults[.notesFolderBookmark] = data
        resolveFolder()
        reload()
    }

    func useLocalFolder() {
        Defaults[.notesFolderBookmark] = nil
        resolveFolder()
        reload()
    }

    func revealFolder() {
        NSWorkspace.shared.activateFileViewerSelecting([folder])
    }

    // MARK: Read

    func reload() {
        let fm = FileManager.default
        let keys: [URLResourceKey] = [.creationDateKey, .contentModificationDateKey, .ubiquitousItemIsUploadedKey]
        guard let urls = try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys, options: [.skipsSubdirectoryDescendants]) else {
            items = []
            return
        }
        var found: [NoteItem] = []
        var pending = 0
        for url in urls {
            let name = url.lastPathComponent
            // iCloud placeholder (".name.md.icloud"): ask for the real file and read it next time.
            if name.hasPrefix(".") && name.hasSuffix(".icloud") {
                let real = url.deletingLastPathComponent().appendingPathComponent(String(name.dropFirst().dropLast(7)))
                try? fm.startDownloadingUbiquitousItem(at: real)
                continue
            }
            guard url.pathExtension.lowercased() == "md",
                  let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let values = try? url.resourceValues(forKeys: Set(keys))
            if values?.ubiquitousItemIsUploaded == false { pending += 1 }
            let created = values?.creationDate ?? values?.contentModificationDate ?? Date()
            found.append(Self.parse(text: text, url: url, created: created))
        }
        found.sort { $0.created > $1.created }
        if found != items { items = found }
        Reminders.sync(found)
        pendingUploads = pending
        lastReload = Date()
    }

    private static func parse(text: String, url: URL, created: Date) -> NoteItem {
        let lines = text.split(whereSeparator: \.isNewline).map { String($0).trimmingCharacters(in: .whitespaces) }
        let first = lines.first(where: { !$0.isEmpty }) ?? ""
        let lower = first.lowercased()
        let reminder = lines.lazy.compactMap(Reminders.parse).first
        for (prefix, done) in [("- [ ]", false), ("* [ ]", false), ("- [x]", true), ("* [x]", true)] where lower.hasPrefix(prefix) {
            let body = String(first.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
            return NoteItem(id: url.lastPathComponent, url: url, text: body, isTask: true, done: done, created: created,
                            due: reminder?.due, lead: reminder?.lead ?? 0)
        }
        let title = first.drop(while: { $0 == "#" || $0 == " " })
        return NoteItem(id: url.lastPathComponent, url: url, text: String(title), isTask: false, done: false, created: created)
    }

    // MARK: Write

    func add(text: String, task: Bool, due: Date? = nil, lead: Int = 10) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd-HHmmss"
        let slug = clean.lowercased()
            .folding(options: .diacriticInsensitive, locale: .current)
            .map { $0.isLetter || $0.isNumber ? $0 : "-" }
            .reduce(into: "") { acc, c in if !(c == "-" && acc.last == "-") { acc.append(c) } }
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let name = "\(f.string(from: Date()))-\(String(slug.prefix(24))).md"
        let url = folder.appendingPathComponent(name)
        var body = task ? "- [ ] \(clean)\n" : "\(clean)\n"
        if task, let due {
            body += Reminders.line(due: due, lead: lead) + "\n"
            Reminders.requestPermission()
        }
        try? body.write(to: url, atomically: true, encoding: .utf8)
        reload()
    }

    /// Flips the checkbox of the first line and keeps the rest of the file (the reminder line, for one).
    func toggle(_ item: NoteItem) {
        guard item.isTask, let text = try? String(contentsOf: item.url, encoding: .utf8) else { return }
        var lines = text.components(separatedBy: "\n")
        guard let i = lines.firstIndex(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) else { return }
        lines[i] = "- [\(item.done ? " " : "x")] \(item.text)"
        try? lines.joined(separator: "\n").write(to: item.url, atomically: true, encoding: .utf8)
        reload()
    }

    func delete(_ item: NoteItem) {
        try? FileManager.default.trashItem(at: item.url, resultingItemURL: nil)
        reload()
    }

    /// Sends every finished task to the Trash.
    func deleteDone() {
        for i in items where i.isTask && i.done { try? FileManager.default.trashItem(at: i.url, resultingItemURL: nil) }
        reload()
    }

    func deleteAll() {
        for i in items { try? FileManager.default.trashItem(at: i.url, resultingItemURL: nil) }
        reload()
    }

    // MARK: Display helpers

    var visibleItems: [NoteItem] {
        let days = Defaults[.notesHideDoneAfterDays]
        return items.filter { item in
            guard item.done, days >= 0 else { return true }
            return Date().timeIntervalSince(item.created) < Double(days) * 86_400
        }
    }

    static func age(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "es")
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }
}
