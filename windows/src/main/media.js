import { EventEmitter } from 'node:events';
import { PsRpc } from './psrpc.js';

export function sourceOf(app = '') {
  const a = String(app).toLowerCase();
  if (a.includes('spotify')) return 'spotify';
  if (a.includes('applemusic') || a.includes('itunes') || a.includes('apple')) return 'apple';
  if (/chrome|msedge|firefox|brave|opera|vivaldi|arc/.test(a)) return 'browser';
  return 'other';
}

const EMPTY = {
  available: true,
  error: '',
  session: false,
  app: '',
  source: 'other',
  title: '',
  artist: '',
  album: '',
  playing: false,
  position: 0,
  duration: 0,
  positionAt: 0,
  key: '',
  cover: null,
  canNext: false,
  canPrev: false,
  canSeek: false,
};

/**
 * Music from the system media controls (SMTC) on Windows, through a small PowerShell helper.
 * Whatever plays in Spotify, Apple Music or a browser tab shows up here without any account or permission.
 * On other systems (development on a Mac) there is a mock player with fake songs so the interface can be tested.
 */
export class MediaService extends EventEmitter {
  constructor({ store, script, mock = false }) {
    super();
    this.store = store;
    this.mock = mock;
    this.rpc = !mock && process.platform === 'win32' ? new PsRpc(script, { name: 'La música del sistema', timeoutMs: 7000 }) : null;
    this.state = { ...EMPTY, available: mock || process.platform === 'win32', error: mock || process.platform === 'win32' ? '' : 'La música del sistema solo está disponible en Windows.' };
    this.timer = null;
    this.busy = false;
    this.active = false;
    this.coverByKey = new Map();
    this.mockIdx = 0;
    this.mockPlaying = true;
    this.mockPos = 40;
    this.mockAt = Date.now();
    if (this.rpc) {
      this.rpc.on('dead', (reason) => {
        this.#set({ ...this.state, available: false, error: `No se pudo leer la música del sistema: ${reason}`, session: false });
      });
    }
  }

