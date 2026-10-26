// The island page: open panel, closed pill, edit mode and every tab. The main process owns the data;
// this file draws it and sends back what the person does.
import { S, bus, coverOf, comps, activeComps, pages, metaOf, tabsAvailable, enabledAI, defaultAI, aiMeta, componentOn, webMode, defaultWebAI } from './state.js';
import { esc, $, $$, dayKey } from './util.js';
import { ic, fi } from './icons.js';
import { colHTML, musicPos, pomoRemaining, timeFontSize, perfHTML } from './components.js';
import { trayHTML, clipHTML, chatHTML, bindChat, gameHTML, bindGame, stopGame, focusChatInput, focusWebview, lockHTML, bindLock, webBarHTML, showWebview, reloadWebview, resetWebviews } from './views.js';
import { editBarHTML, bindEdit, setComps } from './edit.js';
import { setLensEnabled, startLens } from './lens.js';
import { startAmbient } from './ambient.js';
import { paletteFromImage, paletteFromHex, customPalette, DEFAULT_PALETTE } from './colors.js';
import { lightsHTML, bindLights, throttledPatcher, DANCE_AMP, SIZE_IN, SIZE_OUT } from './lightui.js';
import { playPomodoroSound } from './sounds.js';
import { openWidth, uiScaleFor } from '../shared/layout.js';
import { bpmFor, pulseAt } from '../shared/pulse.js';
import { formatDuration, parseDuration } from '../shared/time.js';

let dim;
const TABN = { home: 'Inicio', tray: 'Bandeja', game: 'Juego', clip: 'Portapapeles', chat: 'Mini chat' };
const TABI = { home: 'home', tray: 'tray', game: 'game', clip: 'clip', chat: 'spark' };

// ---------- Style ----------

let paletteKey = '';

function setPalette(p) {
  const root = document.documentElement.style;
  root.setProperty('--c1', p.c1);
  root.setProperty('--c2', p.c2);
  root.setProperty('--c3', p.c3);
}

async function updatePalette() {
  const s = S.set;
  let key = 'default';
  let pal = DEFAULT_PALETTE;
  if (s.colorMode === 'rainbow') {
    return; // the colors turn by themselves (CSS); nothing to set
  } else if (s.colorMode === 'custom') {
    key = `custom:${s.colorA}:${s.colorB}`;
    pal = customPalette(s.colorA, s.colorB);
  } else if (s.coverColors && S.music && S.music.session && coverOf(S.music)) {
    key = `cover:${S.music.key}:${S.hd[S.music.key] ? 'hd' : ''}`;
    if (key === paletteKey) return;
    paletteKey = key;
    const p = await paletteFromImage(coverOf(S.music));
    if (p) setPalette(p);
    else setPalette(DEFAULT_PALETTE);
    return;
  }
  if (key === paletteKey) return;
  paletteKey = key;
  setPalette(pal);
}

function applyStyle() {
  const s = S.set;
  const root = document.documentElement;
  const stage = $('#stage');
  const notch = $('#notch');
  const pointer = notch.classList.contains('pointer');
  notch.className = `notch g-${['off', 'soft', 'strong', 'glass'].includes(s.glowStyle) ? s.glowStyle : 'glass'}${pointer ? ' pointer' : ''}`;
  stage.classList.toggle('is-open', S.open);
  stage.classList.toggle('hide-tabs', !s.showTabs);
  stage.classList.toggle('hide-header', !s.showHeaderButtons);
  stage.classList.toggle('no-viz', !s.visualizer);
  stage.classList.toggle('no-bounce', !s.hoverBounce);
  stage.classList.toggle('no-shadow', !s.windowShadow);
  for (const g of ['off', 'soft', 'glass', 'strong']) stage.classList.toggle(`glow-${g}`, (['off', 'soft', 'strong', 'glass'].includes(s.glowStyle) ? s.glowStyle : 'glass') === g);
  for (const m of ['none', 'open', 'always']) stage.classList.toggle(`rim-${m}`, (s.borderStyle || 'none') === m);
  root.style.setProperty('--top', `${s.topOffset}px`);
  for (const m of ['auto', 'rainbow', 'custom']) stage.classList.toggle(`cm-${m}`, (s.colorMode || 'auto') === m);
  stage.style.setProperty('--gin', String(Math.max(0.4, Math.min(5, s.inLightIntensity / 100))));
  stage.style.setProperty('--gout', String(Math.max(0.4, Math.min(5, s.outLightIntensity / 100))));
  stage.style.setProperty('--si', String(SIZE_IN[s.inLightSize] ?? 1));
  stage.style.setProperty('--so', String(SIZE_OUT[s.outLightSize] ?? 1));
  root.style.setProperty('--pa', String(Math.max(0.3, Math.min(1, s.panelOpacity / 100))));
  setLensEnabled(s.liquidButtons);
  paletteKey = s.colorMode === 'auto' ? paletteKey : '';
  updatePalette();
  syncDance();
  syncHalo();
  lightsIdle();
}

