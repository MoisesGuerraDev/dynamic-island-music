// Default settings. Same component ids and widths as the macOS app (boringNotch/islandmusic/IslandDefaults.swift),
// so the two apps feel the same. Everything here is configurable from the settings window.

export const COMPONENTS = ['player', 'calendar', 'notes', 'pomodoro', 'camera', 'chat', 'clipboard', 'shelf', 'game', 'performance'];

export const COMPONENT_META = {
  player: { name: 'Reproductor', icon: 'screen', width: 312, min: 290 },
  calendar: { name: 'Calendario', icon: 'cal', width: 222, min: 190 },
  notes: { name: 'Notas', icon: 'note', width: 178, min: 150 },
  pomodoro: { name: 'Temporizador', icon: 'clock', width: 159, min: 140 },
  camera: { name: 'Cámara', icon: 'cam', width: 178, min: 110 },
  chat: { name: 'Chat de IA', icon: 'spark', width: 220, min: 190 },
  clipboard: { name: 'Portapapeles', icon: 'clip', width: 210, min: 170 },
  shelf: { name: 'Bandeja', icon: 'tray', width: 210, min: 170 },
  game: { name: 'Juego', icon: 'game', width: 160, min: 130 },
  performance: { name: 'Rendimiento', icon: 'bolt', width: 190, min: 160 },
};

export const MAX_COMPONENT_WIDTH = 520;
export const SIDE_PADDING = 14; // each side of the open island (the Mac island: 1077 = 1049 of components + 2 x 14)

export function defaultComponents() {
  const on = new Set(['player', 'calendar', 'notes', 'pomodoro', 'camera']);
  return COMPONENTS.map((id) => ({ id, enabled: on.has(id), width: COMPONENT_META[id].width }));
}

export const AI_PROVIDERS = ['claude', 'openai', 'gemini', 'ollama', 'custom'];

export const AI_META = {
  claude: { name: 'Claude', letter: 'C', color: '#d97757', model: 'claude-haiku-5-5', needsKey: true },
  openai: { name: 'ChatGPT', letter: 'G', color: '#10a37f', model: 'gpt-4o-mini', needsKey: true },
  gemini: { name: 'Gemini', letter: 'Ge', color: '#4285f4', model: 'gemini-2.0-flash', needsKey: true },
  ollama: { name: 'Ollama (local)', letter: 'O', color: '#8e93a3', model: 'llama3.2', needsKey: false },
  custom: { name: 'Otra IA', letter: '+', color: '#a78bfa', model: '', needsKey: true },
};

/** AIs used by signing in with the person's own account, inside the island (no API key). */
export const WEB_AI = ['claude', 'openai', 'gemini', 'deepseek'];
export const WEB_AI_META = {
  claude: { name: 'Claude', letter: 'C', color: '#d97757', url: 'https://claude.ai/new' },
  openai: { name: 'ChatGPT', letter: 'G', color: '#10a37f', url: 'https://chatgpt.com/' },
  gemini: { name: 'Gemini', letter: 'Ge', color: '#4285f4', url: 'https://gemini.google.com/app' },
  deepseek: { name: 'DeepSeek', letter: 'D', color: '#4d6bfe', url: 'https://chat.deepseek.com/' },
};

export const POMO_SOUNDS = ['Campana', 'Cristal', 'Marimba', 'Pulso', 'Digital', 'Gong'];

