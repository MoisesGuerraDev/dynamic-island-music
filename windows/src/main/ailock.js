import { EventEmitter } from 'node:events';

/**
 * Optional lock in front of the AI chat. Windows Hello (fingerprint, face or the Windows PIN) when the PC has it,
 * otherwise the app's own PIN. It only hides the chat: the saved AI sessions are never touched.
 * It asks again according to aiLockRelock: always (every time the island closes), after 15 minutes (the default),
 * after an hour, or only when the app starts. It also locks when Windows is locked or goes to sleep.
 *
 * Setting aiLock:  auto    = Windows Hello if available, otherwise no lock (the default)
 *                  secure  = Windows Hello if available, otherwise the app's PIN
 *                  none    = no lock
 * Setting aiLockPreferPin = use the app's PIN even when Windows Hello exists.
 */
export class AiLock extends EventEmitter {
  constructor({ store, vault, helper, now = () => Date.now(), schedule = true }) {
    super();
    this.now = now;
    this.schedule = schedule;
    this.unlockedAt = 0;
    this.timer = null;
    this.store = store;
    this.vault = vault;
    this.helper = helper;
    this.hello = false;
    this.helloInfo = '';
    this.unlocked = false;
  }

  async refresh() {
    if (process.platform === 'win32' && this.helper && !this.helper.dead) {
      try {
        const r = await this.helper.call('hello-check');
        this.hello = !!r.hello;
        this.helloInfo = r.availability || '';
      } catch {
        this.hello = false;
      }
    } else {
      this.hello = false;
    }
    this.emit('state', this.state());
    return this.state();
  }

  /** 'hello' | 'pin' | 'none': what the person has to do to open the chat right now. */
  mode() {
    const s = this.store.get('aiLock');
    if (s === 'none') return 'none';
    const useHello = this.hello && !this.store.get('aiLockPreferPin');
    if (useHello) return 'hello';
    if (s === 'secure') return 'pin';
    return this.store.get('aiLockPreferPin') && this.vault.isSet() ? 'pin' : 'none'; // auto
  }

  /** Minutes the unlock lasts: 0 = until the island closes, Infinity = until the app restarts. */
  #minutes() {
    const v = this.store.get('aiLockRelock');
    if (v === 'always') return 0;
    if (v === 'app') return Infinity;
    return v === '60' ? 60 : 15;
  }

  #stillUnlocked() {
    if (!this.unlocked) return false;
    const m = this.#minutes();
    return m === 0 || m === Infinity || this.now() - this.unlockedAt < m * 60_000; // m = 0: until the island closes
  }

  state() {
    const mode = this.mode();
    return {
      mode,
      locked: mode !== 'none' && !this.#stillUnlocked(),
      hello: this.hello,
      helloInfo: this.helloInfo,
      pinSet: this.vault.isSet(),
      needsPin: mode === 'pin' && !this.vault.isSet(),
      retryIn: this.vault.retryIn(),
    };
  }

  /** The island closed: locks again only if the person asked to be asked every time. */
  relock() {
    if (!this.unlocked) return;
    if (this.#minutes() > 0 && this.#stillUnlocked()) return;
    this.forceRelock();
  }

  /** Windows was locked or went to sleep. */
  forceRelock() {
    clearTimeout(this.timer);
    if (!this.unlocked) return;
    this.unlocked = false;
    this.emit('state', this.state());
  }

  #markUnlocked() {
    this.unlocked = true;
    this.unlockedAt = this.now();
    clearTimeout(this.timer);
    const m = this.#minutes();
    if (this.schedule && m > 0 && m !== Infinity) {
      this.timer = setTimeout(() => this.forceRelock(), m * 60_000 + 500);
      this.timer.unref?.();
    }
    this.emit('state', this.state());
  }

  settingsChanged() {
    clearTimeout(this.timer);
    this.unlocked = false;
    this.emit('state', this.state());
  }

  async unlockHello() {
    if (this.mode() !== 'hello') return { ok: false, error: 'Windows Hello no está disponible.' };
    try {
      const r = await this.helper.call('hello-verify', { message: 'Abrir el chat de IA' }, { timeoutMs: 100_000 });
      if (r.verified) {
        this.#markUnlocked();
        return { ok: true };
      }
      return { ok: false, error: r.result === 'Canceled' ? 'Cancelaste la verificación.' : 'No se pudo verificar que eres tú.' };
    } catch {
      return { ok: false, error: 'No se pudo abrir Windows Hello.' };
    }
  }

  unlockPin(pin) {
    if (this.mode() !== 'pin') return { ok: false, error: 'El PIN no está activado.' };
    const r = this.vault.verify(String(pin ?? ''));
    if (r.ok) this.#markUnlocked();
    return r;
  }
}