// ---------- Colors that dance with the music ----------

const IDLE_PULSE = 0.15;
const STILL_PULSE = 0.3; // a "still" light sits at a steady medium glow
let danceRaf = 0;
let lastFrame = 0;

/** base = the beat from 0 to 1; each light scales it by its own dance setting. */
function setPulse(base) {
  const st = $('#stage').style;
  const on = S.set.colorsDance;
  const amp = (k) => (on ? (DANCE_AMP[S.set[k]] ?? 1) : 0);
  const val = (a) => (a === 0 ? STILL_PULSE : base * a);
  st.setProperty('--pulse', base.toFixed(3)); // the cover grows 3 % with the plain beat
  st.setProperty('--pin', val(amp('inLightDance')).toFixed(3));
  st.setProperty('--pout', val(amp('outLightDance')).toFixed(3));
}

function danceWanted() {
  const m = S.music;
  if (!S.set.colorsDance || !m || !m.session || !m.playing) return false;
  if (S.set.inLightDance === 'still' && S.set.outLightDance === 'still') return false;
  return S.open || $('#pill').classList.contains('glow');
}

function danceLoop(ts) {
  danceRaf = 0;
  if (!danceWanted()) {
    setPulse(IDLE_PULSE);
    return;
  }
  if (ts - lastFrame >= 33) {
    lastFrame = ts;
    const m = S.music;
    setPulse(pulseAt(musicPos(), bpmFor(m.title, m.artist)));
  }
  danceRaf = requestAnimationFrame(danceLoop);
}

/** Starts or stops the beat animation. Called whenever the music, the settings or the open state change. */
function syncDance() {
  if (danceWanted()) {
    if (!danceRaf) danceRaf = requestAnimationFrame(danceLoop);
  } else {
    if (danceRaf) cancelAnimationFrame(danceRaf);
    danceRaf = 0;
    setPulse(IDLE_PULSE);
  }
}

/** The rainbow only turns while there is something to see. */
function lightsIdle() {
  $('#stage').classList.toggle('lights-idle', !S.open && $('#pill').classList.contains('off'));
}

// ---------- HD cover for small pictures ----------

const hdTried = new Set();

/** A small picture (browser videos): look for the official cover by title and artist. */
function ensureHd(m) {
  if (!S.set.coverHD || !m || !m.session || !m.cover || !m.title || S.hd[m.key] || hdTried.has(m.key)) return;
  if (hdTried.size > 200) hdTried.clear();
  hdTried.add(m.key);
  const img = new Image();
  img.onload = async () => {
    if (img.naturalWidth >= 500 && img.naturalHeight >= 500) return;
    let hd = null;
    try {
      hd = await dim.music.hdCover({ title: m.title, artist: m.artist });
    } catch {
      /* offline: keep the small one */
    }
    if (!hd) return;
    S.hd[m.key] = hd;
    paletteKey = '';
    updatePalette();
    renderRow();
    renderPill();
  };
  img.src = m.cover;
}

// ---------- Header ----------

function renderTabs() {
  const tabs = tabsAvailable();
  $('#ntabs-l').innerHTML = tabs
    .map((n) => `<button class="tab${S.view === n ? ' on' : ''}" data-act="tab" data-v="${n}" aria-label="${TABN[n]}" title="${TABN[n]}">${ic(TABI[n])}</button>`)
    .join('');
  const b = S.battery;
  const pct = b ? Math.round(b.level * 100) : 0;
  const bat = S.set.batteryPill && S.hasBattery !== false && b ? `<span class="pill"><span class="bat${b.charging ? ' chg' : ''}" style="--lvl:${Math.max(8, pct)}%"></span>${pct}%</span>` : '';
  $('#ntabs-r').innerHTML = `${bat}<button class="round" data-act="lights-toggle" aria-label="Luces y colores" title="Luces y colores">${ic('sun')}</button><button class="round" data-act="edit-toggle" aria-label="${S.editing ? 'Terminar de editar' : 'Editar componentes'}" title="${S.editing ? 'Listo' : 'Editar componentes'}">${ic(S.editing ? 'check' : 'edit')}</button><button class="round" data-act="open-settings" aria-label="Ajustes" title="Ajustes">${ic('gear')}</button><button class="round" data-act="close-island" aria-label="Cerrar la isla" title="Cerrar la isla">${ic('x')}</button>`;
}

function renderDots(n) {
  const m = $('#ntabs-m');
  if (n < 2) {
    m.innerHTML = '';
    return;
  }
  m.innerHTML = `<span class="dots">${Array.from({ length: n }, (_, i) => `<button class="dot${i === S.page ? ' on' : ''}" data-act="dot" data-p="${i}" aria-label="Página ${i + 1}"></button>`).join('')}</span>`;
}

// ---------- Panel of lights ----------

