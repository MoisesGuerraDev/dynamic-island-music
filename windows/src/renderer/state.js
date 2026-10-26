// Everything the island page knows. The main process owns the real data and pushes changes here.
import { COMPONENT_META, AI_META, AI_PROVIDERS, DEFAULTS, normalizeComponents } from '../shared/defaults.js';
import { paginate } from '../shared/layout.js';

export const S = {
  set: JSON.parse(JSON.stringify(DEFAULTS)),
  info: { cap: 900, displayKey: '', winWidth: 1040, topOffset: 10, screenWidth: 1440 },
  open: false,
  view: 'home', // home | tray | game | clip | chat
  page: 0,
  editing: false,
  music: null,
  pomo: null,
  notes: { items: [], info: {} },
  clip: { items: [], paused: false },
  cal: [],
  shelf: [],
  perf: null,
  hasBattery: null,
  battery: null,
  game: { exclusive: false, busy: false },
  chat: { provider: 'claude', messages: [], sending: false },
  ui: { noteAdding: false, calAdding: false, timeEditing: false, calDay: 0, camOn: false, camError: '' },
  lastPlayedAt: 0,
  rot: 0,
};

/** Hooks filled in by island.js so the other modules can ask for a redraw without importing it. */
export const bus = { render() {}, renderCol() {}, renderPill() {}, renderTabs() {}, syncPerf() {} };

// --- Layout of the home row (per screen when "remember per screen" is on) ---

export function comps() {
  const s = S.set;
  if (s.rememberPerDisplay) {
    const mine = (s.layoutsByDisplay || {})[S.info.displayKey];
    if (Array.isArray(mine) && mine.length) return normalizeComponents(mine);
  }
  return s.components;
}

export function activeComps() {
  return comps().filter((c) => c.enabled);
}

export function pages() {
  return paginate(activeComps(), S.info.cap);
}

export function metaOf(id) {
  return COMPONENT_META[id];
}

// --- Features that decide which tabs exist ---

export function enabledAI() {
  const on = S.set.aiEnabled || {};
  const list = AI_PROVIDERS.filter((p) => on[p]);
  return list.length ? list : ['claude'];
}

export function defaultAI() {
  const list = enabledAI();
  return list.includes(S.set.aiProvider) ? S.set.aiProvider : list[0];
}

export function aiMeta(p) {
  return AI_META[p];
}

export function tabsAvailable() {
  const s = S.set;
  const tabs = ['home'];
  if (s.shelfEnabled) tabs.push('tray');
  if (s.gameTabEnabled) tabs.push('game');
  if (s.clipEnabled) tabs.push('clip');
  tabs.push('chat');
  return tabs;
}

export function componentOn(id) {
  return activeComps().some((c) => c.id === id);
}
