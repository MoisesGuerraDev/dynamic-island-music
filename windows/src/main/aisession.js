import { session } from 'electron';
import { AI_PARTITION, needsPersist, persistDetails } from '../shared/cookies.js';

/**
 * The saved session of the AI sites (Claude, ChatGPT, Gemini, DeepSeek and their sign-in pop-ups). One persistent
 * partition shared by all of them, so you sign in once. Closing the island or the app never clears it; only
 * "Cerrar sesión en todas las IA" does. Cookies without an expiry get one 90 days away, and the store is
 * written to disk when the app quits.
 */
export class AiSession {
  constructor() {
    this.ses = session.fromPartition(AI_PARTITION);
    this.cookies = this.ses.cookies;
    // The AI sites get no powers at all: no camera, microphone, location, notifications, clipboard reading...
    this.ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    this.ses.setPermissionCheckHandler(() => false);
  }

  start() {
    this.cookies.on('changed', (_event, cookie, _cause, removed) => {
      if (!removed) this.#keep(cookie);
    });
    // Cookies saved by an earlier run that were session-only.
    this.cookies
      .get({})
      .then((all) => all.forEach((c) => this.#keep(c)))
      .catch(() => {});
  }

  #keep(cookie) {
    if (!needsPersist(cookie)) return;
    this.cookies.set(persistDetails(cookie)).catch(() => {
      /* a cookie the browser refuses to re-save: leave it as it is */
    });
  }

  /** Makes sure cookies and site data are on disk. Called when the app is quitting. */
  async flush() {
    try {
      this.ses.flushStorageData();
      await this.cookies.flushStore();
    } catch {
      /* quitting anyway */
    }
  }

  /** The user's "Cerrar sesión en todas las IA" button. The only place that deletes the saved sessions. */
  async signOutAll() {
    await this.ses.clearStorageData();
    await this.ses.clearCache();
  }
}
