// Full tabs of the island: agenda, tray, clipboard, chat and the snake game.
import { S, bus, aiMeta, enabledAI, defaultAI, enabledWebAI, defaultWebAI, WEB_AI_META } from './state.js';
import { esc, dayKey, addDays, dayName, monthName } from './util.js';
import { ic, fi } from './icons.js';
import { fileColor, leadSelect, dueText } from './components.js';
import { GRID, KEYS, draw, newGame, speedFor, step, turn } from './snake.js';
import { relativeAge } from '../shared/time.js';

const dim = () => window.dim;

// ---------- Agenda: every task, note and upcoming event ----------
const AG_FILTERS = [['all', 'Todo'], ['tasks', 'Tareas'], ['notes', 'Notas'], ['events', 'Eventos']];

function agendaTasks() {
  return S.notes.items
    .filter((n) => n.isTask)
    .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : (a.due || Infinity) - (b.due || Infinity) || b.created - a.created));
}

function agendaNotes() {
  return S.notes.items.filter((n) => !n.isTask).sort((a, b) => b.created - a.created);
}

/** Events from today on; one with a time that is more than an hour old is over. */
function agendaEvents(now = Date.now()) {
  const today = dayKey(new Date(now));
  return S.cal
    .filter((e) => e.date > today || (e.date === today && (!e.time || new Date(`${e.date}T${e.time}`).getTime() + 3_600_000 > now)))
    .sort((a, b) => (a.date + (a.time || '24')).localeCompare(b.date + (b.time || '24')));
}

function eventWhen(e) {
  if (e.time) return dueText(new Date(`${e.date}T${e.time}`).getTime());
  const d = new Date(`${e.date}T00:00`);
  const today = new Date();
  if (e.date === dayKey(today)) return 'hoy · todo el día';
  if (e.date === dayKey(addDays(today, 1))) return 'mañana · todo el día';
  return `${dayName(d)} ${d.getDate()} ${monthName(d)} · todo el día`;
}

const agTrash = (act, id, title) => `<button class="ag-x" data-act="${act}" data-id="${esc(id)}" aria-label="${title}" title="${title}">${ic('trash')}</button>`;

function agTaskRow(n) {
  const sub = n.due && !n.done ? `<em class="due${n.due < Date.now() ? ' late' : ''}">⏰ ${dueText(n.due)}</em>` : `<em>${relativeAge(n.created)}</em>`;
  return `<div class="ag-r${n.done ? ' done' : ''}"><button class="ag-cb" data-act="note-toggle" data-id="${esc(n.id)}" data-task="1" aria-label="${n.done ? 'Marcar como pendiente' : 'Marcar como hecha'}" title="${n.done ? 'Marcar como pendiente' : 'Marcar como hecha'}">${ic('check')}</button><span class="ag-t"><b>${esc(n.text)}</b>${sub}</span>${agTrash('note-del', n.id, 'Mandar a la Papelera')}</div>`;
}

function agNoteRow(n) {
  return `<div class="ag-r"><span class="ag-dot"></span><span class="ag-t"><b>${esc(n.text)}</b><em>${relativeAge(n.created)}</em></span>${agTrash('note-del', n.id, 'Mandar a la Papelera')}</div>`;
}

function agEventRow(e) {
  const end = S.ui.agendaConfirm === e.id
    ? `<span class="ag-q">¿Borrar el evento?</span><button class="ag-b red" data-act="ag-ev-yes" data-id="${esc(e.id)}">Borrar</button><button class="ag-b" data-act="ag-ev-no">No</button>`
    : agTrash('ag-ev-del', e.id, 'Borrar evento');
  const bell = e.lead != null ? ` · avisa ${e.lead ? `${e.lead} min antes` : 'a la hora'}` : '';
  return `<div class="ag-r"><span class="ag-bar"></span><span class="ag-t"><b class="ev">${esc(e.title)}</b><em>${esc(eventWhen(e))}${bell}</em></span>${end}</div>`;
}

