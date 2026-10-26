// Stand-in for window.dim when a page is opened in a normal browser (design work and screenshots).
// The real app never loads this file: the preload script provides window.dim there.
import { DEFAULTS, normalizeSettings, clone, AI_PROVIDERS } from '../shared/defaults.js';
import { capWidth, displayKey } from '../shared/layout.js';
import { parseDuration } from '../shared/time.js';

const hub = {};
const on = (ch, cb) => {
  (hub[ch] ||= new Set()).add(cb);
  return () => hub[ch].delete(cb);
};
const emit = (ch, p) => (hub[ch] || []).forEach((cb) => cb(p));

const q = new URLSearchParams(location.search);
const screenW = Number(q.get('sw')) || 1920;
const keep = !!q.get('keep');
let set = normalizeSettings(keep ? JSON.parse(localStorage.getItem('dim-dev-settings') || '{}') : {});
const patchSet = (obj) => {
  const changed = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k in DEFAULTS && JSON.stringify(set[k]) !== JSON.stringify(v)) {
      set[k] = clone(v);
      changed[k] = clone(v);
    }
  }
  if (Object.keys(changed).length) {
    if (keep) localStorage.setItem('dim-dev-settings', JSON.stringify(set));
    setTimeout(() => emit('settings:changed', changed), 0);
  }
  return changed;
};

const display = { id: 1, size: { width: screenW, height: 1080 }, scaleFactor: 1, bounds: { x: 0, y: 0, width: screenW, height: 1080 } };
let open = !!q.get('open');
const info = () => ({ displayKey: displayKey(display), displayId: 1, screenWidth: screenW, screenHeight: 1080, cap: capWidth(screenW, set.manualSize, set.manualOpenWidth), winWidth: capWidth(screenW, set.manualSize, set.manualOpenWidth) + 140, winHeight: 480, topOffset: set.topOffset, open, hz: 165 });

