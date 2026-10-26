import { app, BrowserWindow, ClipboardItem, Menu, Notification, clipboard, nativeImage, screen, session, shell, powerMonitor } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Store } from './store.js';
import { Secrets } from './secrets.js';
import { MediaService } from './media.js';
import { Pomodoro } from './pomodoro.js';
import { Notes } from './notes.js';
import { ClipboardHistory } from './clipboard.js';
import { AiService } from './ai.js';
import { PerfMonitor } from './perf.js';
import { SystemInfo } from './system.js';
import { CalendarStore } from './calendar.js';
import { Shelf } from './shelf.js';
import { IslandManager } from './windows.js';
import { Shortcuts } from './shortcuts.js';
import { AppTray } from './tray.js';
import { PsRpc } from './psrpc.js';
import { registerIpc } from './ipc.js';
import { AiSession } from './aisession.js';
import { AiLock } from './ailock.js';
import { PinVault } from './pin.js';
import { SessionBackup } from './sessionbackup.js';
import { HdCover } from './hdcover.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const isTest = process.env.DIM_TEST === '1' && !app.isPackaged;
const mockMedia = process.env.DIM_MOCK_MEDIA === '1' && !app.isPackaged;

// Tests and development can keep their data somewhere else. The installed app always uses the normal folder.
if (process.env.DIM_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.DIM_USER_DATA);

