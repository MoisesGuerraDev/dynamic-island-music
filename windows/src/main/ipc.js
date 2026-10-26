import { app, dialog, ipcMain, shell, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { AI_META } from '../shared/defaults.js';

const WEB_AI = {
  claude: { url: 'https://claude.ai/new', partition: 'persist:ai' },
  openai: { url: 'https://chatgpt.com/', partition: 'persist:ai' },
  gemini: { url: 'https://gemini.google.com/app', partition: 'persist:ai' },
  deepseek: { url: 'https://chat.deepseek.com/', partition: 'persist:ai' },
};

/** Wires every call a page can make. A call from anything that is not one of our own windows is ignored. */
export function registerIpc(ctx) {
  const { store, islands, media, pomodoro, notes, clip, ai, perf, system, calendar, shelf, shortcuts, secrets, aiSession, aiLock } = ctx;

  const trusted = (sender) => !!islands.find(sender) || (islands.settingsWin && !islands.settingsWin.isDestroyed() && islands.settingsWin.webContents === sender);
  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event.sender)) return null;
      return fn(event, ...args);
    });
  const listen = (channel, fn) =>
    ipcMain.on(channel, (event, ...args) => {
      if (trusted(event.sender)) fn(event, ...args);
    });
  const parentFor = (event) => (islands.settingsWin && !islands.settingsWin.isDestroyed() && islands.settingsWin.webContents === event.sender ? islands.settingsWin : undefined);

  // --- Settings ---
  handle('settings:getAll', () => store.all());
  handle('settings:patch', (_e, obj) => store.patch(obj));
  handle('settings:reset', () => store.reset());

  // --- Island ---
  handle('island:info', (e) => {
    const isl = islands.find(e.sender);
    return isl ? islands.infoFor(isl) : null;
  });
  listen('island:setOpen', (e, open) => {
    const isl = islands.find(e.sender);
    if (isl) islands.setOpen(isl, !!open);
  });
  listen('island:rect', (e, r) => {
    const isl = islands.find(e.sender);
    if (!isl || !r) return;
    const n = (v) => (Number.isFinite(v) ? v : 0);
    isl.rect = { x: n(r.x), y: n(r.y), w: n(r.w), h: n(r.h) };
  });
  listen('island:pin', (e, reason, on) => {
    const isl = islands.find(e.sender);
    if (isl) islands.pin(isl, String(reason).slice(0, 20), !!on);
  });
  listen('island:focus', (e, on) => {
    const isl = islands.find(e.sender);
    if (isl) islands.wantFocus(isl, !!on);
  });
  listen('island:peek', (e, ms) => {
    const isl = islands.find(e.sender);
    if (isl) islands.peek(Math.max(1000, Math.min(20_000, ms)), isl);
  });
  listen('app:openSettings', (_e, tab) => islands.openSettings(String(tab || '')));

  // --- Music ---
  handle('music:get', () => media.getState());
  handle('music:control', (_e, cmd, arg) => media.control(String(cmd), arg));

  // --- Pomodoro ---
  handle('pomo:get', () => pomodoro.snapshot());
  handle('pomo:act', (_e, action, arg) => {
    switch (action) {
      case 'toggle': return pomodoro.toggle();
      case 'start': return pomodoro.start();
      case 'pause': return pomodoro.pause();
      case 'reset': return pomodoro.reset();
      case 'skip': return pomodoro.skip();
      case 'setDuration': return pomodoro.setDuration(arg);
      default: return null;
    }
  });
  listen('pomo:preview', () => ctx.playPomodoroSound(true));

  // --- Notes ---
  const notesPayload = () => ({ items: notes.list(), info: notes.info() });
  handle('notes:get', notesPayload);
  handle('notes:add', (_e, text, task) => notes.add(text, task !== false));
  handle('notes:toggle', (_e, id) => notes.toggle(id));
  handle('notes:remove', (_e, id) => notes.remove(id));
  handle('notes:removeAll', async (e) => {
    const r = await dialog.showMessageBox(parentFor(e) ?? undefined, {
      type: 'warning',
      buttons: ['Cancelar', 'Mandar a la Papelera'],
      defaultId: 0,
      cancelId: 0,
      title: 'Borrar todas las notas',
      message: '¿Mandar todas las notas de la carpeta a la Papelera?',
      detail: notes.info().folder,
    });
    if (r.response === 1) await notes.removeAll();
    return r.response === 1;
  });
  handle('notes:chooseFolder', async (e) => {
    const guess = notes.info().iCloudGuess;
    const r = await dialog.showOpenDialog(parentFor(e) ?? undefined, {
      title: 'Elige la carpeta de tus notas',
      message: 'Elige una carpeta dentro de iCloud Drive (o crea una nueva). Tus notas se guardan ahí como archivos .md.',
      buttonLabel: 'Usar esta carpeta',
      defaultPath: guess || notes.folder(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return false;
    store.set('notesFolder', r.filePaths[0]);
    return true;
  });
  handle('notes:useLocal', () => store.set('notesFolder', ''));
  handle('notes:useICloud', () => {
    const g = notes.info().iCloudGuess;
    if (!g) return false;
    store.set('notesFolder', path.join(g, 'Isla Notas'));
    return true;
  });
  handle('notes:reveal', () => shell.openPath(notes.folder()));

  // --- Clipboard ---
  const clipPayload = () => ({ items: clip.list().map(({ id, kind, text, thumb, date, app: a }) => ({ id, kind, text, thumb, date, app: a })), paused: store.get('clipPaused') });
  handle('clip:get', clipPayload);
  handle('clip:copy', (_e, id) => clip.copy(String(id)));
  handle('clip:remove', (_e, id) => clip.remove(String(id)));
  handle('clip:clear', () => clip.clear());

  // --- AI ---
  handle('ai:send', (_e, provider, messages) => {
    const m = media.getState();
    const nowPlaying = m.session && m.title ? `${m.title}${m.artist ? ' de ' + m.artist : ''}` : '';
    return ai.send(String(provider), messages, { nowPlaying });
  });
  handle('ai:hasKey', (_e, provider) => ai.hasKey(String(provider)));
  handle('ai:setKey', (_e, provider, key) => {
    if (!AI_META[provider]) return { ok: false, error: 'Esa IA no existe.' };
    try {
      ai.setKey(String(provider), String(key));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  handle('ai:clearKey', (_e, provider) => ai.clearKey(String(provider)));
  handle('ai:history', () => ai.history());
  listen('ai:saveHistory', (_e, messages) => ai.saveHistory(messages));
  handle('ai:clearHistory', () => ai.clearHistory());
  handle('ai:signOutAll', async (e) => {
    const r = await dialog.showMessageBox(parentFor(e) ?? undefined, {
      type: 'warning',
      buttons: ['Cancelar', 'Cerrar sesión'],
      defaultId: 0,
      cancelId: 0,
      title: 'Cerrar sesión en todas las IA',
      message: '¿Cerrar la sesión de Claude, ChatGPT, Gemini y DeepSeek?',
      detail: 'Tendrás que volver a iniciar sesión en cada una.',
    });
    if (r.response !== 1) return false;
    await aiSession.signOutAll();
    islands.send('ai:signedOut', true);
    return true;
  });
  handle('ailock:state', () => aiLock.state());
  handle('ailock:refresh', () => aiLock.refresh());
  handle('ailock:unlockHello', () => aiLock.unlockHello());
  handle('ailock:unlockPin', (_e, pin) => aiLock.unlockPin(pin));
  handle('ailock:setPin', (_e, pin) => {
    if (aiLock.vault.isSet()) return { ok: false, error: 'Ya hay un PIN: usa Cambiar PIN.' };
    const r = aiLock.vault.set(String(pin ?? ''));
    aiLock.emit('state', aiLock.state());
    return r;
  });
  handle('ailock:changePin', (_e, oldPin, newPin) => {
    const r = aiLock.vault.change(String(oldPin ?? ''), String(newPin ?? ''));
    aiLock.emit('state', aiLock.state());
    return r;
  });
  handle('ailock:removePin', (_e, pin) => {
    const r = aiLock.vault.remove(String(pin ?? ''));
    if (r.ok) aiLock.unlocked = false;
    aiLock.emit('state', aiLock.state());
    return r;
  });
  handle('ai:encryptionAvailable', () => secrets.available());
  listen('ai:openWeb', (_e, provider) => {
    const w = WEB_AI[provider];
    if (w) islands.openWeb(w.url, w.partition);
  });

  // --- Performance ---
  const subs = new Set();
  listen('perf:sub', (e, on) => {
    const id = e.sender.id;
    if (on && !subs.has(id)) {
      subs.add(id);
      perf.acquire();
      e.sender.once('destroyed', () => {
        if (subs.delete(id)) perf.release();
      });
    } else if (!on && subs.delete(id)) {
      perf.release();
    }
  });
  handle('perf:get', () => perf.last);

  // --- System ---
  handle('system:info', async () => {
    await system.refresh();
    return { ...system.get(), game: islands.game };
  });

  // --- Calendar ---
  handle('cal:list', () => calendar.list());
  handle('cal:add', (_e, ev) => calendar.add(ev || {}));
  handle('cal:remove', (_e, id) => calendar.remove(String(id)));

  // --- Shelf ---
  handle('shelf:list', () => shelf.list());
  handle('shelf:add', (_e, paths) => shelf.add(paths));
  handle('shelf:remove', (_e, id) => shelf.remove(String(id)));
  handle('shelf:clear', () => shelf.clear());
  handle('shelf:reveal', (_e, id) => {
    const p = shelf.pathOf(String(id));
    if (p) shell.showItemInFolder(p);
  });
  ipcMain.on('shelf:drag', async (event, id) => {
    if (!trusted(event.sender)) return;
    const p = shelf.pathOf(String(id));
    if (!p || !fs.existsSync(p)) return;
    let icon = nativeImage.createEmpty();
    try {
      icon = await app.getFileIcon(p, { size: 'normal' });
    } catch {
      /* default icon */
    }
    event.sender.startDrag({ file: p, icon });
    if (store.get('shelfRemoveOnDrag')) setTimeout(() => shelf.remove(String(id)), 1500);
  });

  // --- App ---
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: app.getPath('userData'),
  }));
  listen('app:openSystemSettings', (_e, which) => {
    const pages = { camera: 'ms-settings:privacy-webcam', sound: 'ms-settings:sound' };
    if (pages[which]) shell.openExternal(pages[which]);
  });
  listen('app:openExternal', (_e, url) => {
    if (/^https:\/\/[^\s]+$/i.test(String(url))) shell.openExternal(String(url));
  });
  handle('app:pickFile', async (e, kind) => {
    const filters = kind === 'sound' ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }] : [];
    const r = await dialog.showOpenDialog(parentFor(e) ?? undefined, { properties: ['openFile'], filters });
    return r.canceled ? '' : r.filePaths[0] || '';
  });
  handle('app:shortcutStatus', () => shortcuts.status);
  listen('app:quit', () => app.quit());
  handle('app:openUserData', () => shell.openPath(app.getPath('userData')));

  handle('app:exportSettings', async (e) => {
    const r = await dialog.showSaveDialog(parentFor(e) ?? undefined, {
      title: 'Guardar copia de seguridad de los ajustes',
      defaultPath: 'dynamic-island-music-ajustes.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(store.all(), null, 2), 'utf8'); // never includes API keys
    return true;
  });
  handle('app:importSettings', async (e) => {
    const r = await dialog.showOpenDialog(parentFor(e) ?? undefined, { title: 'Importar ajustes', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    try {
      const obj = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      store.patch(obj);
      return true;
    } catch {
      return false;
    }
  });
  handle('app:wipeData', async (e) => {
    const r = await dialog.showMessageBox(parentFor(e) ?? undefined, {
      type: 'warning',
      buttons: ['Cancelar', 'Borrar todo'],
      defaultId: 0,
      cancelId: 0,
      title: 'Borrar todos los datos',
      message: '¿Borrar los ajustes, el historial del portapapeles y del chat, la bandeja, los eventos y las claves de API?',
      detail: 'Tus notas (archivos .md) no se tocan.',
    });
    if (r.response !== 1) return false;
    store.reset();
    clip.clear();
    ai.clearHistory();
    shelf.clear();
    for (const ev of [...calendar.list()]) calendar.remove(ev.id);
    for (const p of Object.keys(AI_META)) ai.clearKey(p);
    return true;
  });
}
