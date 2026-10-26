// Request and response shapes for each AI provider. Requests are sent from the main process, so the API key
// never reaches the page. Same endpoints and default models as the macOS app, plus a custom OpenAI-compatible URL.

import { AI_META } from './defaults.js';

const trimSlash = (u) => String(u || '').replace(/\/+$/, '');

export function modelFor(provider, models) {
  const m = String((models || {})[provider] || '').trim();
  return m || AI_META[provider].model;
}

/**
 * messages: [{ role: 'user' | 'assistant', text }]
 * returns { url, headers, body } or throws an Error with a message written for the user.
 */
export function buildRequest(provider, { model, messages, key, system, ollamaUrl, customBaseUrl }) {
  const history = messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  const json = { 'content-type': 'application/json' };

  switch (provider) {
    case 'claude': {
      const body = { model, max_tokens: 1024, messages: history };
      if (system) body.system = system;
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { ...json, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body,
      };
    }
    case 'openai':
    case 'custom': {
      let url = 'https://api.openai.com/v1/chat/completions';
      if (provider === 'custom') {
        const base = trimSlash(customBaseUrl);
        if (!/^https?:\/\//i.test(base)) throw new Error('Escribe la dirección de la IA en Ajustes › IA (por ejemplo https://api.ejemplo.com/v1).');
        url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
      }
      const msgs = system ? [{ role: 'system', content: system }, ...history] : history;
      return { url, headers: { ...json, authorization: `Bearer ${key}` }, body: { model, messages: msgs } };
    }
    case 'gemini': {
      const body = { contents: messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })) };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { ...json, 'x-goog-api-key': key },
        body,
      };
    }
    case 'ollama': {
      const base = trimSlash(ollamaUrl) || 'http://localhost:11434';
      if (!/^https?:\/\//i.test(base)) throw new Error('La dirección de Ollama no es válida. Debe empezar con http://');
      const msgs = system ? [{ role: 'system', content: system }, ...history] : history;
      return { url: `${base}/api/chat`, headers: json, body: { model, stream: false, messages: msgs } };
    }
    default:
      throw new Error('Esa IA no existe.');
  }
}

/** Text of the reply, or null when the shape is not recognized. */
export function parseReply(provider, data) {
  if (!data || typeof data !== 'object') return null;
  switch (provider) {
    case 'claude': {
      const text = (data.content || []).map((p) => p && p.text).filter(Boolean).join('');
      return text || null;
    }
    case 'openai':
    case 'custom': {
      const t = data.choices?.[0]?.message?.content;
      return typeof t === 'string' && t ? t : null;
    }
    case 'gemini': {
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p && p.text).filter(Boolean).join('');
      return text || null;
    }
    case 'ollama': {
      const t = data.message?.content;
      return typeof t === 'string' && t ? t : null;
    }
    default:
      return null;
  }
}

export function parseError(status, data) {
  const e = data && data.error;
  if (e && typeof e === 'object' && e.message) return String(e.message);
  if (typeof e === 'string' && e) return e;
  if (status === 401 || status === 403) return 'La clave de API no es válida o no tiene permiso.';
  if (status === 429) return 'Demasiadas peticiones o sin saldo en tu cuenta de la IA.';
  return `Error ${status}`;
}
