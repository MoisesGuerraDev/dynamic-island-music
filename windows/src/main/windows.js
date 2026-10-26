import { app, BrowserWindow, screen, session, shell } from 'electron';
import os from 'node:os';
import { capWidth, displayKey, autoScale } from '../shared/layout.js';
import { AI_PARTITION } from '../shared/cookies.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AI_GUEST_PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'preload', 'ai-guest.cjs');

const PAD_X = 70; // room for the glow and shadow at each side of the island
// In automated tests no window is ever shown (nothing appears on the person's screen) and nothing takes the keyboard.
const HEADLESS = process.env.DIM_TEST === '1' && process.env.DIM_SHOW !== '1' && !app.isPackaged;

const inRect = (r, p) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const grow = (r, m) => (r ? { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m } : null);

function isHttp(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * The floating island. One transparent, always-on-top window per screen, as wide as the widest the island can be.
 * The empty part of the window lets every click through to what is behind it: the main process checks where
 * the cursor is a few times a second and only makes the window clickable while it is over the island.
 * That same check opens the island when the cursor rests on the top of the screen (if the person wants that).
 */
export class IslandManager {
  constructor({ store, preload, rendererDir, onFirstLoad }) {
    this.store = store;
    this.preload = preload;
    this.rendererDir = rendererDir;
    this.islands = new Map(); // display id -> island
    this.game = { exclusive: false, busy: false };
    this.timer = null;
    this.settingsWin = null;
    this.onFirstLoad = onFirstLoad;
    this.hiddenByUser = false;
    this.fake = null;
    this.onClosed = null; // called whenever an island closes (the AI chat lock locks again)
  }

  start() {
    this.sync();
    this.timer = setInterval(() => this.#tick(), 50);
    const resync = () => this.sync();
    screen.on('display-added', resync);
    screen.on('display-removed', resync);
    screen.on('display-metrics-changed', resync);
  }

  stop() {
    clearInterval(this.timer);
    for (const isl of this.islands.values()) if (!isl.win.isDestroyed()) isl.win.destroy();
    this.islands.clear();
  }

  // --- Windows per screen ---

  #targetDisplays() {
    const all = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const mode = this.store.get('displayMode');
    if (mode === 'all') return all;
    if (mode === 'specific') {
      const found = all.find((d) => displayKey(d) === this.store.get('displayKey') || String(d.id) === this.store.get('displayKey'));
      return [found || primary];
    }
    return [primary];
  }

  /** Size of the screen the island is drawn for. Tests can pretend to have another one (simulate). */
  #screenSize(display) {
    if (this.fake) return { w: this.fake.w, h: this.fake.h, workW: this.fake.w, workH: this.fake.h };
    return { w: display.bounds.width, h: display.bounds.height, workW: display.workAreaSize.width, workH: display.workAreaSize.height };
  }

  /** Automatic scale from the work area in device-independent pixels (already includes the Windows scaling). */
  autoFor(display) {
    const z = this.#screenSize(display);
    return autoScale(z.workW, z.workH);
  }

  #geometry(display) {
    const z = this.#screenSize(display);
    const cap = capWidth(z.w, this.store.get('manualSize'), this.store.get('manualOpenWidth'));
    const auto = autoScale(z.workW, z.workH);
    const pad = Math.round(PAD_X * Math.max(1, auto));
    const width = Math.min(z.w, cap + 2 * pad);
    // Tall enough for the island at its biggest size (Grande), its edit bar, the lights panel and the glow.
    const height = Math.min(z.h, Math.round(this.store.get('topOffset') + 470 * auto * 1.2 + 110));
    const b = display.bounds;
    return { x: b.x + Math.round((b.width - width) / 2), y: b.y, width, height, cap };
  }

  /** For automated tests: behave as if the screen had this size (device-independent pixels). Call with no size to go back. */
  simulate(w, h) {
    this.fake = w && h ? { w, h } : null;
    this.sync();
  }

  /** Creates, moves or removes island windows so they match the screens and the settings. */
  sync() {
    const wanted = new Map(this.#targetDisplays().map((d) => [d.id, d]));
    for (const [id, isl] of this.islands) {
      if (!wanted.has(id)) {
        if (!isl.win.isDestroyed()) isl.win.destroy();
        this.islands.delete(id);
      }
    }
    for (const [id, display] of wanted) {
      let isl = this.islands.get(id);
      if (!isl) {
        isl = this.#create(display);
        this.islands.set(id, isl);
      }
      isl.display = display;
      const g = this.#geometry(display);
      isl.cap = g.cap;
      if (!isl.win.isDestroyed()) {
        isl.win.setBounds({ x: g.x, y: g.y, width: g.width, height: g.height });
        this.#sendInfo(isl);
      }
    }
  }

  #create(display) {
    const g = this.#geometry(display);
    const win = new BrowserWindow({
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: false,
      show: false,
      title: 'Dynamic Island Music',
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false,
        webviewTag: true, // the AI tab shows the official site of Claude, ChatGPT, Gemini or DeepSeek
      },
    });
    guardWebviews(win.webContents);
    win.setAlwaysOnTop(true, 'screen-saver');
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    } catch {
      /* not supported on this OS */
    }
    win.setIgnoreMouseEvents(true);
    lockDown(win.webContents);

    const isl = {
      display,
      win,
      cap: g.cap,
      open: false,
      pins: new Set(),
      holdUntil: 0,
      rect: null,
      hoverSince: 0,
      leaveSince: 0,
      ignoring: true,
      focused: false,
    };
    win.on('closed', () => {
      for (const [id, v] of this.islands) if (v === isl) this.islands.delete(id);
    });
    win.once('ready-to-show', () => {
      if (!this.game.exclusive && !this.hiddenByUser && !HEADLESS) win.showInactive();
    });
    win.webContents.once('did-finish-load', () => this.onFirstLoad?.(isl));
    win.loadFile(`${this.rendererDir}/island.html`);
    return isl;
  }

  #sendInfo(isl) {
    if (isl.win.isDestroyed()) return;
    isl.win.webContents.send('island:info', this.infoFor(isl));
  }

  infoFor(isl) {
    const d = isl.display;
    return {
      displayKey: displayKey(d),
      displayId: d.id,
      screenWidth: this.#screenSize(d).w,
      screenHeight: this.#screenSize(d).h,
      auto: this.autoFor(d),
      cap: isl.cap,
      winWidth: isl.win.getBounds().width,
      winHeight: isl.win.getBounds().height,
      topOffset: this.store.get('topOffset'),
      open: isl.open,
      hz: d.displayFrequency || 60,
    };
  }

  find(webContents) {
    for (const isl of this.islands.values()) if (!isl.win.isDestroyed() && isl.win.webContents === webContents) return isl;
    return null;
  }

  all() {
    return [...this.islands.values()].filter((i) => !i.win.isDestroyed());
  }

  first() {
    return this.all()[0] || null;
  }

  /** Tells every island something (settings changed, new song...). */
  send(channel, payload) {
    for (const isl of this.all()) isl.win.webContents.send(channel, payload);
  }

  // --- Open / close / pins ---

  setOpen(isl, open) {
    if (isl.open === open) return;
    isl.open = open;
    isl.hoverSince = 0;
    isl.leaveSince = 0;
    if (open) {
      isl.win.setAlwaysOnTop(true, 'screen-saver');
      isl.win.moveTop();
    } else {
      isl.pins.clear();
      this.#giveUpFocus(isl);
      if (this.onClosed) this.onClosed();
    }
    isl.win.webContents.send('island:state', { open });
  }

  toggle() {
    const isl = this.first();
    if (!isl) return;
    this.hiddenByUser = false;
    this.#revealAll();
    const open = !isl.open;
    this.setOpen(isl, open);
    if (open) isl.pins.add('toggle');
  }

  /** Opens the island for a moment (Pomodoro finished, shortcut over a game, first run). */
  peek(ms = 4000, isl = this.first()) {
    if (!isl) return;
    this.#revealAll();
    isl.holdUntil = Date.now() + ms;
    this.setOpen(isl, true);
  }

  #revealAll() {
    if (HEADLESS) return;
    for (const i of this.all()) if (!i.win.isVisible()) i.win.showInactive();
  }

  pin(isl, reason, on) {
    if (on) isl.pins.add(reason);
    else isl.pins.delete(reason);
  }

  wantFocus(isl, on) {
    const win = isl.win;
    if (on) {
      win.setFocusable(true);
      if (!HEADLESS) {
        win.focus();
        win.webContents.focus();
      }
      isl.focused = true;
      isl.pins.add('input');
    } else {
      isl.pins.delete('input');
      this.#giveUpFocus(isl);
    }
  }

  #giveUpFocus(isl) {
    if (!isl.focused) return;
    isl.focused = false;
    try {
      if (isl.win.isFocused()) isl.win.blur();
      isl.win.setFocusable(false);
    } catch {
      /* window closing */
    }
  }

  // --- Game mode ---

  setGameState(state) {
    const changed = state.exclusive !== this.game.exclusive || state.busy !== this.game.busy;
    this.game = state;
    if (!changed) return;
    const hide = this.store.get('gameHideExclusive') && state.exclusive;
    for (const isl of this.all()) {
      if (hide && isl.win.isVisible()) {
        this.setOpen(isl, false);
        isl.win.hide();
      } else if (!hide && !isl.win.isVisible() && !this.hiddenByUser) {
        isl.win.showInactive();
      }
    }
    this.send('sys:game', this.game);
  }

  gameBlocksHover() {
    return this.store.get('gameBasicOnly') && (this.game.busy || this.game.exclusive);
  }

  // --- Pointer watching ---

  #hotZone(isl) {
    const w = isl.win.getBounds().width;
    const top = this.store.get('topOffset');
    const strip = { x: w / 2 - 110, y: 0, w: 220, h: top + 26 };
    return [strip, grow(isl.rect, 8)];
  }

  #setIgnore(isl, ignore) {
    if (isl.ignoring === ignore) return;
    isl.ignoring = ignore;
    try {
      isl.win.setIgnoreMouseEvents(ignore);
    } catch {
      /* closing */
    }
  }

  #tick() {
    if (!this.islands.size) return;
    const p = screen.getCursorScreenPoint();
    const now = Date.now();
    for (const isl of this.all()) {
      if (!isl.win.isVisible()) continue;
      const b = isl.win.getBounds();
      const local = { x: p.x - b.x, y: p.y - b.y };
      const overIsland = inRect(grow(isl.rect, 6), local);
      this.#setIgnore(isl, !(overIsland || isl.focused));

      if (!isl.open) {
        const inZone = this.#hotZone(isl).some((z) => inRect(z, local));
        if (inZone && this.store.get('openOnHover') && !this.gameBlocksHover()) {
          if (!isl.hoverSince) isl.hoverSince = now;
          else if (now - isl.hoverSince >= this.store.get('hoverDelay')) this.setOpen(isl, true);
        } else {
          isl.hoverSince = 0;
        }
      } else {
        const inside = inRect(grow(isl.rect, 16), local);
        if (!inside && isl.pins.size === 0 && now > isl.holdUntil) {
          if (!isl.leaveSince) isl.leaveSince = now;
          else if (now - isl.leaveSince >= this.store.get('closeDelay')) this.setOpen(isl, false);
        } else {
          isl.leaveSince = 0;
        }
      }
    }
  }

  // --- Settings window ---

  openSettings(tab) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      if (this.settingsWin.isMinimized()) this.settingsWin.restore();
      if (!HEADLESS) {
        this.settingsWin.show();
        this.settingsWin.focus();
      }
      if (tab) this.settingsWin.webContents.send('settings:goto', tab);
      return;
    }
    const mica = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22000;
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 780,
      minHeight: 520,
      show: false,
      title: 'Dynamic Island Music · Ajustes',
      backgroundColor: mica ? '#00000000' : '#101218',
      ...(mica ? { backgroundMaterial: 'mica' } : {}),
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#cfd3dc', height: 44 },
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    this.settingsWin = win;
    lockDown(win.webContents);
    win.once('ready-to-show', () => {
      if (!HEADLESS) win.show();
    });
    win.on('closed', () => {
      this.settingsWin = null;
    });
    win.loadFile(`${this.rendererDir}/settings.html`, { query: { tab: tab || '', mica: mica ? '1' : '' } });
  }

  settingsSend(channel, payload) {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) this.settingsWin.webContents.send(channel, payload);
  }

  // --- AI sites in their own window (use your own account in the browser, no API key) ---

  openWeb(url, partition) {
    if (!WEB_AI_URL.test(url)) return;
    const win = new BrowserWindow({
      width: 460,
      height: 720,
      title: 'IA',
      autoHideMenuBar: true,
      backgroundColor: '#101218',
      webPreferences: { partition, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: AI_GUEST_PRELOAD },
    });
    win.webContents.setWindowOpenHandler(({ url: u }) => {
      if (isHttp(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    win.loadURL(url);
  }
}

const WEB_AI_URL = /^https:\/\/(claude\.ai|chatgpt\.com|gemini\.google\.com|chat\.deepseek\.com)\//;

/**
 * The AI tab embeds the official site in a <webview>. It gets its own saved session per site (so you sign in once,
 * also with Google), no access to Node or to our API, a normal Chrome identity so sign-in pages accept it,
 * and no permissions (camera, microphone, location...). Only the four known sites can be attached.
 */
function guardWebviews(host) {
  host.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = AI_GUEST_PRELOAD; // our own script that hides passkeys; the page can never choose another
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    if (!WEB_AI_URL.test(String(params.src)) || params.partition !== AI_PARTITION) event.preventDefault();
  });
  host.on('did-attach-webview', (_event, guest) => {
    const ses = guest.session;
    if (!ses.__dimGuarded) {
      ses.__dimGuarded = true;
      ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
      ses.setPermissionCheckHandler(() => false);
      ses.setUserAgent(ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ dynamic-island-music\/\S+/i, '').replace(/ Dynamic Island Music\/\S+/i, ''));
    }
    guest.setWindowOpenHandler(({ url }) => {
      // "Continue with Google" opens a small sign-in window: allow https ones, same saved session.
      if (/^https:\/\//i.test(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, backgroundColor: '#101218', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: AI_GUEST_PRELOAD } } };
      }
      return { action: 'deny' };
    });
  });
}

/** No page of ours may navigate away or open windows: links go to the system browser. */
export function lockDown(contents) {
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}
