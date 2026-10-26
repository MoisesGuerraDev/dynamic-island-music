import SwiftUI
import WebKit

/// Web view that asks the notch for the keyboard the moment it is clicked, so typing works even when another app was in front.
final class FocusWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        Task { @MainActor in KeyboardFocus.shared.request() }
        super.mouseDown(with: event)
    }
}

/// Keeps one web view per AI, so the conversation and the session stay alive when you switch tabs or close the notch.
/// The person signs in on the official site with their own account; the app never sees the password.
@MainActor
final class AIWebStore: NSObject, WKNavigationDelegate, WKUIDelegate, ObservableObject {
    static let shared = AIWebStore()

    /// What went wrong loading each page (nil = fine), and which pages are still loading.
    @Published private(set) var errors: [AIProvider: String] = [:]
    @Published private(set) var loading: Set<AIProvider> = []

    private func provider(of web: WKWebView) -> AIProvider? {
        views.first { $0.value === web }?.key
    }

    func reload(_ provider: AIProvider) {
        errors[provider] = nil
        let web = view(for: provider)
        if web.url == nil || web.url?.absoluteString == "about:blank", let url = provider.webURL {
            web.load(URLRequest(url: url))
        } else {
            web.reload()
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if let p = provider(of: webView) { loading.insert(p); errors[p] = nil }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let p = provider(of: webView) { loading.remove(p) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        report(error, for: webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        report(error, for: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if let p = provider(of: webView) { errors[p] = "La página se cerró sola. Pulsa reintentar."; loading.remove(p) }
    }

    private func report(_ error: Error, for webView: WKWebView) {
        guard let p = provider(of: webView) else { return }
        loading.remove(p)
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return }   // a redirect replaced the load: not a failure
        errors[p] = "No pude cargar \(p.title): \(error.localizedDescription)"
        #if DEBUG
        try? "load error \(code): \(error.localizedDescription)".write(
            to: FileManager.default.temporaryDirectory.appendingPathComponent("ai-error.txt"), atomically: true, encoding: .utf8)
        #endif
    }
    private var views: [AIProvider: WKWebView] = [:]
    private var popups: [ObjectIdentifier: NSPanel] = [:]

    private static let userAgent =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

    /// Hosts that take part in signing in; they stay inside the notch.
    private static let loginHosts = ["google.com", "apple.com", "microsoft.com", "live.com", "openai.com", "chatgpt.com",
                                     "anthropic.com", "claude.ai", "deepseek.com", "gstatic.com", "recaptcha.net",
                                     "cloudflare.com", "auth0.com", "github.com"]

    /// Passkeys (WebAuthn) need a real browser: inside the notch Google would start the "use your phone / Bluetooth" flow and
    /// fail with an error. Hiding them makes Google (and the AI sites) fall back to the normal password and code sign-in.
    private static let withoutPasskeys = """
    (function () {
      try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true }); } catch (e) {}
      try {
        var creds = navigator.credentials;
        if (creds) {
          var get = creds.get ? creds.get.bind(creds) : null;
          var create = creds.create ? creds.create.bind(creds) : null;
          var block = function () { return Promise.reject(new DOMException('The operation is not allowed.', 'NotAllowedError')); };
          creds.get = function (o) { return (o && o.publicKey) ? block() : (get ? get(o) : block()); };
          creds.create = function (o) { return (o && o.publicKey) ? block() : (create ? create(o) : block()); };
        }
      } catch (e) {}
    })();
    """

    func view(for provider: AIProvider) -> WKWebView {
        if let existing = views[provider] { return existing }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.userContentController.addUserScript(
            WKUserScript(source: Self.withoutPasskeys, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let web = FocusWebView(frame: .zero, configuration: config)
        web.customUserAgent = Self.userAgent
        web.navigationDelegate = self
        web.uiDelegate = self
        web.appearance = NSAppearance(named: .darkAqua)
        web.underPageBackgroundColor = .black
        web.allowsBackForwardNavigationGestures = true
        if let url = provider.webURL { web.load(URLRequest(url: url)) }
        views[provider] = web
        return web
    }

    #if DEBUG
    /// Test hook: writes what the current AI page shows (and whether it has keyboard focus) to a file.
    func debugProbe() {
        let web = view(for: AIChatManager.shared.provider)
        let js = "JSON.stringify({url: location.href, title: document.title, focus: document.hasFocus(), passkeys: typeof PublicKeyCredential, active: document.activeElement ? document.activeElement.tagName + '#' + (document.activeElement.id || '') : '', typed: document.activeElement && (document.activeElement.value || document.activeElement.innerText) ? String(document.activeElement.value || document.activeElement.innerText).slice(0, 40) : '', text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 300)})"
        let panels = NSApp.windows.compactMap { $0 as? BoringNotchSkyLightWindow }
        let native = panels.map { "key=\($0.isKeyWindow) canKey=\($0.canBecomeKey) first=\(String(describing: $0.firstResponder.map { type(of: $0) })) wkInWindow=\(web.window === $0)" }.joined(separator: "; ")
        let appState = "appActive=\(NSApp.isActive) wantsKey=\(KeyboardFocus.shared.wantsKey) loading=\(web.isLoading) progress=\(Int(web.estimatedProgress * 100)) nativeURL=\(web.url?.absoluteString ?? "nil") title=\(web.title ?? "")"
        web.evaluateJavaScript(js) { result, error in
            let out = "\(native) | \(appState) | " + ((result as? String) ?? "error: \(String(describing: error))")
            try? out.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("ai-probe.txt"), atomically: true, encoding: .utf8)
        }
    }
    #endif

    func openInBrowser(_ provider: AIProvider) {
        let url = views[provider]?.url ?? provider.webURL
        if let url { NSWorkspace.shared.open(url) }
    }

    /// Signs out of every AI by deleting the cookies and site data of the web views.
    func clearSessions() {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            Task { @MainActor in
                for (provider, web) in self?.views ?? [:] {
                    if let url = provider.webURL { web.load(URLRequest(url: url)) }
                }
            }
        }
    }

    // MARK: Delegates

    /// Pop-ups (the Google sign-in window, for example) open in their own small window, like in a browser. They must be
    /// a real child of the page that opened them: the site talks to it to finish signing in.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let width = max(420, min(windowFeatures.width?.doubleValue ?? 480, 720))
        let height = max(560, min(windowFeatures.height?.doubleValue ?? 680, 900))
        let popup = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: configuration)
        popup.customUserAgent = Self.userAgent
        popup.navigationDelegate = self
        popup.uiDelegate = self

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .resizable, .utilityWindow],
            backing: .buffered, defer: false)
        panel.title = "Iniciar sesión"
        panel.contentView = popup
        panel.isReleasedWhenClosed = false
        // Above the notch, which floats over everything.
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 8)
        panel.hidesOnDeactivate = false
        panel.center()
        panel.makeKeyAndOrderFront(nil)
        popups[ObjectIdentifier(popup)] = panel
        return popup
    }

    func webViewDidClose(_ webView: WKWebView) {
        if let panel = popups.removeValue(forKey: ObjectIdentifier(webView)) { panel.close() }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Links that would open a new window go to the browser, unless they belong to the sign-in flow.
        if navigationAction.targetFrame == nil, navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url, let host = url.host?.lowercased(),
           !Self.loginHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    /// Attach files to a message.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }
}

