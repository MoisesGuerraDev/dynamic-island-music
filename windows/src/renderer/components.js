// HTML of every component of the home row. Same markup and classes as the mockup, filled with real data.
import { S, aiMeta, defaultAI } from './state.js';
import { esc, addDays, dayKey, dayName, monthName } from './util.js';
import { ic, fi, sourceBadge } from './icons.js';
import { formatDuration, relativeAge } from '../shared/time.js';
import { COMPONENT_META } from '../shared/defaults.js';

export function musicPos() {
  const m = S.music;
  if (!m || !m.session) return 0;
  let p = m.position;
  if (m.playing) p += (Date.now() - m.positionAt) / 1000;
  return m.duration > 0 ? Math.min(Math.max(p, 0), m.duration) : Math.max(p, 0);
}

export function pomoRemaining() {
  const p = S.pomo;
  if (!p) return 0;
  return p.running ? Math.max(0, (p.endAt - Date.now()) / 1000) : p.remaining;
}

export function timeFontSize(text) {
  return text.length >= 7 ? 26 : text.length > 5 ? 34 : 44;
}

function player() {
  const m = S.music;
  if (!m) return '<div class="nomusic"><b>Música</b><span>Cargando…</span></div>';
  if (!m.available) {
    return `<div class="nomusic"><b>Música no disponible</b><span>${esc(m.error || 'No se pudo leer la música del sistema.')}</span></div>`;
  }
  if (!m.session) {
    return '<div class="nomusic"><b>Nada sonando</b><span>Pon música en Spotify, Apple Music o el navegador y aparece aquí.</span></div>';
  }
  const art = m.cover ? `<img src="${esc(m.cover)}" alt="">` : `<span class="note">${ic('music')}</span>`;
  const pos = musicPos();
  const pct = m.duration > 0 ? (pos / m.duration) * 100 : 0;
  return `<div class="player${m.playing ? '' : ' paused'}">
    <div class="art"><div class="art-img">${art}</div>${sourceBadge(m.source)}</div>
    <div class="meta">
      <div class="ttl"><strong title="${esc(m.title)}">${esc(m.title || 'Sin título')}</strong><span class="viz"><i></i><i></i><i></i><i></i></span></div>
      <div class="art2">${esc(m.artist || m.album || '')}</div>
      <div class="bar" data-act="music-seek" role="slider" aria-label="Posición"><i data-pfill style="width:${pct}%"></i></div>
      <div class="times"><span data-pcur>${formatDuration(pos)}</span><span>${m.duration > 0 ? formatDuration(m.duration) : '--:--'}</span></div>
      <div class="ctrls">
        <button class="nbtn" data-act="music-prev" aria-label="Anterior">${fi('prev')}</button>
        <button class="nbtn big" data-act="music-toggle" aria-label="${m.playing ? 'Pausar' : 'Reproducir'}">${fi(m.playing ? 'pause' : 'play')}</button>
        <button class="nbtn" data-act="music-next" aria-label="Siguiente">${fi('next')}</button>
      </div>
    </div></div>`;
}

export function aiButton() {
  const p = defaultAI();
  const m = aiMeta(p);
  return `<button class="nbtn aib" data-act="ai-open" data-ai="${p}" aria-label="Abrir ${esc(m.name)}" title="${esc(m.name)} (dentro del chat cambias de IA)" style="--ac:${m.color}">${esc(m.letter)}</button>`;
}

function calendar() {
  const today = new Date();
  const sel = addDays(today, S.ui.calDay);
  const key = dayKey(sel);
  const evs = S.cal.filter((e) => e.date === key).sort((a, b) => (a.time || '24').localeCompare(b.time || '24'));
  let body;
  if (S.ui.calAdding) {
    body = `<div class="cal-list"><input class="inl" id="cal-in" placeholder="15:30 Reunión" aria-label="Nuevo evento: hora y título" autocomplete="off"><span class="chat-f">Intro para guardar · Esc cancela</span></div>`;
  } else if (evs.length) {
    body = `<div class="cal-list">${evs
      .slice(0, 6)
      .map((e) => `<button class="ev" data-act="cal-del" data-id="${esc(e.id)}" title="Clic para quitar"><b>${esc(e.time || '··:··')}</b><span>${esc(e.title)}</span></button>`)
      .join('')}</div>`;
  } else {
    body = '<div class="cal-empty">Sin eventos</div>';
  }
  const days = [-1, 0, 1]
    .map((o) => {
      const d = addDays(today, o);
      return `<button data-act="cal-day" data-o="${o}" class="${o === S.ui.calDay ? 'sel' : ''}"><div>${dayName(d)}<b>${d.getDate()}</b></div></button>`;
    })
    .join('');
  return `<div class="cal"><div class="cal-main"><div class="cal-head"><span>${monthName(sel)}</span></div>${body}<div class="days">${days}</div></div>
    <div class="cal-btns">${aiButton()}<button class="plus" data-act="cal-add" aria-label="Añadir evento">${ic('plus')}</button></div></div>`;
}