  getState() {
    return this.state;
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.poll();
      this.timer = setInterval(() => this.poll(), 1000);
    } else {
      clearInterval(this.timer);
      this.timer = null;
      if (this.rpc) this.rpc.stop();
      this.#set({ ...this.state, session: false, playing: false });
    }
  }

  stop() {
    this.setActive(false);
  }

  async poll() {
    if (this.busy || !this.active) return;
    this.busy = true;
    try {
      if (this.mock) this.#set(this.#mockState());
      else if (this.rpc && !this.rpc.dead) await this.#pollWindows();
    } catch (err) {
      if (this.rpc && this.rpc.dead) return;
      // One missed answer is not worth showing; the next poll tries again.
    } finally {
      this.busy = false;
    }
  }

  async #pollWindows() {
    const r = await this.rpc.call('state', { prefer: this.store.get('preferredPlayer') });
    if (!r.session) {
      this.#set({ ...EMPTY, available: true });
      return;
    }
    let cover = this.coverByKey.get(r.key) ?? null;
    if (r.cover) {
      cover = r.cover;
      this.coverByKey.clear();
      this.coverByKey.set(r.key, cover);
    }
    this.#set({
      available: true,
      error: '',
      session: true,
      app: r.app,
      source: sourceOf(r.app),
      title: r.title,
      artist: r.artist,
      album: r.album,
      playing: !!r.playing,
      position: Number(r.position) || 0,
      duration: Number(r.duration) || 0,
      positionAt: Date.now(),
      key: r.key,
      cover,
      canNext: !!r.canNext,
      canPrev: !!r.canPrev,
      canSeek: !!r.canSeek,
    });
  }

  /** Emits only when something visible changed; the page moves the progress bar by itself in between. */
  #set(next) {
    const prev = this.state;
    const expected = prev.playing ? prev.position + (next.positionAt - prev.positionAt) / 1000 : prev.position;
    const jumped = Math.abs(next.position - expected) > 1.8;
    const changed =
      jumped ||
      prev.session !== next.session ||
      prev.key !== next.key ||
      prev.playing !== next.playing ||
      prev.duration !== next.duration ||
      prev.cover !== next.cover ||
      prev.available !== next.available ||
      prev.source !== next.source ||
      prev.canNext !== next.canNext ||
      prev.error !== next.error;
    this.state = next;
    if (changed) this.emit('state', next);
  }

  /** Sound sent by the programs called `procs`: { found, peak, muted, changed }. With `unmute` it also lifts their mute in the Windows mixer. */
  async audio(procs, unmute = false) {
    if (this.mock) {
      const quiet = !!process.env.DIM_MOCK_SILENT;
      return { found: true, peak: quiet ? 0 : 0.3, muted: quiet && !this.mockUnmuted, changed: 0 };
    }
    if (!this.rpc || this.rpc.dead) return null;
    try {
      const r = await this.rpc.call('audio', { names: procs, unmute: !!unmute }, { timeoutMs: 6000 });
      return { found: !!r.found, peak: Number(r.peak) || 0, muted: !!r.muted, changed: Number(r.changed) || 0 };
    } catch {
      return null;
    }
  }

  /** Brings the window of the programs called `procs` to the front. */
  async focus(procs) {
    if (this.mock || !this.rpc || this.rpc.dead) return false;
    try {
      const r = await this.rpc.call('focus', { names: procs }, { timeoutMs: 6000 });
      return !!r.done;
    } catch {
      return false;
    }
  }

  async control(cmd, arg) {
    if (!['toggle', 'play', 'pause', 'next', 'prev', 'seek'].includes(cmd)) return false;
    if (this.mock) {
      this.#mockControl(cmd, arg);
      this.#set(this.#mockState());
      return true;
    }
    if (!this.rpc || this.rpc.dead) return false;
    try {
      // Show the new play/pause state at once; the next poll confirms it.
      if (cmd === 'toggle' && this.state.session) this.#set({ ...this.state, playing: !this.state.playing, positionAt: Date.now() });
      const r = await this.rpc.call(cmd, { prefer: this.store.get('preferredPlayer'), arg });
      setTimeout(() => this.poll(), 250);
      return !!r.done;
    } catch {
      return false;
    }
  }

  // --- Mock player (development only) ---

  static MOCK = [
    { title: 'Sangre', artist: 'Dante Ríos', c1: '#ff2a3a', c2: '#ff5a2a', c3: '#4a0a10', dur: 212 },
    { title: 'Perdida', artist: 'Luar La L', c1: '#ff8a3d', c2: '#e0294a', c3: '#6b2f1a', dur: 187 },
    { title: 'Violeta', artist: 'Aurora Vega', c1: '#b06bff', c2: '#ff4fa3', c3: '#2a1a5e', dur: 241 },
    { title: 'Selva', artist: 'Kai Mora', c1: '#1ed760', c2: '#19a6b8', c3: '#0e3a2e', dur: 198 },
  ];

  #mockControl(cmd, arg) {
    const n = MediaService.MOCK.length;
    const now = Date.now();
    if (this.mockPlaying) this.mockPos += (now - this.mockAt) / 1000;
    this.mockAt = now;
    if (cmd === 'toggle') this.mockPlaying = !this.mockPlaying;
    if (cmd === 'play') this.mockPlaying = true;
    if (cmd === 'pause') this.mockPlaying = false;
    if (cmd === 'next') {
      this.mockIdx = (this.mockIdx + 1) % n;
      this.mockPos = 0;
    }
    if (cmd === 'prev') {
      if (this.mockPos <= 3) this.mockIdx = (this.mockIdx + n - 1) % n;
      this.mockPos = 0;
    }
    if (cmd === 'seek') this.mockPos = Math.max(0, Number(arg) || 0);
  }

  #mockState() {
    const t = MediaService.MOCK[this.mockIdx];
    const now = Date.now();
    if (this.mockPlaying) {
      this.mockPos += (now - this.mockAt) / 1000;
      if (this.mockPos >= t.dur) {
        this.mockIdx = (this.mockIdx + 1) % MediaService.MOCK.length;
        this.mockPos = 0;
      }
    }
    this.mockAt = now;
    const cur = MediaService.MOCK[this.mockIdx];
    return {
      available: true,
      error: '',
      session: true,
      app: 'Spotify.exe',
      source: 'spotify',
      title: cur.title,
      artist: cur.artist,
      album: 'Demo',
      playing: this.mockPlaying,
      position: this.mockPos,
      duration: cur.dur,
      positionAt: now,
      key: `${cur.artist}|${cur.title}|Demo`,
      cover: mockCover(cur),
      canNext: true,
      canPrev: true,
      canSeek: true,
    };
  }
}

function mockCover(t) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
<defs>
<radialGradient id="a" cx="28%" cy="24%" r="46%"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c1}" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="78%" cy="74%" r="52%"><stop offset="0" stop-color="${t.c2}"/><stop offset="1" stop-color="${t.c2}" stop-opacity="0"/></radialGradient>
<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c3}"/><stop offset="1" stop-color="#0d0709"/></linearGradient>
</defs>
<rect width="300" height="300" fill="url(#c)"/><rect width="300" height="300" fill="url(#a)"/><rect width="300" height="300" fill="url(#b)"/>
<circle cx="150" cy="138" r="70" fill="#fff" fill-opacity=".35"/>
<text x="150" y="262" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="600" font-size="40" fill="#fff">${t.title}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