const LIGHT_KEYS = new Set(['colorMode', 'colorA', 'colorB', 'inLightIntensity', 'inLightSize', 'inLightDance', 'outLightIntensity', 'outLightSize', 'outLightDance']);
const lightsSend = throttledPatcher((o) => dim.settings.patch(o));

function renderLightPanel() {
  const el = $('#lightpanel');
  el.hidden = !S.ui.lightsOpen;
  if (!S.ui.lightsOpen) {
    scheduleRect();
    return;
  }
  el.innerHTML = `<b style="font-size:14px;display:block;margin-bottom:8px">Luces y colores</b>${lightsHTML(S.set)}`;
  bindLights(el, {
    patch: (o) => {
      Object.assign(S.set, o);
      applyStyle();
      lightsSend(o);
    },
    getSet: () => S.set,
    redraw: renderLightPanel,
  });
  scheduleRect();
}

// ---------- Row ----------

function keepFocus(fn) {
  const a = document.activeElement;
  const id = a && a.id;
  const isText = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  const val = isText ? a.value : null;
  const ss = isText ? a.selectionStart : 0;
  fn();
  if (id && isText) {
    const n = document.getElementById(id);
    if (n) {
      n.focus();
      n.value = val;
      try {
        n.setSelectionRange(ss, ss);
      } catch {
        /* not a text field */
      }
    }
  }
}

function setWidth(px) {
  const st = $('#stage').style;
  st.setProperty('--w', `${Math.round(px)}px`);
  // The island keeps its size (1077 x 187 at 100 %); on a narrow screen it is drawn smaller, never over 75 % of the width.
  st.setProperty('--ui', uiScaleFor(px, S.info.cap, S.set.uiSize).toFixed(3));
}

/** The halo copies the height of the island (its width follows the same --w). */
function syncHalo() {
  const h = `${$('#notch').offsetHeight + 8 * (Number(getComputedStyle($('#stage')).getPropertyValue('--so')) || 1)}px`;
  document.querySelectorAll('.halo').forEach((el) => {
    el.style.height = h;
  });
}

function renderRow() {
  const web = S.view === 'chat' && webMode() && !S.lock.locked;
  $('#row').hidden = web;
  $('#webdock').hidden = !web;
  if (web) {
    $('#row').innerHTML = '';
    // The embedded site is never rebuilt: only the bar above it is.
    $('#ntabs-m').innerHTML = '';
    $('#editbar').hidden = true;
    $('#webbar').innerHTML = webBarHTML();
    showWebview(S.chat.web);
    focusWebview(S.chat.web);
    const homeW = openWidth(pages()[Math.min(S.page, pages().length - 1)] || [], S.info.cap);
    setWidth(Math.min(S.info.cap, Math.max(680, homeW)));
    renderPill();
    scheduleRect();
    return;
  }
  keepFocus(() => {
    const row = $('#row');
    stopGame();
    row.className = `row${S.set.separators ? ' seps' : ''}`;
    row.style.height = S.view === 'chat' ? '188px' : '';
    $('#ntabs-m').innerHTML = '';
    $('#editbar').hidden = true;
    const cap = S.info.cap;

    if (S.view !== 'home') {
      const homeW = openWidth((pages()[Math.min(S.page, pages().length - 1)] || []), cap);
      setWidth(Math.min(cap, Math.max(680, homeW)));
      if (S.view === 'tray') row.innerHTML = trayHTML();
      else if (S.view === 'clip') row.innerHTML = clipHTML();
      else if (S.view === 'game') {
        row.innerHTML = gameHTML();
        bindGame();
      } else if (S.view === 'chat' && S.lock.locked) {
        row.innerHTML = lockHTML();
        bindLock();
      } else if (S.view === 'chat') {
        row.innerHTML = chatHTML();
        bindChat();
      }
      afterRender();
      return;
    }

    const act = activeComps();
    if (!act.length) {
      setWidth(560);
      row.innerHTML = '<p class="empty">Enciende al menos un componente en Ajustes o agrégalo con el lápiz.</p>';
      renderEditBar();
      afterRender();
      return;
    }
    const pgs = pages();
    if (S.page >= pgs.length) S.page = pgs.length - 1;
    if (S.page < 0) S.page = 0;
    const items = pgs[S.page];
    setWidth(openWidth(items, cap));
    renderDots(pgs.length);
    row.innerHTML = items
      .map(
        (c) =>
          `<div class="col${S.editing ? ' ed' : ''}" data-k="${c.id}" style="flex:${c.width} 1 ${c.width}px;min-width:${metaOf(c.id).min}px"${S.editing ? ' draggable="true"' : ''}>${
            S.editing
              ? `<button class="mnus" data-act="rm-comp" data-k="${c.id}" aria-label="Quitar ${metaOf(c.id).name}">${ic('minus')}</button><span class="rsz" data-rz="${c.id}" role="separator" aria-label="Cambiar el tamaño de ${metaOf(c.id).name}"></span>`
              : ''
          }${colHTML(c.id)}</div>`,
      )
      .join('');
    bindEdit(row);
    renderEditBar();
    afterRender();
  });
}