export function visibleNotes() {
  const s = S.set;
  const days = s.notesHideDoneAfterDays;
  let items = S.notes.items.filter((n) => !(n.done && days >= 0 && Date.now() - n.created >= days * 86_400_000));
  items = items.slice().sort((a, b) => (s.notesOrder === 'old' ? a.created - b.created : b.created - a.created));
  return items;
}

function notes() {
  const items = visibleNotes();
  const cloud = S.notes.info && S.notes.info.isICloud ? `<span title="Sincronizado con iCloud Drive">${ic('cloud')}</span>` : '';
  const add = S.ui.noteAdding
    ? '<input class="inl" id="note-in" placeholder="Nueva tarea · Ctrl+Intro = nota" aria-label="Nueva nota o tarea" autocomplete="off">'
    : '';
  const list = items.length
    ? items
        .slice(0, 30)
        .map((n) => {
          const age = S.set.notesShowAge ? `<em>${relativeAge(n.created)}</em>` : '';
          const cls = `todo${n.done ? ' done' : ''}${n.isTask ? '' : ' plain'}`;
          const cb = n.isTask ? `<span class="cb">${ic('check')}</span>` : '<span class="cb"></span>';
          return `<div class="${cls}" role="button" tabindex="0" data-act="note-toggle" data-id="${esc(n.id)}" data-task="${n.isTask ? 1 : 0}">${cb}<span class="t">${esc(n.text)}${age}</span><i class="x" data-act="note-del" data-id="${esc(n.id)}" title="Mandar a la Papelera">${ic('x').replace('<svg', '<svg width="12" height="12"')}</i></div>`;
        })
        .join('')
    : '<span class="chat-f">Sin notas todavía. Pulsa + para añadir una.</span>';
  return `<div class="notes"><h4>¿Qué tienes en mente?<span class="hb">${cloud}<button data-act="note-add" aria-label="Añadir nota">${ic('plus')}</button></span></h4>${add}<div class="nlist">${list}</div></div>`;
}

function timer() {
  const p = S.pomo;
  if (!p) return '<div class="timer"></div>';
  const label = p.phase === 'focus' ? `Concentración (${p.sprint}/${p.sprints})` : 'Descanso';
  const text = formatDuration(Math.ceil(pomoRemaining()));
  const face = S.ui.timeEditing
    ? `<input class="tin" id="tin" value="${formatDuration(p.duration)}" aria-label="Tiempo del temporizador" inputmode="numeric">`
    : `<button class="time" data-act="pomo-edit" data-ptime title="Toca para cambiar el tiempo (25, 1:30 o 1:30:00)" style="font-size:${timeFontSize(text)}px">${text}</button>`;
  const prog = p.duration > 0 ? ((p.duration - pomoRemaining()) / p.duration) * 100 : 0;
  return `<div class="timer${p.phase === 'rest' ? ' is-rest' : ''}"><span class="focus${p.phase === 'rest' ? ' rest' : ''}">${ic('clock')}${label}</span>${face}
    <div class="tbar"><i data-pbar style="width:${prog}%"></i></div>
    <div class="tctl"><button class="nbtn" data-act="pomo-reset" aria-label="Reiniciar">${ic('reset')}</button><button class="nbtn" data-act="pomo-toggle" aria-label="${p.running ? 'Pausar' : 'Iniciar'}">${p.running ? fi('pause') : fi('play')}</button><button class="nbtn" data-act="pomo-skip" aria-label="Saltar">${ic('skip')}</button></div></div>`;
}

function camera() {
  if (S.ui.camOn) {
    return `<div class="cam"><video id="camv" class="${S.set.mirrorShape === 'square' ? 'square' : 'circle'}" data-act="cam-toggle" autoplay muted playsinline></video>${S.ui.camError ? `<small>${esc(S.ui.camError)}</small>` : '<span>Espejo</span>'}</div>`;
  }
  return `<div class="cam"><button class="lens" data-act="cam-toggle" aria-label="Abrir el espejo">${ic('cam')}</button>${S.ui.camError ? `<small>${esc(S.ui.camError)}</small>` : '<span>Espejo</span>'}</div>`;
}