export function agendaHTML() {
  const f = S.ui.agendaFilter;
  const tasks = agendaTasks();
  const notes = agendaNotes();
  const events = agendaEvents();
  const counts = { all: tasks.length + notes.length + events.length, tasks: tasks.length, notes: notes.length, events: events.length };
  const done = tasks.filter((n) => n.done).length;
  const filters = AG_FILTERS.map(([k, t]) => `<button aria-pressed="${f === k}" data-act="ag-filter" data-f="${k}">${t}<i>${counts[k]}</i></button>`).join('');
  let clear = '';
  if (done && (f === 'all' || f === 'tasks')) {
    clear = S.ui.agendaClear
      ? `<span class="ag-q">¿Mandar ${done} a la Papelera?</span><button class="ag-b red" data-act="ag-clear-yes">Sí</button><button class="ag-b" data-act="ag-clear-no">No</button>`
      : `<button class="ag-b" data-act="ag-clear" title="Manda a la Papelera las ${done} tareas hechas">Borrar completadas</button>`;
  }
  const add = S.ui.noteAdding
    ? `<div class="ag-add"><input class="inl" id="note-in" placeholder="Tarea (18:30 Tarea = con aviso) · Ctrl+Intro = nota" aria-label="Nueva nota o tarea" autocomplete="off">${leadSelect('note-lead')}</div>`
    : '';
  const section = (title, n, rows, empty) => `<div class="ag-s">${title} <i>${n}</i></div>${rows.length ? rows.join('') : `<div class="ag-e">${empty}</div>`}`;
  let list = '';
  if (f === 'all' || f === 'tasks') list += section('Tareas', tasks.length, tasks.map(agTaskRow), 'No hay tareas. Pulsa + para crear una.');
  if (f === 'all' || f === 'notes') list += section('Notas', notes.length, notes.map(agNoteRow), 'No hay notas.');
  if (f === 'all' || f === 'events') list += section('Próximos eventos', events.length, events.map(agEventRow), 'Sin eventos. Créalos con el + del calendario.');
  return `<div class="agenda"><div class="clip-h"><b>Agenda</b><div class="pv">${filters}</div>
    <span class="sp">${clear}<button class="nbtn" data-act="ag-add" aria-label="Añadir tarea o nota" title="Añadir tarea o nota">${ic('plus')}</button></span></div>
    ${add}<div class="ag-l">${list}</div></div>`;
}

// ---------- Tray ----------
export function trayHTML() {
  const files = S.shelf.slice(0, 8);
  const grid = files.length
    ? files
        .map(
          (f) => `<button class="file${f.missing ? ' missing' : ''}" draggable="true" data-act="shelf-open" data-id="${esc(f.id)}" title="Clic: mostrar en el Explorador. Arrastra para llevarlo a otra app."><span class="ft" style="background:${fileColor(f.ext)}">${esc(f.ext.slice(0, 4))}</span><span class="fn">${esc(f.name)}</span></button>`,
        )
        .join('')
    : '<div class="empty" style="grid-column:1/-1">Todavía no hay archivos.</div>';
  return `<div class="tray"><div class="drop" id="drop"><i>${ic('tray')}</i><b>Suelta archivos aquí</b><span>Quedan a mano hasta que los uses</span></div>
    <div class="files">${grid}</div>
    <div class="tray-a"><button class="nbtn pbtn" data-act="shelf-clear">${ic('x')}Vaciar</button></div></div>`;
}

// ---------- Clipboard ----------
export function clipHTML() {
  const items = S.clip.items.slice(0, 30);
  const paused = S.clip.paused;
  const list = items.length
    ? items
        .map((c) => {
          const lead = c.kind === 'image' && c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : `<span class="ck">${c.kind === 'link' ? 'Enlace' : c.kind === 'image' ? 'Imagen' : 'Texto'}</span>`;
          return `<button class="ci" data-act="clip-copy" data-id="${esc(c.id)}" title="Clic: copiar de nuevo · Clic derecho: quitar">${lead}<span class="ct">${esc(c.text)}</span><span class="ca" data-ca>${esc(c.app || '')}</span></button>`;
        })
        .join('')
    : `<div class="empty" style="grid-column:1/-1">${paused ? 'El historial está en pausa.' : 'Todavía no hay nada. Copia algo y aparecerá aquí.'}</div>`;
  return `<div class="clip"><div class="clip-h"><b>Portapapeles</b><span class="pill">Ignora contraseñas y claves</span>
    <span class="sp"><span class="pill">${ic('clip')}${S.clip.items.length} elementos</span>
    <button class="nbtn" data-act="clip-pause" aria-label="${paused ? 'Reanudar' : 'Pausar'} el portapapeles">${fi(paused ? 'play' : 'pause')}</button>
    <button class="nbtn" data-act="clip-clear" aria-label="Borrar el historial">${ic('trash')}</button></span></div>
    <div class="clip-l">${list}</div></div>`;
}

