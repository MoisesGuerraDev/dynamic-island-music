import AppKit
import Foundation

/// Takes the person to the browser tab that plays the current song, so the speaker of the video is one tap away.
/// It only reads the titles of the tabs (to find the right one) and selects it. It never runs anything inside a page.
/// macOS asks once for the permission to control the browser.
enum BrowserTabs {
    enum Result: Error, Equatable {
        case shown        // the tab was found and selected, the browser is in front
        case browserOnly  // this browser cannot select a tab from outside: it is in front, the person finds the tab
        case noTab        // the browser answered but no tab has that title
        case notAllowed   // macOS permission to control the browser was refused
    }

    enum Family { case chromium, safari, other }

    struct Browser {
        let name: String
        /// Names of the programs that play its sound, as the system lists them.
        let audio: [String]
        let family: Family
    }

    static let browsers: [String: Browser] = [
        "com.google.Chrome": Browser(name: "Chrome", audio: ["com.google.Chrome"], family: .chromium),
        "com.brave.Browser": Browser(name: "Brave", audio: ["com.brave.Browser"], family: .chromium),
        "com.microsoft.edgemac": Browser(name: "Edge", audio: ["com.microsoft.edgemac"], family: .chromium),
        "company.thebrowser.Browser": Browser(name: "Arc", audio: ["company.thebrowser.Browser"], family: .chromium),
        "org.chromium.Chromium": Browser(name: "Chromium", audio: ["org.chromium.Chromium"], family: .chromium),
        "com.vivaldi.Vivaldi": Browser(name: "Vivaldi", audio: ["com.vivaldi.Vivaldi"], family: .chromium),
        "com.operasoftware.Opera": Browser(name: "Opera", audio: ["com.operasoftware.Opera"], family: .chromium),
        "com.apple.Safari": Browser(name: "Safari", audio: ["com.apple.Safari", "com.apple.WebKit"], family: .safari),
        "org.mozilla.firefox": Browser(name: "Firefox", audio: ["org.mozilla"], family: .other),
    ]

    /// The application name AppleScript uses.
    private static func scriptName(_ id: String) -> String? {
        switch id {
        case "com.google.Chrome": "Google Chrome"
        case "com.brave.Browser": "Brave Browser"
        case "com.microsoft.edgemac": "Microsoft Edge"
        case "company.thebrowser.Browser": "Arc"
        case "org.chromium.Chromium": "Chromium"
        case "com.vivaldi.Vivaldi": "Vivaldi"
        case "com.operasoftware.Opera": "Opera"
        case "com.apple.Safari": "Safari"
        default: nil
        }
    }

    static func show(bundleID: String, title: String) -> Result {
        guard let browser = browsers[bundleID] else { return .noTab }
        guard let appName = scriptName(bundleID), browser.family != .other else {
            NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first?.activate()
            return .browserOnly
        }
        let wanted = normalized(title)
        guard wanted.count >= 3 else { return .noTab }
        let tabName = browser.family == .safari ? "name" : "title"
        let listing = """
        tell application "\(appName)"
            set out to ""
            set wi to 0
            repeat with w in windows
                set wi to wi + 1
                set ti to 0
                repeat with t in tabs of w
                    set ti to ti + 1
                    set out to out & wi & "|" & ti & "|" & (\(tabName) of t) & linefeed
                end repeat
            end repeat
            return out
        end tell
        """
        switch run(listing) {
        case .failure(let result): return result
        case .success(let text):
            for line in text.split(separator: "\n") {
                let fields = line.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false)
                guard fields.count == 3, let w = Int(fields[0]), let t = Int(fields[1]), normalized(String(fields[2])).contains(wanted) else { continue }
                let select = browser.family == .safari
                    ? "set current tab of window \(w) to tab \(t) of window \(w)"
                    : "set active tab index of window \(w) to \(t)"
                let go = """
                tell application "\(appName)"
                    \(select)
                    set index of window \(w) to 1
                    activate
                    return "ok"
                end tell
                """
                switch run(go) {
                case .failure(let result): return result
                case .success: return .shown
                }
            }
            return .noTab
        }
    }

    private static func run(_ source: String) -> Swift.Result<String, Result> {
        var error: NSDictionary?
        // A browser that does not answer must not freeze the island.
        guard let script = NSAppleScript(source: "with timeout of 6 seconds\n" + source + "\nend timeout") else { return .failure(.noTab) }
        let output = script.executeAndReturnError(&error)
        if let error {
            return .failure((error[NSAppleScript.errorNumber] as? Int) == -1743 ? .notAllowed : .noTab)
        }
        return .success(output.stringValue ?? "")
    }

    private static func normalized(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .filter { $0.isLetter || $0.isNumber || $0 == " " }
            .trimmingCharacters(in: .whitespaces)
    }
}