function renderEditBar() {
  const eb = $('#editbar');
  if (!S.editing || S.view !== 'home') {
    eb.hidden = true;
    return;
  }
  eb.hidden = false;
  eb.innerHTML = editBarHTML();
}

/** Things to do after any redraw of the row: focus inputs, attach the camera, refresh the rectangle. */
function afterRender() {
  bindInputs();
  const v = $('#camv');
  if (v && camStream) v.srcObject = camStream;
  renderPill();
  syncPerf();
  scheduleRect();
}

function bindInputs() {
  const nin = $('#note-in');
  if (nin) {
    if (document.activeElement !== nin) nin.focus();
    nin.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const v = nin.value.trim();
        S.ui.noteAdding = false;
        if (v) dim.notes.add(v, !(e.ctrlKey || e.metaKey));
        renderRow();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        S.ui.noteAdding = false;
        renderRow();
      }
    };
    nin.onblur = () => setTimeout(() => {
      const cur = $('#note-in');
      if (S.ui.noteAdding && (!cur || document.activeElement !== cur)) {
        S.ui.noteAdding = false;
        renderRow();
      }
    }, 150);
  }
  const cin = $('#cal-in');
  if (cin) {
    if (document.activeElement !== cin) cin.focus();
    cin.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const v = cin.value.trim();
        const m = /^(\d{1,2}):(\d{2})\s+(.+)$/.exec(v);
        const date = dayKey(new Date(Date.now() + S.ui.calDay * 86_400_000));
        S.ui.calAdding = false;
        if (v) dim.calendar.add(m ? { title: m[3], time: `${m[1].padStart(2, '0')}:${m[2]}`, date } : { title: v, time: '', date });
        renderRow();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        S.ui.calAdding = false;
        renderRow();
      }
    };
    cin.onblur = () => setTimeout(() => {
      const cur = $('#cal-in');
      if (S.ui.calAdding && (!cur || document.activeElement !== cur)) {
        S.ui.calAdding = false;
        renderRow();
      }
    }, 150);
  }
  const tin = $('#tin');
  if (tin) {
    if (document.activeElement !== tin) {
      tin.focus();
      tin.select();
    }
    const apply = () => {
      const sec = parseDuration(tin.value);
      S.ui.timeEditing = false;
      if (sec > 0) dim.pomo.act('setDuration', sec);
      renderRow();
    };
    tin.onkeydown = (e) => {
      if (e.key === 'Enter') apply();
      else if (e.key === 'Escape') {
        e.stopPropagation();
        S.ui.timeEditing = false;
        renderRow();
      }
    };
    tin.onblur = () => setTimeout(() => {
      if (S.ui.timeEditing && document.activeElement !== $('#tin')) apply();
    }, 150);
  }
}

function render() {
  applyStyle();
  renderTabs();
  renderRow();
}

bus.render = render;
bus.renderCol = renderRow;
bus.renderPill = renderPill;
bus.renderTabs = renderTabs;
bus.syncPerf = syncPerf;

// ---------- Closed pill (live activities) ----------

const LIVE_ORDER = { mus: ['mus', 'pom', 'perf', 'bat'], pom: ['pom', 'mus', 'perf', 'bat'] };

function liveKeys() {
  const s = S.set;
  const m = S.music;
  const on = {
    mus: s.liveMusic && m && m.session && (m.playing || Date.now() - S.lastPlayedAt < s.hideMusicAfterPause * 1000),
    pom: s.livePomodoro && S.pomo && S.pomo.running,
    perf: s.livePerf && S.perf && (!s.perfOnlyWhenGame || S.game.busy),
    bat: s.liveBattery && S.hasBattery && S.battery && S.battery.charging,
  };
  return (LIVE_ORDER[s.livePrio] || LIVE_ORDER.mus).filter((k) => on[k]);
}

function liveParts(k) {
  const m = S.music;
  if (k === 'mus') {
    const mart = `<span class="mart">${coverOf(m) ? `<img src="${esc(coverOf(m))}" alt="">` : ''}</span>`;
    const viz = '<span class="viz"><i></i><i></i><i></i><i></i></span>';
    return { l: mart, r: viz, c: mart + viz };
  }
  if (k === 'pom') {
    const icn = `<span class="ci2">${ic('clock')}</span>`;
    const t = `<b class="mono" data-pt>${formatDuration(Math.ceil(pomoRemaining()))}</b>`;
    return { l: icn, r: t, c: icn + t };
  }
  if (k === 'perf') {
    const p = S.perf;
    const left = `<span class="fps">CPU ${p.cpu}%</span>`;
    const gpu = p.gpu === null ? `<b class="mono">RAM ${p.ramPercent}%</b>` : `<b class="mono">GPU ${S.set.perfShowTemp && p.gpuTemp !== null ? p.gpuTemp + '°' : p.gpu + '%'}</b>`;
    return { l: left, r: gpu, c: `<span class="fps">${p.cpu}%</span>${p.gpu === null ? '' : gpu}` };
  }
  const pct = Math.round(S.battery.level * 100);
  const bolt = `<span class="ci2 gr">${ic('bolt')}</span>`;
  return { l: bolt, r: `<b class="mono">${pct}%</b>`, c: `${bolt}<b class="mono">${pct}%</b>` };
}

