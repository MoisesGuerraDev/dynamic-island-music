import { EventEmitter } from 'node:events';

/**
 * Optional lock in front of the AI chat. Windows Hello (fingerprint, face or the Windows PIN) when the PC has it,
 * otherwise the app's own PIN. It only hides the chat: the saved AI sessions are never touched.
 * It locks again every time the island closes.
 *
 * Setting aiLock:  auto    = Windows Hello if available, otherwise no lock (the default)
 *                  secure  = Windows Hello if available, otherwise the app's PIN
 *                  none    = no lock
 * Setting aiLockPreferPin = use the app's PIN even when Windows Hello exists.
 */
export class AiLock extends EventEmitter {
  constructor({ store, vault, helper }) {
    super();
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

  state() {
    const mode = this.mode();
    return {
      mode,
      locked: mode !== 'none' && !this.unlocked,
      hello: this.hello,
      helloInfo: this.helloInfo,
      pinSet: this.vault.isSet(),
      needsPin: mode === 'pin' && !this.vault.isSet(),
      retryIn: this.vault.retryIn(),
    };
  }

  relock() {
    if (!this.unlocked) return;
    this.unlocked = false;
    this.emit('state', this.state());
  }

  settingsChanged() {
    this.unlocked = false;
    this.emit('state', this.state());
  }

  async unlockHello() {
    if (this.mode() !== 'hello') return { ok: false, error: 'Windows Hello no está disponible.' };
    try {
      const r = await this.helper.call('hello-verify', { message: 'Abrir el chat de IA' }, { timeoutMs: 100_000 });
      if (r.verified) {
        this.unlocked = true;
        this.emit('state', this.state());
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
    if (r.ok) {
      this.unlocked = true;
      this.emit('state', this.state());
    }
    return r;
  }
}