export const DEFAULTS = {
  // Layout
  components: defaultComponents(),
  manualSize: false,
  manualOpenWidth: 900,
  rememberPerDisplay: true,
  layoutsByDisplay: {},
  topOffset: 12,
  uiSize: 'm', // s 0.75 | m 1.0 | l 1.2: size of the island

  // System
  welcomed: false,
  launchAtLogin: true,
  displayMode: 'primary', // primary | all | specific
  displayKey: '',
  openOnHover: true,
  hoverDelay: 140,
  closeDelay: 650,
  closedStyle: 'activity', // always | activity | never

  // Style
  glowStyle: 'glass', // off | soft | strong | glass
  panelOpacity: 100, // 100 = all black, lower = more glass
  colorsDance: true, // the colored light pulses with a simulated beat of the song
  borderStyle: 'none', // none | open | always: thin outline of the island
  // Two lights: inside = the open island, outside = the closed island and the halo around it.
  inLightIntensity: 260, // 40 to 500 %
  inLightSize: 'm', // s | m | l
  inLightDance: 'm', // still | s | m | l
  outLightIntensity: 260,
  outLightSize: 'm',
  outLightDance: 'm',
  colorMode: 'auto', // auto (the two main colors of the cover) | rainbow | custom
  colorA: '#FF9500',
  colorB: '#FF2D55',
  liquidButtons: false, // extra refraction (lens) on the buttons; the plain glass is always on
  hoverBounce: true,
  showTabs: true,
  showHeaderButtons: true,
  separators: true,
  batteryPill: true,
  windowShadow: false, // plain black, no heavy shadow: only the colored light around it

  // Player
  preferredPlayer: 'auto', // auto | spotify | apple | browser
  coverColors: true,
  coverHD: true, // look for the official HD cover when the picture is small (sends title and artist to Apple)
  visualizer: true,
  hideMusicAfterPause: 30,

  // Pomodoro (every duration is free, in seconds)
  pomoFocusSeconds: 25 * 60,
  pomoRestSeconds: 5 * 60,
  pomoSprints: 4,
  pomoSoundEnabled: true,
  pomoSoundName: 'Campana',
  pomoSoundVolume: 80,
  pomoSoundRepeat: 2,
  pomoCustomSound: '',
  pomoNotify: true,
  pomoAutoNext: false,
  pomoOpenOnFinish: true,

  // Notes
  notesFolder: '',
  notesShowAge: true,
  notesHideDoneAfterDays: 1,
  notesOrder: 'new', // new | old

  // Calendar (events are stored on this PC)
  calendarEnabled: true,

  // AI chat
  aiProvider: 'claude',
  aiEnabled: { claude: true, openai: true, gemini: false, ollama: true, custom: false },
  aiModels: {},
  aiSaveHistory: true,
  aiIncludeNowPlaying: false,
  ollamaUrl: 'http://localhost:11434',
  customBaseUrl: '',
  aiOpenMode: 'web', // web = sign in with your own account inside the island | mini = chat with your own API key
  aiWebEnabled: { claude: true, openai: true, gemini: true, deepseek: true },
  aiWebProvider: 'claude',
  sessionBackupFolder: '', // empty = the app's own folder
  sessionBackupAuto: true,
  aiLock: 'auto', // auto (Windows Hello if there is one) | secure (Windows Hello or the app's PIN) | none
  aiLockPreferPin: false,
  aiLockRelock: '15', // always | 15 | 60 | app: when to ask again

  // Clipboard
  clipEnabled: true,
  clipPaused: false,
  clipMax: 50,
  clipPersist: true,
  clipToast: true,
  clipIgnoreSecrets: true,
  clipIgnoredApps: ['1password', 'bitwarden', 'keepass', 'keepassxc', 'lastpass', 'dashlane', 'nordpass', 'enpass', 'roboform', 'protonpass'],
  clipAutoDeleteDays: 7,

  // Performance
  perfShowCPU: true,
  perfShowGPU: true,
  perfShowRAM: true,
  perfShowRefresh: true,
  perfShowTemp: true,
  perfInterval: 1000,
  perfOnlyWhenGame: false,

  // Live activities with the island closed
  liveMusic: true,
  livePomodoro: true,
  livePerf: false,
  liveBattery: false,
  liveMax: 2,
  livePrio: 'mus', // mus | pom
  liveRotate: 5,
  liveThirdBelow: true,

  // Tabs of the open island
  shelfEnabled: true,
  shelfRemoveOnDrag: true,
  gameTabEnabled: true,
  snakeSpeed: 110,
  snakeProgressive: true,
  snakeBest: 0,
  mirrorShape: 'circle', // circle | square

  // Game mode (Windows)
  gameHideExclusive: true,
  gameBasicOnly: true,
  gameMuteClipToast: true,

  // Shortcuts (Electron accelerators; Ctrl on Windows)
  shortcutToggle: 'Control+Shift+N',
  shortcutPlayer: 'Control+Shift+P',
  shortcutPomodoro: 'Control+Shift+T',
  shortcutChat: 'Control+Alt+Space',
  shortcutPeek: 'Control+Shift+Space',
};

export function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Fills in anything missing and keeps the components list complete and sane. */
export function normalizeSettings(raw) {
  const out = { ...clone(DEFAULTS), ...(raw && typeof raw === 'object' ? clone(raw) : {}) };
  out.aiEnabled = { ...DEFAULTS.aiEnabled, ...(out.aiEnabled || {}) };
  out.aiWebEnabled = { ...DEFAULTS.aiWebEnabled, ...(out.aiWebEnabled || {}) };
  out.components = normalizeComponents(out.components);
  return out;
}

export function normalizeComponents(list) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !COMPONENT_META[c.id] || seen.has(c.id)) continue;
    seen.add(c.id);
    const meta = COMPONENT_META[c.id];
    const w = Number(c.width);
    out.push({
      id: c.id,
      enabled: !!c.enabled,
      width: Number.isFinite(w) ? Math.max(meta.min, Math.min(MAX_COMPONENT_WIDTH, Math.round(w))) : meta.width,
    });
  }
  for (const id of COMPONENTS) {
    if (!seen.has(id)) out.push({ id, enabled: false, width: COMPONENT_META[id].width });
  }
  return out;
}
