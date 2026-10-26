import SwiftUI
import WebKit

/// Keeps one web view per AI, so the conversation and the session stay alive when you switch tabs or close the notch.
/// The person signs in on the official site with their own account; the app never sees the password.
@MainActor
final class AIWebStore: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let shared = AIWebStore()
    private var views: [AIProvider: WKWebView] = [:]

    private static let userAgent =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

    /// Hosts that take part in signing in; they stay inside the notch.
    private static let loginHosts = ["google.com", "apple.com", "microsoft.com", "live.com", "openai.com", "chatgpt.com",
                                     "anthropic.com", "claude.ai", "deepseek.com", "gstatic.com", "recaptcha.net",
                                     "cloudflare.com", "auth0.com", "github.com"]

    func view(for provider: AIProvider) -> WKWebView {
        if let existing = views[provider] { return existing }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        let web = WKWebView(frame: .zero, configuration: config)
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

    /// Pop-ups (for example the Google sign-in window) open in the same view instead of a new window.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
        return nil
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

    var body: some View {
        VStack(spacing: 6) {
            AIWebRepresentable(provider: provider)
                .id(provider)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))

            HStack(spacing: 10) {
                Text(provider.accountHint)
                    .font(.system(size: 10.5))
                    .foregroundStyle(.gray)
                    .lineLimit(1)
                Spacer(minLength: 6)
                barButton("chevron.left", help: "Atrás") { AIWebStore.shared.view(for: provider).goBack() }
                barButton("arrow.clockwise", help: "Recargar") { AIWebStore.shared.view(for: provider).reload() }
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