app.setAppUserModelId('app.dynamicislandmusic.windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // keep the island repainting under full-screen windows

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function resourcePath(...parts) {
  return app.isPackaged ? path.join(process.resourcesPath, ...parts) : path.join(root, ...parts);
}

function start() {
  const ctx = {};

  app.on('second-instance', () => ctx.islands?.openSettings());
  app.on('window-all-closed', () => {
    /* the island lives in the background; the tray icon or Ctrl+Shift+N reach it */
  });

  app.whenReady().then(() => boot(ctx));
  app.on('before-quit', () => shutdown(ctx));
  // Write the saved AI sessions (cookies) to disk before the process ends.
  let flushed = false;
  app.on('will-quit', (event) => {
    if (flushed || !ctx.aiSession) return;
    flushed = true;
    event.preventDefault();
    ctx.aiSession.flush().finally(() => app.quit());
  });
}

async function boot(ctx) {
  const userData = app.getPath('userData');
  Menu.setApplicationMenu(null);
  app.dock?.hide();

  const store = new Store(path.join(userData, 'settings.json'));
  const secrets = new Secrets(path.join(userData, 'secrets.json'), { testMode: isTest });
  const helper = process.platform === 'win32' ? new PsRpc(resourcePath(app.isPackaged ? 'ps' : 'src/main/ps', 'helper.ps1'), { name: 'El asistente de Windows', timeoutMs: 8000 }) : null;

  const islands = new IslandManager({
    store,
    preload: path.join(root, 'src', 'preload', 'preload.cjs'),
    rendererDir: path.join(root, 'src', 'renderer'),
    onFirstLoad: (isl) => {
      if (!store.get('welcomed') && isl === islands.first()) {
        store.set('welcomed', true);
        setTimeout(() => isl.win.webContents.send('island:welcome'), 700);
      }
    },
  });

  const system = new SystemInfo({ screen, helper });
  const media = new MediaService({ store, script: resourcePath(app.isPackaged ? 'ps' : 'src/main/ps', 'media.ps1'), mock: mockMedia });
  const pomodoro = new Pomodoro(store);
  const notes = new Notes({ store, defaultFolder: path.join(userData, 'Notas'), trash: (p) => shell.trashItem(p) });
  const clip = new ClipboardHistory({
    store,
    clipboard,
    nativeImage,
    ClipboardItem,
    file: path.join(userData, 'clipboard.json'),
    getForeground: async () => {
      if (!helper || helper.dead) return { name: '' };
      try {
        return await helper.call('fg');
      } catch {
        return { name: '' };
      }
    },
  });
  const ai = new AiService({ store, secrets, file: path.join(userData, 'chat-history.json') });
  const perf = new PerfMonitor({ store, helper, refreshHz: () => screen.getPrimaryDisplay().displayFrequency || 60 });
  const calendar = new CalendarStore({ file: path.join(userData, 'events.json') });
  const shelf = new Shelf({ file: path.join(userData, 'shelf.json') });

  const aiSession = new AiSession();
  aiSession.start();

  const sessionBackup = new SessionBackup({ aiSession, store, secrets, userData, onRestored: () => islands.send('ai:signedOut', true) });
  sessionBackup.start();
  const aiLock = new AiLock({ store, vault: new PinVault(path.join(userData, 'aipin.json')), helper });
  islands.onClosed = () => aiLock.relock();

  const hdCover = new HdCover({ store });

  Object.assign(ctx, { hdCover, sessionBackup, aiLock, aiSession, store, secrets, helper, islands, system, media, pomodoro, notes, clip, ai, perf, calendar, shelf });

  // --- Commands from shortcuts and the tray ---
  const send = (name, extra = {}) => islands.send('cmd', { name, ...extra });
  const actions = {
    toggleIsland: () => islands.toggle(),
    openSettings: (tab) => islands.openSettings(typeof tab === 'string' ? tab : ''),
    togglePomodoro: () => pomodoro.toggle(),
    quit: () => app.quit(),
  };
  ctx.shortcuts = new Shortcuts({
    store,
    handlers: {
      shortcutToggle: actions.toggleIsland,
      shortcutPlayer: () => media.control('toggle'),
      shortcutPomodoro: () => pomodoro.toggle(),
      shortcutChat: () => {
        const isl = islands.first();
        if (!isl) return;
        islands.peek(1500, isl);
        isl.pins.add('toggle');
        send('open-chat');
      },
      shortcutPeek: () => islands.peek(5000),
    },
  });

  const iconPath = path.join(root, 'assets', 'tray.png');
  ctx.tray = new AppTray({ iconPath, store, handlers: actions, getPomodoro: () => pomodoro.snapshot() });

  // --- Security: nothing from the web may open, load or ask for powers ---
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const ours = !!islands.find(wc);
    const videoOnly = permission === 'media' && Array.isArray(details?.mediaTypes) && details.mediaTypes.every((t) => t === 'video');
    cb(ours && videoOnly);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!wc && !!islands.find(wc));

  registerIpc({ ...ctx, playPomodoroSound });

  // --- Events to the pages ---
  const everyone = (channel, payload) => {
    islands.send(channel, payload);
    islands.settingsSend(channel, payload);
  };
  const notesPayload = () => ({ items: notes.list(), info: notes.info() });
  const clipPayload = () => ({ items: clip.list().map(({ id, kind, text, thumb, date, app: a }) => ({ id, kind, text, thumb, date, app: a })), paused: store.get('clipPaused') });

  aiLock.on('state', (s) => everyone('ailock:state', s));
  aiLock.refresh();
  media.on('state', (s) => everyone('music:state', s));
  pomodoro.on('state', (s) => {
    everyone('pomo:state', s);
    ctx.tray.update();
  });
  pomodoro.on('finished', (e) => {
    if (store.get('pomoNotify') && Notification.isSupported()) {
      new Notification({
        title: e.finishedFocus ? 'Concentración terminada' : 'Descanso terminado',
        body: e.finishedFocus ? 'Toca un descanso.' : 'Vuelve a concentrarte.',
        silent: true,
      }).show();
    }
    if (store.get('pomoSoundEnabled')) playPomodoroSound(false);
    if (store.get('pomoOpenOnFinish')) islands.peek(6000);
    everyone('pomo:finished', e);
  });
  notes.on('change', () => everyone('notes:changed', notesPayload()));
  clip.on('change', () => everyone('clip:changed', clipPayload()));
  clip.on('toast', (item) => {
    if (store.get('clipToast') && !(store.get('gameMuteClipToast') && (islands.game.busy || islands.game.exclusive))) {
      islands.send('clip:toast', { kind: item.kind, text: item.text });
    }
  });
  perf.on('sample', (s) => everyone('perf:sample', s));
  calendar.on('change', () => everyone('cal:changed', calendar.list()));
  shelf.on('change', () => everyone('shelf:changed', shelf.list()));
  screen.on('display-added', () => everyone('system:displays', system.displays()));
  screen.on('display-removed', () => everyone('system:displays', system.displays()));
  screen.on('display-metrics-changed', () => everyone('system:displays', system.displays()));

  function playPomodoroSound(preview) {
    const isl = islands.first();
    if (!isl) return;
    isl.win.webContents.send('pomo:sound', {
      name: store.get('pomoSoundName'),
      volume: store.get('pomoSoundVolume') / 100,
      repeat: preview ? 1 : store.get('pomoSoundRepeat'),
      custom: store.get('pomoCustomSound'),
    });
  }

  // --- Reactions to settings ---
  const componentOn = (id) => store.get('components').some((c) => c.id === id && c.enabled);
  const mediaWanted = () => componentOn('player') || store.get('liveMusic');
  function applyAutostart() {
    if (!app.isPackaged) return; // never register a development build to start with Windows
    app.setLoginItemSettings({ openAtLogin: !!store.get('launchAtLogin') });
  }
  store.on('change', (changed) => {
    everyone('settings:changed', changed);
    const has = (...keys) => keys.some((k) => k in changed);
    if (has('pomoFocusSeconds', 'pomoRestSeconds', 'pomoSprints')) pomodoro.durationsChanged();
    if (has('displayMode', 'displayKey', 'manualSize', 'manualOpenWidth')) islands.sync();
    if (has('topOffset')) islands.sync();
    if (has('components', 'liveMusic')) media.setActive(mediaWanted());
    if (has('preferredPlayer')) media.poll();
    if (has('launchAtLogin')) applyAutostart();
    if (has('shortcutToggle', 'shortcutPlayer', 'shortcutPomodoro', 'shortcutChat', 'shortcutPeek')) {
      everyone('app:shortcutStatus', ctx.shortcuts.apply());
    }
    if (has('clipPersist', 'clipMax', 'clipAutoDeleteDays', 'clipEnabled')) clip.settingsChanged();
    if (has('clipPaused')) {
      everyone('clip:changed', clipPayload());
      ctx.tray.update();
    }
    if (has('aiLock', 'aiLockPreferPin', 'aiLockRelock')) aiLock.settingsChanged();
    if (has('perfInterval')) perf.reschedule();
    if (has('notesFolder')) notes.reload();
    if (has('gameHideExclusive', 'gameBasicOnly')) watchGame();
  });

  // --- Full-screen game watch (Windows) ---
  let gameTimer = null;
  function watchGame() {
    clearInterval(gameTimer);
    gameTimer = null;
    const want = store.get('gameHideExclusive') || store.get('gameBasicOnly');
    if (!want || !helper) {
      islands.setGameState({ exclusive: false, busy: false });
      return;
    }
    let inFlight = false;
    const check = async () => {
      if (inFlight || helper.dead) return;
      inFlight = true;
      try {
        const r = await helper.call('qstate');
        const q = Number(r.qstate);
        islands.setGameState({ exclusive: q === 3, busy: q === 2 || q === 3 || q === 4 });
      } catch {
        /* ask again next time */
      } finally {
        inFlight = false;
      }
    };
    check();
    gameTimer = setInterval(check, 2000);
  }

  // --- Go ---
  islands.start();
  ctx.shortcuts.apply();
  notes.start();
  clip.start();
  media.setActive(mediaWanted());
  applyAutostart();
  watchGame();
  system.refresh().then(() => everyone('system:displays', system.displays()));
  powerMonitor.on('resume', () => islands.sync());
  // The chat locks again when Windows is locked or goes to sleep.
  powerMonitor.on('lock-screen', () => aiLock.forceRelock());
  powerMonitor.on('suspend', () => aiLock.forceRelock());

  if (isTest) globalThis.__DIM__ = ctx;
}

function shutdown(ctx) {
  try {
    ctx.store?.flush();
    ctx.media?.stop();
    ctx.notes?.stop();
    ctx.clip?.stop();
    ctx.shelf?.flush();
    ctx.calendar?.flush();
    ctx.shortcuts?.stop();
    ctx.helper?.stop();
    ctx.pomodoro?.stop();
    ctx.sessionBackup?.stop();
    ctx.islands?.stop();
    ctx.tray?.destroy();
  } catch {
    /* quitting anyway */
  }
}
