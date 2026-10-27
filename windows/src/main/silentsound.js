import { EventEmitter } from 'node:events';
import { SilentTracker, browserProcesses } from '../shared/silent.js';

/**
 * Notices when the browser plays but no sound comes out (the tab, the site or the video is muted, or the browser is
 * muted in the Windows mixer) and offers a switch. The switch can lift the Windows mixer mute by itself; a mute inside the
 * browser can only be lifted there, so in that case it explains where.
 */
export class SilentSound extends EventEmitter {
  constructor({ media, store }) {
    super();
    this.media = media;
    this.store = store;
    this.tracker = new SilentTracker();
    this.timer = null;
    this.busy = false;
    this.dismissedKey = '';
    this.shownAt = 0;
    this.view = { visible: false, browser: '', cause: '', message: '', working: false };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 2000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  state() {
    return this.view;
  }

  #set(next) {
    this.view = next;
    this.emit('change', next);
  }

  #hide() {
    this.tracker.reset();
    if (this.view.visible) this.#set({ visible: false, browser: '', cause: '', message: '', working: false });
  }

  async tick() {
    if (this.busy || this.view.working) return;
    const m = this.media.getState();
    const info = m.session && m.playing && m.source === 'browser' ? browserProcesses(m.app) : null;
    if (!this.store.get('watchBrowserSound') || !info) {
      this.dismissedKey = '';
      this.#hide();
      return;
    }
    this.busy = true;
    try {
      const a = await this.media.audio(info.procs, false);
      if (!a || !a.found) return;
      const { silent, cause } = this.tracker.update({ playing: true, found: a.found, peak: a.peak, muted: a.muted });
      if (!silent) {
        this.dismissedKey = '';
        this.#hide();
        return;
      }
      if (this.dismissedKey === m.key) return;
      if (!this.view.visible) {
        this.shownAt = Date.now();
        this.#set({ visible: true, browser: info.name, cause, message: '', working: false });
      } else if (this.view.cause !== cause) {
        this.#set({ ...this.view, cause });
      } else if (cause === 'mixer' && Date.now() - this.shownAt > 20000 && !this.view.message) {
        this.dismiss();
      }
    } finally {
      this.busy = false;
    }
  }

  dismiss() {
    this.dismissedKey = this.media.getState().key;
    this.#hide();
  }

  /** The switch: lifts the mute of the Windows mixer if that is where it is, and takes the person to the browser. */
  async turnOn() {
    const m = this.media.getState();
    const info = browserProcesses(m.app);
    if (!info || this.view.working) return;
    this.#set({ ...this.view, working: true, message: 'Activando el sonido…' });
    const a = await this.media.audio(info.procs, true);
    if (a && a.changed > 0) {
      await new Promise((r) => setTimeout(r, 1800));
      const b = await this.media.audio(info.procs, false);
      if (b && b.peak > this.tracker.loudEnough) {
        this.dismissedKey = '';
        this.#hide();
        return;
      }
    }
    await this.media.focus(info.procs);
    this.#set({
      ...this.view,
      working: false,
      cause: 'page',
      message: `Te llevé a ${info.name}. Busca la pestaña que suena: clic derecho en ella y «Activar sonido del sitio», o toca el altavoz del video (tecla M).`,
    });
  }
}
