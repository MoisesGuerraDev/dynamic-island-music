import Combine
import Defaults
import Foundation
import Security
import SwiftUI

// MARK: - Keychain (API keys never leave the Mac except to the provider the user picked)

enum KeychainStore {
    private static let service = "app.dynamicislandmusic.mac.apikeys"

    static func get(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ value: String, for account: String) {
        delete(account)
        guard !value.isEmpty else { return }
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(value.utf8),
        ]
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - Chat

struct ChatMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable { case user, assistant }
    var id = UUID()
    var role: Role
    var text: String
}

@MainActor
final class AIChatManager: ObservableObject {
    static let shared = AIChatManager()

    @Published var messages: [ChatMessage] = []
    @Published var isSending = false
    @Published var errorText: String?
    @Published var provider: AIProvider = Defaults[.aiProvider] {
        didSet {
            Defaults[.aiProvider] = provider
            NotificationCenter.default.post(name: .islandLayoutChanged, object: nil)
        }
    }

    private init() { loadHistory() }

    // MARK: Providers

    var enabledProviders: [AIProvider] {
        let on = Defaults[.aiEnabled]
        let list = AIProvider.allCases.filter { on[$0.rawValue] ?? ($0 != .ollama) }
        return list.isEmpty ? [provider] : list
    }

    func model(for p: AIProvider) -> String {
        let m = Defaults[.aiModels][p.rawValue]?.trimmingCharacters(in: .whitespaces) ?? ""
        return m.isEmpty ? p.defaultModel : m
    }

    func setModel(_ value: String, for p: AIProvider) {
        var d = Defaults[.aiModels]
        d[p.rawValue] = value
        Defaults[.aiModels] = d
    }

    func hasKey(_ p: AIProvider) -> Bool { !p.needsKey || (KeychainStore.get(p.rawValue)?.isEmpty == false) }

    var defaultButtonProvider: AIProvider {
        let on = Defaults[.aiEnabled]
        if on[provider.rawValue] ?? (provider != .ollama) { return provider }
        return AIProvider.allCases.first { on[$0.rawValue] ?? ($0 != .ollama) } ?? provider
    }

    /// True when the chat is the provider's own website (signed in with the person's account) instead of an API call.
    func usesWeb(_ p: AIProvider) -> Bool {
        p.webURL != nil && !(Defaults[.aiUseKey][p.rawValue] ?? false)
    }

    // MARK: Sending

    func send(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, !isSending else { return }
        errorText = nil
        if !hasKey(provider) {
            errorText = "Falta la clave de API de \(provider.title). Ponla en Ajustes › IA."
            return
        }
        messages.append(ChatMessage(role: .user, text: clean))
        isSending = true
        let p = provider
        let history = Array(messages.suffix(20))
        Task {
            do {
                let reply = try await Self.request(provider: p, model: model(for: p), history: history)
                messages.append(ChatMessage(role: .assistant, text: reply))
            } catch {
                errorText = error.localizedDescription
            }
            isSending = false
            saveHistory()
        }
    }

    func clear() {
        messages = []
        errorText = nil
        saveHistory()
    }

    private nonisolated static func request(provider: AIProvider, model: String, history: [ChatMessage]) async throws -> String {
        var req: URLRequest
        let key = KeychainStore.get(provider.rawValue) ?? ""
        let role: (ChatMessage) -> String = { $0.role == .user ? "user" : "assistant" }
        var body: [String: Any]

        switch provider {
        case .claude:
            req = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
            req.setValue(key, forHTTPHeaderField: "x-api-key")
            req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = ["model": model, "max_tokens": 1024, "messages": history.map { ["role": role($0), "content": $0.text] }]
        case .openai, .deepseek:
            let endpoint = provider == .deepseek ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions"
            req = URLRequest(url: URL(string: endpoint)!)
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
            body = ["model": model, "messages": history.map { ["role": role($0), "content": $0.text] }]
        case .gemini:
            req = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent")!)
            req.setValue(key, forHTTPHeaderField: "x-goog-api-key")
            body = ["contents": history.map { ["role": $0.role == .user ? "user" : "model", "parts": [["text": $0.text]]] }]
        case .ollama:
            req = URLRequest(url: URL(string: "http://localhost:11434/api/chat")!)
            body = ["model": model, "stream": false, "messages": history.map { ["role": role($0), "content": $0.text] }]
        }
        req.httpMethod = "POST"
        req.timeoutInterval = 90
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            if provider == .ollama { throw AIError.message("No encuentro Ollama en tu Mac. Ábrelo y descarga un modelo.") }
            throw AIError.message("No pude conectar: \(error.localizedDescription)")
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status >= 400 {
            let err = (json["error"] as? [String: Any])?["message"] as? String ?? (json["error"] as? String) ?? "Error \(status)"
            throw AIError.message(err)
        }
        switch provider {
        case .claude:
            let parts = (json["content"] as? [[String: Any]]) ?? []
            let text = parts.compactMap { $0["text"] as? String }.joined()
            if !text.isEmpty { return text }
        case .openai, .deepseek:
            if let c = (json["choices"] as? [[String: Any]])?.first,
               let m = c["message"] as? [String: Any], let t = m["content"] as? String { return t }
        case .gemini:
            if let c = (json["candidates"] as? [[String: Any]])?.first,
               let content = c["content"] as? [String: Any],
               let parts = content["parts"] as? [[String: Any]] {
                let t = parts.compactMap { $0["text"] as? String }.joined()
                if !t.isEmpty { return t }
            }
        case .ollama:
            if let m = json["message"] as? [String: Any], let t = m["content"] as? String { return t }
        }
        throw AIError.message("La respuesta llegó vacía.")
    }