let lastLiveSig = '';

function renderPill() {
  const pill = $('#pill');
  const third = $('#third');
  const keys = liveKeys();
  const s = S.set;
  const max = Math.max(1, Math.min(3, s.liveMax));
  let ordered = keys.slice();
  if (ordered.length > max) {
    const r = S.rot % ordered.length;
    ordered = ordered.slice(r).concat(ordered.slice(0, r));
  }
  const shown = ordered.slice(0, max);
  const extra = keys.length - shown.length;
  const show = s.closedStyle === 'always' || (s.closedStyle === 'activity' && keys.length > 0);
  lastLiveSig = `${keys.join()}|${S.rot}|${max}|${show}`;

  let html = '<span class="idle"></span>';
  let w = 92;
  const two = shown.slice(0, 2);
  if (two.length === 1) {
    const p = liveParts(two[0]);
    html = `<div class="lside">${p.l}</div><div class="rside">${p.r}</div>`;
    w = 176;
  } else if (two.length === 2) {
    html = `<div class="lside">${liveParts(two[0]).c}</div><div class="rside">${liveParts(two[1]).c}</div>`;
    w = 236;
  }
  if (extra > 0 || (shown.length > 2 && !s.liveThirdBelow)) html += `<span class="more" title="Las demás rotan cada ${s.liveRotate} segundos">+${Math.max(extra, shown.length - 2)}</span>`;
  pill.innerHTML = html;
  pill.style.width = `${w}px`;
  pill.classList.toggle('off', !show);
  pill.classList.toggle('glow', shown.includes('mus') && s.glowStyle !== 'off');
  pill.classList.toggle('paused', !(S.music && S.music.playing));

  if (shown.length > 2 && s.liveThirdBelow && !S.open) {
    third.innerHTML = liveParts(shown[2]).c;
    third.hidden = false;
  } else {
    third.hidden = true;
  }
  syncDance();
  scheduleRect();
}

// ---------- Toast ----------

let toastTimer = null;

function showToast(item) {
  if (S.open) return;
  const t = $('#toast');
  t.innerHTML = `<span class="ck">Copiado</span><span class="tx">${esc(item.kind === 'image' ? item.text : item.text.slice(0, 120))}</span>`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 2400);
}

/** First start: one line of credit, nothing else. */
function showWelcome() {
  const t = $('#toast');
  t.innerHTML = '<span class="tx">By: MoisesGuerraDev</span>';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 4500);
}

// ---------- Pointer rectangle for the main process ----------

let rectTimer = null;

function reportRect() {
  const notch = $('#notch');
  const pill = $('#pill');
  const ui = Number(getComputedStyle($('#stage')).getPropertyValue('--ui')) || 1;
  let r = { x: 0, y: 0, w: 0, h: 0 };
  if (S.open) {
    // The island is drawn scaled from its top center; offsets ignore transforms, so apply the scale here.
    const cx = notch.offsetLeft + notch.offsetWidth / 2;
    r = { x: cx - (notch.offsetWidth * ui) / 2, y: notch.offsetTop, w: notch.offsetWidth * ui, h: notch.offsetHeight * ui };
    const lp = $('#lightpanel');
    if (!lp.hidden) {
      // The panel hangs below the island: that part must be clickable too.
      const b = lp.getBoundingClientRect();
      const x1 = Math.min(r.x, b.left), y1 = Math.min(r.y, b.top);
      const x2 = Math.max(r.x + r.w, b.right), y2 = Math.max(r.y + r.h, b.bottom);
      r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
  } else if (!pill.classList.contains('off')) {
    const b = pill.getBoundingClientRect();
    r = { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  dim.island.reportRect(r);
}

function scheduleRect() {
  clearTimeout(rectTimer);
  rectTimer = setTimeout(reportRect, 30);
  setTimeout(reportRect, 480);
}

// ---------- Perf subscription ----------

let perfSub = false;

function syncPerf() {
  const s = S.set;
  const items = S.view === 'home' && S.open ? (pages()[Math.min(S.page, pages().length - 1)] || []) : [];
  const inPanel = S.open && items.some((c) => c.id === 'performance');
  const inPill = !S.open && s.livePerf && (!s.perfOnlyWhenGame || S.game.busy);
  const need = inPanel || inPill;
  if (need !== perfSub) {
    perfSub = need;
    dim.perf.subscribe(need);
  }
}

// ---------- Camera ----------

let camStream = null;

async function startCam() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 240, height: 240 }, audio: false });
    S.ui.camOn = true;
    S.ui.camError = '';
  } catch {
    camStream = null;
    S.ui.camOn = false;
    S.ui.camError = 'No se pudo abrir la cámara. Revisa los permisos de Windows.';
  }
  renderRow();
}

