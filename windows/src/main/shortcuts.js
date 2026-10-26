import { globalShortcut } from 'electron';

/** Global shortcuts (Ctrl on Windows). Each one is configurable and can be left empty to turn it off. */
export class Shortcuts {
  constructor({ store, handlers }) {
    this.store = store;
    this.handlers = handlers; // { settingsKey: () => void }
    this.status = {}; // settingsKey -> 'ok' | 'off' | 'busy' | 'invalid'
  }

  apply() {
    globalShortcut.unregisterAll();
    this.status = {};
    for (const [key, fn] of Object.entries(this.handlers)) {
      const accel = String(this.store.get(key) || '').trim();
      if (!accel) {
        this.status[key] = 'off';
        continue;
      }
      try {
        this.status[key] = globalShortcut.register(accel, fn) ? 'ok' : 'busy';
      } catch {
        this.status[key] = 'invalid';
      }
    }
    return this.status;
  }

  stop() {
    globalShortcut.unregisterAll();
  }
}
