// Full tabs of the island: tray, clipboard, chat and the snake game.
import { S, bus, aiMeta, enabledAI, defaultAI, enabledWebAI, defaultWebAI, WEB_AI_META } from './state.js';
import { esc } from './util.js';
import { ic, fi } from './icons.js';
import { fileColor } from './components.js';
import { GRID, KEYS, draw, newGame, speedFor, step, turn } from './snake.js';

const dim = () => window.dim;

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
    w.setAttribute('partition', `persist:ai-${p}`);
    w.setAttribute('allowpopups', '');
    host.appendChild(w);
    webviews[p] = w;
  }
}

export function reloadWebview(p) {
  const w = webviews[p];
  if (w && w.reload) w.reload();
}