function stopCam() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  S.ui.camOn = false;
}

// ---------- Actions ----------

function setView(v) {
  if (S.view === v) return;
  const wasWeb = S.view === 'chat' && webMode();
  S.view = v;
  if (v === 'chat' && webMode()) {
    // Typing into the site needs the keyboard: take it while this tab is showing.
    dim.island.pin('web', true);
    dim.island.wantFocus(true);
  } else if (wasWeb) {
    dim.island.pin('web', false);
    dim.island.wantFocus(false);
  }
  S.editing = false;
  dim.island.pin('edit', false);
  stopGame();
  renderTabs();
  renderRow();
  if (v === 'chat' && !S.lock.locked) setTimeout(focusChatInput, 60);
}

function setOpenLocal(open) {
  S.open = open;
  $('#stage').classList.toggle('is-open', open);
  if (!open) {
    S.editing = false;
    S.ui.noteAdding = S.ui.calAdding = S.ui.timeEditing = false;
    S.ui.lightsOpen = false;
    renderLightPanel();
    S.view = 'home';
    S.page = 0;
    stopGame();
    stopCam();
    dim.island.pin('web', false);
    dim.island.wantFocus(false);
    renderTabs();
    renderRow();
  } else {
    renderTabs();
    renderRow();
  }
  renderPill();
  syncPerf();
  syncDance();
  scheduleRect();
}

function endEdit() {
  S.editing = false;
  dim.island.pin('edit', false);
  renderTabs();
  renderRow();
}

const actions = {
  tab: (t) => setView(t.dataset.v),
  'open-view': (t) => setView(t.dataset.v),
  'edit-toggle': () => {
    S.editing = !S.editing;
    if (S.editing && S.view !== 'home') S.view = 'home';
    dim.island.pin('edit', S.editing);
    renderTabs();
    renderRow();
  },
  'lights-toggle': () => {
    S.ui.lightsOpen = !S.ui.lightsOpen;
    dim.island.pin('lights', S.ui.lightsOpen);
    renderLightPanel();
  },
  'open-settings': () => dim.island.openSettings(''),
  'open-ai-settings': () => dim.island.openSettings('ia'),
  'close-island': () => dim.island.setOpen(false),
  dot: (t) => {
    S.page = +t.dataset.p;
    renderRow();
  },
  'rm-comp': (t, e) => {
    e.stopPropagation();
    setComps(comps().map((c) => (c.id === t.dataset.k ? { ...c, enabled: false } : c)));
    renderRow();
  },
  'add-comp': (t) => {
    setComps(comps().map((c) => (c.id === t.dataset.k ? { ...c, enabled: true } : c)));
    renderRow();
  },
  // music
  'music-toggle': () => dim.music.control('toggle'),
  'music-next': () => dim.music.control('next'),
  'music-prev': () => dim.music.control('prev'),
  'music-seek': (t, e) => {
    if (!S.music || !S.music.canSeek || !S.music.duration) return;
    const r = t.getBoundingClientRect();
    dim.music.control('seek', Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * S.music.duration);
  },
  // pomodoro
  'pomo-toggle': () => dim.pomo.act('toggle'),
  'pomo-reset': () => dim.pomo.act('reset'),
  'pomo-skip': () => dim.pomo.act('skip'),
  'pomo-edit': () => {
    S.ui.timeEditing = true;
    renderRow();
  },
  // calendar
  'cal-day': (t) => {
    S.ui.calDay = +t.dataset.o;
    renderRow();
  },
  'cal-add': () => {
    S.ui.calAdding = !S.ui.calAdding;
    renderRow();
  },
  'cal-del': (t) => dim.calendar.remove(t.dataset.id),
  'ai-open': (t) => {
    const p = t.dataset.ai;
    if (webMode()) {
      S.chat.web = p;
      dim.settings.patch({ aiWebProvider: p });
      if (S.view === 'chat') renderRow();
      else setView('chat');
      return;
    }
    S.chat.provider = p;
    setView('chat');
    if (S.view === 'chat') renderRow();
  },
  'chat-web': (t) => {
    S.chat.web = t.dataset.p;
    dim.settings.patch({ aiWebProvider: t.dataset.p });
    renderRow();
  },
  'lock-hello': async (t) => {
    t.disabled = true;
    const r = await dim.ailock.unlockHello();
    t.disabled = false;
    if (!(r && r.ok)) {
      S.ui.lockMsg = (r && r.error) || 'No se pudo verificar que eres tú.';
      renderRow();
    }
  },
  'web-reload': () => reloadWebview(S.chat.web),
  'web-pop': () => dim.ai.openWeb(S.chat.web),
  // notes
  'note-add': () => {
    S.ui.noteAdding = !S.ui.noteAdding;
    renderRow();
  },
  'note-toggle': (t) => {
    if (t.dataset.task === '1') dim.notes.toggle(t.dataset.id);
  },
  'note-del': (t, e) => {
    e.stopPropagation();
    dim.notes.remove(t.dataset.id);
  },
  // camera
  'cam-toggle': () => {
    if (S.ui.camOn) {
      stopCam();
      renderRow();
    } else startCam();
  },
  // clipboard
  'clip-copy': async (t) => {
    const ok = await dim.clip.copy(t.dataset.id);
    const ca = t.querySelector('[data-ca]');
    if (ok && ca) {
      const old = ca.textContent;
      ca.textContent = 'Copiado';
      ca.classList.add('ok');
      setTimeout(() => {
        ca.textContent = old;
        ca.classList.remove('ok');
      }, 1200);
    }
  },
  'clip-pause': () => dim.settings.patch({ clipPaused: !S.clip.paused }),
  'clip-clear': () => dim.clip.clear(),
  // shelf
  'shelf-open': (t) => dim.shelf.reveal(t.dataset.id),
  'shelf-clear': () => dim.shelf.clear(),
  // chat
  'chat-provider': (t) => {
    S.chat.provider = t.dataset.p;
    renderRow();
    focusChatInput();
  },
  'chat-clear': () => {
    S.chat.messages = [];
    dim.ai.clearHistory();
    renderRow();
  },
  'pill-open': () => dim.island.setOpen(true),
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = actions[t.dataset.act];
  if (fn) fn(t, e);
});

