import { DebouncedJson } from './fsutil.js';
import { buildRequest, modelFor, parseError, parseReply } from '../shared/ai-providers.js';
import { AI_META } from '../shared/defaults.js';

/**
 * Chat with the AI of the person's choice. The request goes from this PC straight to the provider with the
 * person's own API key (decrypted here, in the main process, and never given to the page). No server of ours in between.
 */
export class AiService {
  constructor({ store, secrets, file, fetchImpl = (...a) => fetch(...a) }) {
    this.store = store;
    this.secrets = secrets;
    this.fetch = fetchImpl;
    this.json = new DebouncedJson(file, 600);
  }

  hasKey(provider) {
    return !AI_META[provider]?.needsKey || this.secrets.has(`ai.${provider}`);
  }

  setKey(provider, key) {
    if (!AI_META[provider]?.needsKey) return;
    this.secrets.set(`ai.${provider}`, key);
  }

  clearKey(provider) {
    this.secrets.delete(`ai.${provider}`);
  }

  history() {
    if (!this.store.get('aiSaveHistory')) return [];
    const saved = this.json.read([]);
    return Array.isArray(saved) ? saved.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') : [];
  }

  saveHistory(messages) {
    if (!this.store.get('aiSaveHistory')) {
      this.json.remove();
      return;
    }
    const clean = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
      .slice(-60)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 20_000) }));
    this.json.save(clean);
  }

  clearHistory() {
    this.json.remove();
  }

  /** messages: [{ role, text }]. Returns { ok: true, text } or { ok: false, error }. */
  async send(provider, messages, { nowPlaying } = {}) {
    if (!AI_META[provider]) return { ok: false, error: 'Esa IA no existe.' };
    const meta = AI_META[provider];
    if (!this.hasKey(provider)) return { ok: false, error: `Falta la clave de API de ${meta.name}. Ponla en Ajustes › IA.` };
    const history = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
      .slice(-20);
    if (!history.length || history[history.length - 1].role !== 'user') return { ok: false, error: 'No hay nada que enviar.' };

    let system;
    if (this.store.get('aiIncludeNowPlaying') && nowPlaying) system = `La persona está escuchando ahora: ${nowPlaying}.`;

    let req;
    try {
      req = buildRequest(provider, {
        model: modelFor(provider, this.store.get('aiModels')),
        messages: history,
        key: meta.needsKey ? this.secrets.get(`ai.${provider}`) : '',
        system,
        ollamaUrl: this.store.get('ollamaUrl'),
        customBaseUrl: this.store.get('customBaseUrl'),
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }

    let res;
    try {
      res = await this.fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      if (provider === 'ollama') return { ok: false, error: 'No encuentro Ollama en tu PC. Ábrelo y descarga un modelo.' };
      const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return { ok: false, error: timeout ? 'La IA tardó demasiado en responder.' : `No pude conectar: ${err && err.message ? err.message : err}` };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) return { ok: false, error: parseError(res.status, data) };
    const text = parseReply(provider, data);
    return text ? { ok: true, text } : { ok: false, error: 'La respuesta llegó vacía.' };
  }
}