// --- Music ---
const TRACKS = [
  { title: 'Sangre', artist: 'Dante Ríos', c1: '#ff2a3a', c2: '#ff5a2a', c3: '#4a0a10', dur: 212 },
  { title: 'Perdida', artist: 'Luar La L', c1: '#ff8a3d', c2: '#e0294a', c3: '#6b2f1a', dur: 187 },
  { title: 'Violeta', artist: 'Aurora Vega', c1: '#b06bff', c2: '#ff4fa3', c3: '#2a1a5e', dur: 241 },
  { title: 'Selva', artist: 'Kai Mora', c1: '#1ed760', c2: '#19a6b8', c3: '#0e3a2e', dur: 198 },
];
const cover = (t) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><radialGradient id="a" cx="28%" cy="24%" r="46%"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c1}" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="78%" cy="74%" r="52%"><stop offset="0" stop-color="${t.c2}"/><stop offset="1" stop-color="${t.c2}" stop-opacity="0"/></radialGradient></defs><rect width="300" height="300" fill="${t.c3}"/><rect width="300" height="300" fill="url(#a)"/><rect width="300" height="300" fill="url(#b)"/><circle cx="150" cy="138" r="70" fill="#fff" fill-opacity=".35"/><text x="150" y="262" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="600" font-size="40" fill="#fff">${t.title}</text></svg>`)))}`;
let ti = Number(q.get('track')) || 0;
const music = { available: true, error: '', session: !q.get('nomusic'), app: 'Spotify.exe', source: 'spotify', album: 'Demo', playing: q.get('paused') ? false : true, position: 119, duration: TRACKS[ti].dur, positionAt: Date.now(), canNext: true, canPrev: true, canSeek: true };
const musicState = () => {
  const t = TRACKS[ti];
  return { ...music, title: t.title, artist: t.artist, key: `${t.artist}|${t.title}`, cover: cover(t), duration: t.dur };
};

// --- Pomodoro ---
const pomo = { phase: 'focus', running: false, sprint: 1, remaining: set.pomoFocusSeconds, endAt: null };
let pomoTimer = null;
const pomoSnap = () => ({ ...pomo, sprints: set.pomoSprints, duration: pomo.phase === 'focus' ? set.pomoFocusSeconds : set.pomoRestSeconds, remaining: pomo.running ? Math.max(0, (pomo.endAt - Date.now()) / 1000) : pomo.remaining, at: Date.now() });
const pomoEmit = () => emit('pomo:state', pomoSnap());
function pomoFinish() {
  clearInterval(pomoTimer);
  pomo.running = false;
  pomo.endAt = null;
  const finishedFocus = pomo.phase === 'focus';
  pomo.phase = finishedFocus ? 'rest' : 'focus';
  if (!finishedFocus) pomo.sprint = pomo.sprint >= set.pomoSprints ? 1 : pomo.sprint + 1;
  pomo.remaining = pomo.phase === 'focus' ? set.pomoFocusSeconds : set.pomoRestSeconds;
  emit('pomo:sound', { name: set.pomoSoundName, volume: set.pomoSoundVolume / 100, repeat: 1, custom: '' });
  pomoEmit();
}
const pomoAct = (a, arg) => {
  if (a === 'toggle') a = pomo.running ? 'pause' : 'start';
  if (a === 'start' && !pomo.running) {
    pomo.endAt = Date.now() + pomo.remaining * 1000;
    pomo.running = true;
    pomoTimer = setInterval(() => pomo.endAt - Date.now() <= 0 && pomoFinish(), 250);
  } else if (a === 'pause' && pomo.running) {
    pomo.remaining = Math.max(0, (pomo.endAt - Date.now()) / 1000);
    pomo.running = false;
    pomo.endAt = null;
    clearInterval(pomoTimer);
  } else if (a === 'reset') {
    clearInterval(pomoTimer);
    pomo.running = false;
    pomo.endAt = null;
    pomo.phase = 'focus';
    pomo.sprint = 1;
    pomo.remaining = set.pomoFocusSeconds;
  } else if (a === 'skip') {
    const was = pomo.running;
    clearInterval(pomoTimer);
    pomo.running = false;
    pomo.phase = pomo.phase === 'focus' ? 'rest' : 'focus';
    pomo.remaining = pomo.phase === 'focus' ? set.pomoFocusSeconds : set.pomoRestSeconds;
    if (was) return pomoAct('start');
  } else if (a === 'setDuration') {
    const s = Math.round(Number(arg));
    if (s > 0) {
      clearInterval(pomoTimer);
      pomo.running = false;
      pomo.endAt = null;
      patchSet({ [pomo.phase === 'focus' ? 'pomoFocusSeconds' : 'pomoRestSeconds']: s });
      pomo.remaining = s;
    }
  }
  pomoEmit();
};

// --- Notes / calendar / clipboard / shelf ---
const ago = (min) => Date.now() - min * 60000;
let notes = [
  { id: 'a.md', text: 'Probar el notch nuevo', isTask: true, done: false, created: ago(120) },
  { id: 'b.md', text: 'bro necesitamos más disciplina y estudiar más', isTask: true, done: true, created: ago(60 * 20) },
];
const notesInfo = () => ({ folder: 'C:\\Users\\tu\\iCloudDrive\\Isla Notas', display: 'iCloud Drive › Isla Notas', isDefault: false, isICloud: true, exists: true, status: 'Se sincroniza con iCloud Drive', iCloudGuess: 'C:\\Users\\tu\\iCloudDrive' });
const notesPayload = () => ({ items: notes.slice(), info: notesInfo() });
let events = [];
let clipItems = [
  { id: 'c1', kind: 'text', text: 'Reunión mañana a las 9, llevar el reporte', date: Date.now(), app: 'Notas' },
  { id: 'c2', kind: 'link', text: 'https://github.com/tu-usuario/tu-isla', date: Date.now(), app: 'Chrome' },
  { id: 'c3', kind: 'text', text: 'npm run build && npm start', date: Date.now(), app: 'Terminal' },
  { id: 'c4', kind: 'text', text: 'bro necesitamos más disciplina y estudiar más', date: Date.now(), app: 'Notas' },
];
let shelf = [
  { id: 's1', name: 'Captura 2026-10-25.png', ext: 'png', missing: false },
  { id: 's2', name: 'presupuesto.xlsx', ext: 'xlsx', missing: false },
  { id: 's3', name: 'clase-3.pdf', ext: 'pdf', missing: false },
  { id: 's4', name: 'idea.md', ext: 'md', missing: false },
];
const keys = {};

const dim = {
  platform: 'win32',
  settings: {
    getAll: async () => clone(set),
    patch: async (o) => patchSet(o),
    reset: async () => {
      const all = clone(DEFAULTS);
      patchSet(all);
    },
    onChange: (cb) => on('settings:changed', cb),
  },
  island: {
    info: async () => info(),
    onInfo: (cb) => on('island:info', cb),
    onState: (cb) => on('island:state', cb),
    setOpen: (o) => {
      open = !!o;
      emit('island:state', { open });
    },
    reportRect: () => {},
    pin: () => {},
    wantFocus: () => {},
    peek: () => {},
    openSettings: (tab) => window.open(`settings.html?tab=${tab || ''}`, '_blank'),
    onCommand: (cb) => on('cmd', cb),
    onGame: (cb) => on('sys:game', cb),
  },
  music: {
    get: async () => musicState(),
    onState: (cb) => on('music:state', cb),
    control: async (cmd, arg) => {
      const now = Date.now();
      if (music.playing) music.position += (now - music.positionAt) / 1000;
      music.positionAt = now;
      if (cmd === 'toggle') music.playing = !music.playing;
      if (cmd === 'next') (ti = (ti + 1) % TRACKS.length), (music.position = 0);
      if (cmd === 'prev') (ti = (ti + TRACKS.length - 1) % TRACKS.length), (music.position = 0);
      if (cmd === 'seek') music.position = Number(arg) || 0;
      emit('music:state', musicState());
      return true;
    },
  },
  pomo: { get: async () => pomoSnap(), onState: (cb) => on('pomo:state', cb), onFinished: (cb) => on('pomo:finished', cb), onSound: (cb) => on('pomo:sound', cb), act: async (a, arg) => pomoAct(a, arg), previewSound: () => emit('pomo:sound', { name: set.pomoSoundName, volume: set.pomoSoundVolume / 100, repeat: 1, custom: '' }) },
  notes: {
    get: async () => notesPayload(),
    onChange: (cb) => on('notes:changed', cb),
    add: async (text, task) => {
      notes.unshift({ id: `n${Date.now()}.md`, text, isTask: task !== false, done: false, created: Date.now() });
      emit('notes:changed', notesPayload());
    },
    toggle: async (id) => {
      const n = notes.find((x) => x.id === id);
      if (n) n.done = !n.done;
      emit('notes:changed', notesPayload());
    },
    remove: async (id) => {
      notes = notes.filter((x) => x.id !== id);
      emit('notes:changed', notesPayload());
    },
    removeAll: async () => ((notes = []), emit('notes:changed', notesPayload()), true),
    chooseFolder: async () => true,
    useLocalFolder: async () => true,
    useICloudFolder: async () => true,
    reveal: async () => {},
  },
  clip: {
    get: async () => ({ items: clipItems.slice(), paused: set.clipPaused }),
    onChange: (cb) => on('clip:changed', cb),
    onToast: (cb) => on('clip:toast', cb),
    copy: async () => true,
    remove: async (id) => {
      clipItems = clipItems.filter((c) => c.id !== id);
      emit('clip:changed', { items: clipItems.slice(), paused: set.clipPaused });
    },
    clear: async () => {
      clipItems = [];
      emit('clip:changed', { items: [], paused: set.clipPaused });
    },
  },
  ai: {
    send: async (provider, messages) => {
      await new Promise((r) => setTimeout(r, 500));
      if (!keys[provider] && provider !== 'ollama') return { ok: false, error: `Falta la clave de API de ${provider}. Ponla en Ajustes › IA.` };
      return { ok: true, text: `Respuesta de ejemplo de ${provider} a: "${messages[messages.length - 1].text}"` };
    },
    hasKey: async (p) => !!keys[p],
    setKey: async (p, k) => ((keys[p] = !!k), { ok: true }),
    clearKey: async (p) => void (keys[p] = false),
    history: async () => [],
    saveHistory: () => {},
    clearHistory: async () => {},
    openWeb: () => {},
    signOutAll: async () => true,
    onSignedOut: (cb) => on('ai:signedOut', cb),
    encryptionAvailable: async () => true,
  },
  session: {
    info: async () => ({ folder: 'C:\\Users\\tu\\AppData\\Roaming\\Dynamic Island Music\\Sesiones', isDefault: true, file: '', exists: false, savedAt: null, ownPassword: false, encryption: true }),
    save: async () => ({ ok: true, message: 'Copia guardada (12 cookies de las IA).' }),
    restore: async () => ({ ok: true, message: 'Sesiones restauradas (12 cookies de las IA).' }),
    chooseFolder: async () => true,
    useAppFolder: async () => true,
    setPassword: async () => ({ ok: true, message: 'Contraseña propia guardada.' }),
    clearPassword: async () => ({ ok: true, message: 'Se vuelve a usar la clave automática de este PC.' }),
  },
  ailock: {
    state: async () => ({ mode: set.aiLock === 'none' || set.aiLock === 'auto' ? 'none' : 'pin', locked: false, hello: false, pinSet: false, needsPin: false, retryIn: 0 }),
    refresh: async () => ({ mode: 'none', locked: false, hello: false, pinSet: false, needsPin: false, retryIn: 0 }),
    onState: (cb) => on('ailock:state', cb),
    unlockHello: async () => ({ ok: true }),
    unlockPin: async () => ({ ok: true }),
    setPin: async () => ({ ok: true }),
    changePin: async () => ({ ok: true }),
    removePin: async () => ({ ok: true }),
  },
  perf: {
    subscribe: (flag) => {
      clearInterval(dim.__perfTimer);
      if (flag) dim.__perfTimer = setInterval(() => emit('perf:sample', { cpu: 30 + Math.round(Math.random() * 20), ramUsedGB: 17.2, ramTotalGB: 32, ramPercent: 54, gpu: 60 + Math.round(Math.random() * 15), gpuTemp: 67, gpuName: 'GPU', hz: 165, at: Date.now() }), 1000);
    },
    onSample: (cb) => on('perf:sample', cb),
    get: async () => null,
  },
  system: {
    info: async () => ({ platform: 'win32', arch: 'x64', os: 'Windows 11 (10.0.22631)', model: 'ASUS ROG Strix', cpu: 'AMD Ryzen 7 7800X3D', cores: 16, ramGB: 32, gpus: ['NVIDIA GeForce RTX 4070'], hasBattery: !q.get('nobattery'), displays: [{ id: 1, key: displayKey(display), label: 'Pantalla 1', primary: true, size: display.size, scaleFactor: 1, hz: 165, pixels: { width: screenW, height: 1080 } }], game: { exclusive: false, busy: false } }),
    onDisplays: (cb) => on('system:displays', cb),
  },
  calendar: {
    list: async () => events.slice(),
    add: async (ev) => {
      events.push({ id: `e${Date.now()}`, ...ev });
      emit('cal:changed', events.slice());
    },
    remove: async (id) => {
      events = events.filter((e) => e.id !== id);
      emit('cal:changed', events.slice());
    },
    onChange: (cb) => on('cal:changed', cb),
  },
  shelf: {
    list: async () => shelf.slice(),
    onChange: (cb) => on('shelf:changed', cb),
    addPaths: async () => 0,
    pathsFromFiles: () => [],
    remove: async () => {},
    clear: async () => {
      shelf = [];
      emit('shelf:changed', []);
    },
    reveal: async () => {},
    startDrag: () => {},
  },
  app: {
    info: async () => ({ name: 'Dynamic Island Music', version: '0.1.0-dev', platform: 'win32', packaged: false, electron: 'dev', chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '?', userData: '' }),
    openExternal: () => {},
    pickFile: async () => '',
    shortcutStatus: async () => ({ shortcutToggle: 'ok', shortcutPlayer: 'ok', shortcutPomodoro: 'ok', shortcutChat: 'busy', shortcutPeek: 'ok' }),
    onShortcutStatus: (cb) => on('app:shortcutStatus', cb),
    quit: () => {},
    wipeData: async () => true,
    exportSettings: async () => true,
    importSettings: async () => true,
    openUserData: async () => {},
    openSystemSettings: () => {},
  },
  settingsWindow: { onGoto: (cb) => on('settings:goto', cb) },
};

window.dim = dim;
window.__shim = { emit, set: () => set, patchSet, music, TRACKS, setTrack: (i) => ((ti = i), (music.position = 0), emit('music:state', musicState())), toast: (item) => emit('clip:toast', item), AI_PROVIDERS, parseDuration };