    enum AIError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }

    // MARK: History (kept only on this Mac)

    private var historyURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("chat-history.json")
    }

    private func loadHistory() {
        guard Defaults[.aiSaveHistory], let data = try? Data(contentsOf: historyURL),
              let saved = try? JSONDecoder().decode([ChatMessage].self, from: data) else { return }
        messages = saved
    }

    private func saveHistory() {
        guard Defaults[.aiSaveHistory] else {
            try? FileManager.default.removeItem(at: historyURL)
            return
        }
        if let data = try? JSONEncoder().encode(Array(messages.suffix(60))) { try? data.write(to: historyURL, options: .atomic) }
    }
}

// MARK: - Views

/// Chat tab of the notch.
struct ChatTabView: View {
    @ObservedObject var lock = AILock.shared
    @ObservedObject var chat = AIChatManager.shared
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        if lock.required && !lock.unlocked {
            AILockView()
                .onAppear {
                    #if DEBUG
                    lock.debugLog("lock view shown")
                    #endif
                }
        } else {
            content
        }
    }

    private var content: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                HStack(spacing: 2) {
                    ForEach(chat.enabledProviders) { p in
                        Button { chat.provider = p } label: {
                            Text(p.title)
                                .font(.system(size: 12, weight: .semibold))
                                .padding(.horizontal, 11)
                                .padding(.vertical, 5)
                                .foregroundStyle(chat.provider == p ? Color.white : Color.gray)
                                .background(chat.provider == p ? Color.white.opacity(0.2) : Color.clear, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .islandGlass(Capsule(), interactive: false)
                Spacer()
                if !chat.usesWeb(chat.provider) {
                    Text("Modelo: \(chat.model(for: chat.provider))")
                        .font(.system(size: 10.5))
                        .foregroundStyle(.gray)
                    Button("Borrar") { chat.clear() }
                        .buttonStyle(.plain)
                        .font(.system(size: 11))
                        .foregroundStyle(.gray)
                }
            }

            if chat.usesWeb(chat.provider) {
                AIWebPane(provider: chat.provider)
            } else {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 6) {
                        if chat.messages.isEmpty {
                            Text("Pregúntale lo que quieras a \(chat.provider.title).")
                                .font(.system(size: 12))
                                .foregroundStyle(.gray)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(chat.messages) { m in
                            Text(m.text)
                                .font(.system(size: 12.5))
                                .foregroundStyle(.white)
                                .textSelection(.enabled)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(m.role == .user ? chat.provider.color.opacity(0.55) : Color.white.opacity(0.1),
                                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .frame(maxWidth: .infinity, alignment: m.role == .user ? .trailing : .leading)
                                .id(m.id)
                        }
                        if chat.isSending { ProgressView().controlSize(.small).frame(maxWidth: .infinity, alignment: .leading) }
                        if let e = chat.errorText {
                            Text(e).font(.system(size: 11.5)).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .onChange(of: chat.messages.count) { _, _ in
                    if let last = chat.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }

            HStack(spacing: 8) {
                TextField("Pregúntale algo a \(chat.provider.title)", text: $draft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12.5))
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .islandGlass(Capsule(), interactive: false)
                    .focused($focused)
                    .onSubmit(send)
                Button("Enviar", action: send)
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 32)
                    .islandGlass(Capsule(), tint: chat.provider.color.opacity(0.6))
            }
            Text(chat.provider == .ollama
                 ? "Tu mensaje se queda en tu Mac: Ollama corre en local."
                 : "Tu clave, tu cuenta: el mensaje va directo de tu Mac a \(chat.provider.title).")
                .font(.system(size: 10.5))
                .foregroundStyle(.gray)
            }
        }
        .padding(.top, 4)
        .onAppear {
            KeyboardFocus.shared.prepare()
            DispatchQueue.main.async { focused = true }
        }
        .onDisappear { KeyboardFocus.shared.release() }
    }

    private func send() {
        chat.send(draft)
        draft = ""
    }
}

/// Small version used inside the component row.
struct ChatComponentView: View {
    @ObservedObject var chat = AIChatManager.shared
    @ObservedObject var coordinator = IslandViewCoordinator.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label("Chat de IA", systemImage: "sparkles").font(.system(size: 12, weight: .semibold))
                Spacer(minLength: 0)
                Text(chat.provider.title)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(chat.provider.color.opacity(0.35), in: Capsule())
            }
            Text(chat.usesWeb(chat.provider)
                 ? "Inicia sesión con tu cuenta y chatea con \(chat.provider.title) sin salir del notch."
                 : (chat.messages.last?.text ?? "Pregúntale lo que quieras a tu IA favorita."))
                .font(.system(size: 11.5))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(4)
            Spacer(minLength: 0)
            Button {
                withAnimation(.smooth) { coordinator.currentView = .chat }
            } label: {
                Text("Escribir…")
                    .font(.system(size: 11.5, weight: .semibold))
                    .padding(.horizontal, 14).padding(.vertical, 5)
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .islandGlass(Capsule())
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Round button next to the calendar that opens the chat with the default AI.
struct AIQuickButton: View {
    @ObservedObject var chat = AIChatManager.shared
    @ObservedObject var coordinator = IslandViewCoordinator.shared

    var body: some View {
        let p = chat.defaultButtonProvider
        Button {
            chat.provider = p
            withAnimation(.smooth) { coordinator.currentView = .chat }
        } label: {
            Text(p.letter)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .islandGlass(Circle(), tint: p.color.opacity(0.7))
        .help("Abrir \(p.title) (dentro del chat puedes cambiar de IA)")
    }
}