document.addEventListener('contextmenu', (e) => {
  const ci = e.target.closest('.ci[data-id]');
  if (ci) {
    e.preventDefault();
    dim.clip.remove(ci.dataset.id);
  }
});

$('#pill').addEventListener('click', () => dim.island.setOpen(true));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (S.editing) endEdit();
  else if (document.activeElement && document.activeElement !== document.body && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
  else if (S.open) dim.island.setOpen(false);
});

// While a text field has the keyboard the island stays open and takes the keyboard focus from the system.
function webChatActive() {
  return S.open && S.view === 'chat' && webMode() && !S.lock.locked;
}

// While a text field (or the embedded AI site) has the keyboard the island stays open and takes the keyboard focus
// from the system. It gives it back when nothing needs it, and always when the island closes.
document.addEventListener('focusin', (e) => {
  if (e.target.matches && e.target.matches('input,textarea,canvas,webview')) dim.island.wantFocus(true);
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (webChatActive()) return; // the keyboard is inside the AI site: that is not a reason to let go
    const a = document.activeElement;
    if (!(a && a.matches && a.matches('input,textarea,canvas,webview'))) dim.island.wantFocus(false);
  }, 120);
});

// Files dropped on the island go to the tray.
function hasFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}
document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const d = $('#drop');
  if (d) d.classList.add('over');
});
document.addEventListener('dragleave', () => {
  const d = $('#drop');
  if (d) d.classList.remove('over');
});
document.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (!S.set.shelfEnabled) return;
  const paths = dim.shelf.pathsFromFiles(e.dataTransfer.files);
  if (paths.length) {
    await dim.shelf.addPaths(paths);
    setView('tray');
  }
});
document.addEventListener('dragstart', (e) => {
  const f = e.target.closest && e.target.closest('.file[data-id]');
  if (f) {
    e.preventDefault();
    dim.shelf.startDrag(f.dataset.id);
  }
});

// ---------- Ticks ----------

function tick() {
  const m = S.music;
  if (m && m.session) {
    if (m.playing) S.lastPlayedAt = Date.now();
    const pos = musicPos();
    const f = $('[data-pfill]');
    const c = $('[data-pcur]');
    if (f && m.duration > 0) f.style.width = `${(pos / m.duration) * 100}%`;
    if (c) c.textContent = formatDuration(pos);
  }
  const p = S.pomo;
  if (p) {
    const rem = pomoRemaining();
    const text = formatDuration(Math.ceil(rem));
    const t = $('[data-ptime]');
    if (t) {
      t.textContent = text;
      t.style.fontSize = `${timeFontSize(text)}px`;
    }
    const b = $('[data-pbar]');
    if (b && p.duration > 0) b.style.width = `${((p.duration - rem) / p.duration) * 100}%`;
    const pt = $('[data-pt]');
    if (pt) pt.textContent = text;
  }
  const sig = `${liveKeys().join()}|${S.rot}|${Math.max(1, Math.min(3, S.set.liveMax))}|${S.set.closedStyle === 'always' || (S.set.closedStyle === 'activity' && liveKeys().length > 0)}`;
  if (sig !== lastLiveSig) renderPill();
}