// ---------- Chat ----------
export function chatHTML() {
  const en = enabledAI();
  if (!en.includes(S.chat.provider)) S.chat.provider = defaultAI();
  const p = S.chat.provider;
  const meta = aiMeta(p);
  const model = (S.set.aiModels || {})[p] || meta.model || '—';
  const msgs = S.chat.messages
    .map((m) => `<div class="m ${m.role === 'user' ? 'u' : m.err ? 'err' : 'a'}">${esc(m.text)}</div>`)
    .join('');
  const thinking = S.chat.sending ? '<div class="m a dots">Pensando…</div>' : '';
  const hint = !S.chat.messages.length && !S.chat.sending ? `<div class="m a">Hola, soy ${esc(meta.name)} dentro de la isla. Pregúntame lo que quieras.</div>` : '';
  return `<div class="chat" style="--ac:${meta.color}">
    <div class="chat-h"><div class="pv" id="pv">${en.map((k) => `<button aria-pressed="${p === k}" data-act="chat-provider" data-p="${k}">${esc(aiMeta(k).name)}</button>`).join('')}</div>
      <span class="chat-f">Modelo: ${esc(model)} · <button class="linkbtn" data-act="chat-clear">Borrar</button> · <button class="linkbtn" data-act="open-ai-settings">Clave</button></span></div>
    <div class="msgs" id="msgs">${hint}${msgs}${thinking}</div>
    <form class="chatf" id="chatf"><input id="chin" placeholder="Pregúntale algo a ${esc(meta.name)}" aria-label="Mensaje" autocomplete="off"><button type="submit">Enviar</button></form>
    <div class="chat-f">${p === 'ollama' ? 'Tu mensaje se queda en tu PC: Ollama corre en local.' : `Tu cuenta, tu clave: el mensaje va directo de tu PC a ${esc(meta.name)}.`}</div></div>`;
}

export function bindChat() {
  const box = document.getElementById('msgs');
  if (box) box.scrollTop = box.scrollHeight;
  const form = document.getElementById('chatf');
  if (!form) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('chin');
    const v = input.value.trim();
    if (v) sendChat(v);
  };
}

export async function sendChat(text) {
  if (S.chat.sending) return;
  const p = S.chat.provider;
  S.chat.messages.push({ role: 'user', text });
  S.chat.sending = true;
  bus.render();
  focusChatInput();
  const history = S.chat.messages.filter((m) => !m.err).slice(-20).map((m) => ({ role: m.role, text: m.text }));
  let res;
  try {
    res = await dim().ai.send(p, history);
  } catch (err) {
    res = { ok: false, error: String((err && err.message) || err) };
  }
  S.chat.sending = false;
  if (res && res.ok) S.chat.messages.push({ role: 'assistant', text: res.text });
  else S.chat.messages.push({ role: 'assistant', text: (res && res.error) || 'No pude responder.', err: true });
  dim().ai.saveHistory(S.chat.messages.filter((m) => !m.err).map((m) => ({ role: m.role, text: m.text })));
  bus.render();
  focusChatInput();
}

export function focusChatInput() {
  const i = document.getElementById('chin');
  if (i) i.focus();
}

// ---------- Snake ----------
let timer = null;
let game = null;

export function gameHTML() {
  return `<div class="game"><div class="game-s"><b>Serpiente</b><span id="gs">Puntos: 0</span><button class="nbtn pbtn" id="gbtn">Comenzar</button><small>Flechas o WASD.${S.set.snakeBest ? ` Récord: ${S.set.snakeBest}` : ''}</small></div>
    <canvas id="gc" width="${GRID.w * GRID.cell}" height="${GRID.h * GRID.cell}" tabindex="0" aria-label="Juego de la serpiente" style="width:min(${GRID.w * GRID.cell}px,100%);height:auto"></canvas></div>`;
}

export function stopGame() {
  clearTimeout(timer);
  timer = null;
}

export function bindGame() {
  stopGame();
  const c = document.getElementById('gc');
  if (!c) return;
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--c1').trim() || '#ff2a3a';
  const label = document.getElementById('gs');
  const btn = document.getElementById('gbtn');
  game = newGame();
  draw(c, game, color());

  const tick = () => {
    step(game);
    if (game.over) {
      stopGame();
      btn.textContent = 'Otra vez';
      label.textContent = `Fin. Puntos: ${game.score}`;
      if (game.score > S.set.snakeBest) {
        S.set.snakeBest = game.score;
        dim().settings.patch({ snakeBest: game.score });
      }
      return;
    }
    label.textContent = `Puntos: ${game.score}`;
    draw(c, game, color());
    timer = setTimeout(tick, speedFor(S.set.snakeSpeed, game.score, S.set.snakeProgressive));
  };
  const go = () => {
    stopGame();
    game = newGame();
    label.textContent = 'Puntos: 0';
    draw(c, game, color());
    dim().island.wantFocus(true);
    c.focus();
    timer = setTimeout(tick, speedFor(S.set.snakeSpeed, 0, S.set.snakeProgressive));
  };
  btn.onclick = go;
  c.onkeydown = (e) => {
    const d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    turn(game, d);
  };
}