function chatMini() {
  const last = S.chat.messages.length ? S.chat.messages[S.chat.messages.length - 1].text : 'Pregúntale lo que quieras a tu IA favorita.';
  const p = S.chat.provider;
  return `<div class="mc"><div class="mch"><b>${ic('spark')}Chat de IA</b><span class="pill">${esc(aiMeta(p).name)}</span></div><div class="mcb">${esc(last)}</div><button class="nbtn pbtn" data-act="open-view" data-v="chat">Escribir…</button></div>`;
}

function clipMini() {
  const items = S.clip.items.slice(0, 3);
  const list = items.length
    ? items.map((c) => `<button class="ct" data-act="clip-copy" data-id="${esc(c.id)}" title="Copiar de nuevo">${esc(c.kind === 'image' ? '🖼 ' + c.text : c.text)}</button>`).join('')
    : '<span class="chat-f">Lo que copies aparecerá aquí.</span>';
  return `<div class="mc"><div class="mch"><b>${ic('clip')}Portapapeles</b></div><div class="mcl">${list}</div></div>`;
}

const FILE_COLORS = { png: '#3b82f6', jpg: '#3b82f6', jpeg: '#3b82f6', gif: '#3b82f6', webp: '#3b82f6', pdf: '#e5484d', xls: '#22a559', xlsx: '#22a559', csv: '#22a559', doc: '#2b6cb0', docx: '#2b6cb0', md: '#8b5cf6', txt: '#6b7280', zip: '#d97706', dir: '#0ea5e9' };
export const fileColor = (ext) => FILE_COLORS[ext] || '#64748b';

function shelfMini() {
  const items = S.shelf.slice(0, 3);
  const chips = items.map((f) => `<span class="ft sm" style="background:${fileColor(f.ext)}">${esc(f.ext.slice(0, 4))}</span>`).join('');
  return `<div class="mc"><div class="mch"><b>${ic('tray')}Bandeja</b></div><div class="mcf">${chips}</div><span class="chat-f">${S.shelf.length ? `${S.shelf.length} archivos` : 'Suelta archivos aquí'}</span><button class="nbtn pbtn add" data-act="open-view" data-v="tray">Abrir</button></div>`;
}

function gameMini() {
  return `<div class="mc"><div class="mch"><b>${ic('game')}Juego</b></div><button class="nbtn pbtn" data-act="open-view" data-v="game">Jugar</button><span class="chat-f">Serpiente${S.set.snakeBest ? ` · Récord ${S.set.snakeBest}` : ''}</span></div>`;
}

export function perfHTML() {
  const s = S.set;
  const p = S.perf;
  const rows = [];
  if (p) {
    if (s.perfShowCPU) rows.push(['CPU', p.cpu, `${p.cpu}%`]);
    if (s.perfShowGPU) {
      if (p.gpu === null) rows.push(['GPU', 0, '—']);
      else rows.push(['GPU', p.gpu, s.perfShowTemp && p.gpuTemp !== null ? `${p.gpuTemp}°` : `${p.gpu}%`]);
    }
    if (s.perfShowRAM) rows.push(['RAM', p.ramPercent, `${p.ramUsedGB.toFixed(1)} GB`]);
  }
  const hz = s.perfShowRefresh && p ? `<span class="pill">${p.hz} Hz</span>` : '';
  const body = !p
    ? '<span class="chat-f">Midiendo…</span>'
    : rows.length
      ? rows.map((r) => `<div class="pf"><span>${r[0]}</span><i><b style="width:${Math.max(0, Math.min(100, r[1]))}%"></b></i><em>${r[2]}</em></div>`).join('')
      : '<span class="chat-f">Nada que mostrar. Actívalo en Ajustes › Rendimiento.</span>';
  return `<div class="mc" data-perf><div class="mch"><b>${ic('bolt')}Rendimiento</b>${hz}</div>${body}</div>`;
}

export function colHTML(id) {
  switch (id) {
    case 'player': return player();
    case 'calendar': return calendar();
    case 'notes': return notes();
    case 'pomodoro': return timer();
    case 'camera': return camera();
    case 'chat': return chatMini();
    case 'clipboard': return clipMini();
    case 'shelf': return shelfMini();
    case 'game': return gameMini();
    case 'performance': return perfHTML();
    default: return `<div class="mc"><b>${esc(COMPONENT_META[id]?.name || id)}</b></div>`;
  }
}