private struct AIWebRepresentable: NSViewRepresentable {
    let provider: AIProvider

    func makeNSView(context: Context) -> WKWebView { AIWebStore.shared.view(for: provider) }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

/// The AI's own website inside the notch, with a small bar underneath.
struct AIWebPane: View {
    let provider: AIProvider
    @ObservedObject private var store = AIWebStore.shared

    var body: some View {
        VStack(spacing: 6) {
            AIWebRepresentable(provider: provider)
                .id(provider)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
                .overlay {
                    if let message = store.errors[provider] {
                        VStack(spacing: 10) {
                            Image(systemName: "wifi.exclamationmark").font(.system(size: 26)).foregroundStyle(.orange)
                            Text(message)
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.85))
                                .multilineTextAlignment(.center)
                            HStack(spacing: 10) {
                                Button("Reintentar") { store.reload(provider) }
                                Button("Abrir en el navegador") { store.openInBrowser(provider) }
                            }
                            .buttonStyle(.bordered)
                        }
                        .padding(18)
                        .frame(maxWidth: 360)
                        .background(Color.black.opacity(0.92), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    } else if store.loading.contains(provider) {
                        ProgressView().controlSize(.small).tint(.white)
                    }
                }

            HStack(spacing: 10) {
                Text(provider.accountHint)
                    .font(.system(size: 10.5))
                    .foregroundStyle(.gray)
                    .lineLimit(1)
                Spacer(minLength: 6)
                barButton("chevron.left", help: "Atrás") { AIWebStore.shared.view(for: provider).goBack() }
                barButton("arrow.clockwise", help: "Recargar") { AIWebStore.shared.reload(provider) }
                barButton("safari", help: "Abrir en el navegador (por si el inicio de sesión no avanza)") {
                    AIWebStore.shared.openInBrowser(provider)
                }
            }
        }
    }

    private func barButton(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
                .frame(width: 24, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}