// ---------- Chat with your own account (official site inside the island) ----------

const webviews = {};

export function webBarHTML() {
  const en = enabledWebAI();
  if (!en.includes(S.chat.web)) S.chat.web = defaultWebAI();
  const p = S.chat.web;
  return `<div class="pv">${en.map((k) => `<button aria-pressed="${p === k}" data-act="chat-web" data-p="${k}">${esc(WEB_AI_META[k].name)}</button>`).join('')}</div>
    <span class="chat-f"><button class="linkbtn" data-act="web-reload">Recargar</button> · <button class="linkbtn" data-act="web-pop">Abrir en ventana</button></span>`;
}

/** One <webview> per site, created the first time and never moved, so a redraw never reloads the page. */
export function showWebview(p) {
  const host = document.getElementById('webviews');
  for (const k of Object.keys(webviews)) webviews[k].style.display = k === p ? '' : 'none';
  if (!webviews[p]) {
    const w = document.createElement('webview');
    w.className = 'aiw';
    w.setAttribute('src', WEB_AI_META[p].url);
    w.setAttribute('partition', 'persist:ai'); // one saved session for all the AI sites
    w.setAttribute('allowpopups', '');
    w.addEventListener('dom-ready', () => {
      if (w.style.display !== 'none') focusGuest(w);
    });
    host.appendChild(w);
    webviews[p] = w;
  }
}

function focusGuest(w) {
  try {
    w.focus();
  } catch {
    /* not attached yet: dom-ready tries again */
  }
}

/** Gives the keyboard to the embedded site, so typing an e-mail or a code works. */
export function focusWebview(p) {
  const w = webviews[p];
  if (w) setTimeout(() => focusGuest(w), 150);
}

/** After "Cerrar sesión en todas las IA": throw the pages away so they load signed out. */
export function resetWebviews() {
  for (const k of Object.keys(webviews)) {
    webviews[k].remove();
    delete webviews[k];
  }
}

export function reloadWebview(p) {
  const w = webviews[p];
  if (w && w.reload) w.reload();
}

// ---------- Lock in front of the AI chat ----------

export function lockHTML() {
  const L = S.lock;
  let action = '';
  if (L.mode === 'hello') {
    action = `<button class="nbtn pbtn" data-act="lock-hello">${ic('shield')}Usar Windows Hello</button>`;
  } else if (L.needsPin) {
    action = '<span class="chat-f">Falta crear un PIN para este bloqueo.</span><button class="nbtn pbtn" data-act="open-ai-settings">Crear PIN en Ajustes</button>';
  } else {
    action = `<form class="chatf lockf" id="lockf"><input id="lockpin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" aria-label="PIN" autocomplete="off"><button type="submit">Desbloquear</button></form>`;
  }
  const wait = L.retryIn > 0 ? `Demasiados intentos. Espera ${L.retryIn} s.` : S.ui.lockMsg;
  return `<div class="lockbox"><span class="lk-ico">${ic('shield')}</span><b>Chat de IA bloqueado</b><span class="chat-f">Confirma que eres tú para abrirlo.</span>${action}<span class="chat-f lk-msg" id="lockmsg" role="status">${esc(wait)}</span></div>`;
}

export function bindLock() {
  const form = document.getElementById('lockf');
  if (!form) return;
  const input = document.getElementById('lockpin');
  input.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const r = await dim().ailock.unlockPin(input.value);
    input.value = '';
    if (r && r.ok) {
      S.ui.lockMsg = '';
      return; // the state event unlocks the chat
    }
    if (r && r.retryIn) S.ui.lockMsg = `Demasiados intentos. Espera ${r.retryIn} s.`;
    else if (r && typeof r.attemptsLeft === 'number') S.ui.lockMsg = `PIN incorrecto. Te quedan ${r.attemptsLeft} intentos.`;
    else S.ui.lockMsg = (r && r.error) || 'No se pudo desbloquear.';
    bus.render();
  };
}