let rotCount = 0;
setInterval(() => {
  tick();
}, 250);
setInterval(() => {
  rotCount++;
  if (rotCount % Math.max(2, S.set.liveRotate) === 0) {
    S.rot++;
    renderPill();
  }
}, 1000);

// ---------- Boot ----------

async function boot() {
  if (!window.dim) await import('./dev-shim.js');
  dim = window.dim;

  const [set, info, music, pomo, notes, clip, cal, shelf, hist, lock] = await Promise.all([
    dim.settings.getAll(),
    dim.island.info(),
    dim.music.get(),
    dim.pomo.get(),
    dim.notes.get(),
    dim.clip.get(),
    dim.calendar.list(),
    dim.shelf.list(),
    dim.ai.history(),
    dim.ailock.state(),
  ]);
  if (lock) S.lock = lock;
  S.set = set;
  if (info) S.info = info;
  S.open = !!(info && info.open);
  S.music = music;
  if (music && music.playing) S.lastPlayedAt = Date.now();
  setTimeout(() => ensureHd(S.music), 0);
  S.pomo = pomo;
  S.notes = notes;
  S.clip = clip;
  S.cal = cal;
  S.shelf = shelf;
  S.chat.messages = (hist || []).map((m) => ({ role: m.role, text: m.text }));
  S.chat.provider = defaultAI();
  S.chat.web = defaultWebAI();

  dim.settings.onChange((changed) => {
    Object.assign(S.set, changed);
    paletteKey = '';
    if (Object.keys(changed).every((k) => LIGHT_KEYS.has(k))) {
      applyStyle(); // already shown while the control moved; nothing else to redraw
      if (S.ui.lightsOpen && !$('#lightpanel').contains(document.activeElement)) renderLightPanel();
      return;
    }
    render();
  });
  dim.island.onInfo((i) => {
    S.info = i;
    render();
  });
  dim.island.onState(({ open }) => setOpenLocal(open));
  dim.island.onWelcome(showWelcome);
  dim.island.onGame((g) => {
    S.game = g;
    renderPill();
    syncPerf();
  });
  dim.island.onCommand((c) => {
    if (c.name === 'open-chat') {
      S.chat.provider = defaultAI();
      S.chat.web = defaultWebAI();
      if (S.view === 'chat') renderRow();
      else setView('chat');
      setTimeout(focusChatInput, 120);
    }
  });
  dim.ailock.onState((l) => {
    const was = S.lock.locked;
    const changed = JSON.stringify(S.lock) !== JSON.stringify(l);
    S.lock = l;
    if (!l.locked) S.ui.lockMsg = '';
    if (S.view === 'chat' && changed) {
      // The chat showed, or hid, the lock screen: the first time it opens, give the input the keyboard.
      if (was && !l.locked && webMode()) {
        dim.island.pin('web', true);
        dim.island.wantFocus(true);
      }
      renderRow();
    }
  });
  dim.ai.onSignedOut(() => {
    resetWebviews();
    if (S.view === 'chat' && webMode()) renderRow();
  });
  dim.music.onState((m) => {
    S.music = m;
    if (m.playing) S.lastPlayedAt = Date.now();
    updatePalette();
    renderRow();
    syncDance();
    ensureHd(m);
  });
  dim.pomo.onState((p) => {
    S.pomo = p;
    renderRow();
  });
  dim.pomo.onSound((cfg) => playPomodoroSound(cfg));
  dim.notes.onChange((n) => {
    S.notes = n;
    renderRow();
  });
  dim.clip.onChange((c) => {
    S.clip = c;
    renderRow();
  });
  dim.clip.onToast(showToast);
  dim.calendar.onChange((c) => {
    S.cal = c;
    renderRow();
  });
  dim.shelf.onChange((l) => {
    S.shelf = l;
    renderRow();
  });
  dim.perf.onSample((p) => {
    S.perf = p;
    const el = $('[data-perf]');
    if (el) el.outerHTML = perfHTML();
    if (liveKeys().includes('perf')) renderPill();
  });

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const upd = () => {
        S.battery = { level: b.level, charging: b.charging };
        renderTabs();
        renderPill();
      };
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
      upd();
    }).catch(() => {});
  }
  dim.system.info().then((i) => {
    S.hasBattery = i && i.hasBattery !== undefined ? i.hasBattery : null;
    if (i && i.game) S.game = i.game;
    renderTabs();
    renderPill();
  });

  const notch = $('#notch');
  startLens(document.getElementById('stage'));
  startAmbient(notch);
  new ResizeObserver(() => {
    syncHalo();
    scheduleRect();
  }).observe(notch);
  new ResizeObserver(scheduleRect).observe($('#pill'));
  $('#pill').addEventListener('transitionend', scheduleRect);
  notch.addEventListener('transitionend', scheduleRect);
  render();
  scheduleRect();
  document.body.dataset.ready = '1';
}

boot();
