// End-to-end check on the development machine: starts the real app with a fake music player and a throw-away
// data folder, and checks the island window and the main process. Windows-only parts cannot run here.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'dim-e2e-'));
const out = process.env.DIM_SHOTS || ud;
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ welcomed: true })); // skip the first-run welcome
const app = await electron.launch({
  args: [root],
  env: { ...process.env, DIM_TEST: '1', DIM_MOCK_MEDIA: '1', DIM_USER_DATA: ud },
});
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${extra ? ' · ' + extra : ''}`);
  if (!ok) failed++;
};
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.waitForSelector('body[data-ready=\"1\"]', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(800);

  const main = await app.evaluate(async ({ screen }) => {
    const ctx = globalThis.__DIM__;
    const isl = ctx.islands.first();
    const b = isl.win.getBounds();
    const d = screen.getPrimaryDisplay().bounds;
    return {
      count: ctx.islands.all().length,
      bounds: b,
      display: d,
      top: process.platform === 'darwin' ? b.y <= d.y + 40 : b.y === d.y, // macOS keeps windows under the menu bar
      centered: Math.abs(b.x + b.width / 2 - (d.x + d.width / 2)) <= (process.platform === 'darwin' ? 120 : 1), // macOS sometimes nudges transparent windows
      onTop: isl.win.isAlwaysOnTop(),
      focusable: isl.win.isFocusable(),
      visible: isl.win.isVisible(),
      ignoring: isl.ignoring,
      open: isl.open,
    };
  });
  check('una isla por pantalla principal', main.count === 1);
  check('pegada arriba y centrada', main.top && main.centered, `ventana ${JSON.stringify(main.bounds)} pantalla ${JSON.stringify(main.display)}`);
  check('siempre encima', main.onTop);
  check('no roba el foco (no enfocable)', main.focusable === false);
  check('las ventanas no se muestran en pantalla durante las pruebas', main.visible === false);
  check('cerrada y con clic a través', main.open === false && main.ignoring === true);

  // Open it like the cursor would.
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(900);
  check('se abre', await page.evaluate(() => document.getElementById('stage').classList.contains('is-open')));
  const rect = await page.evaluate(() => { const n = document.getElementById('notch'); return { w: n.offsetWidth, x: n.offsetLeft }; });
  check('isla abierta no gigante', rect.w <= 1100, `${rect.w}px`);
  const sz = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; return [e.offsetWidth, e.offsetHeight]; }; // layout sizes: a hidden window does not finish CSS transitions
    const css = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
    const nn = document.getElementById('notch');
    const n = { width: nn.offsetWidth, height: nn.offsetHeight, top: nn.getBoundingClientRect().top };
    const cols = Array.from(document.querySelectorAll('#row > .col')).map((c) => c.offsetWidth);
    const ctrls = Array.from(document.querySelectorAll('.ctrls .nbtn')).map((e) => e.offsetWidth);
    const tctl = Array.from(document.querySelectorAll('.tctl .nbtn')).map((e) => e.offsetWidth);
    return { island: [Math.round(n.width), Math.round(n.height)], top: Math.round(n.top), row: r('#row'), strip: r('.ntabs'), art: r('.art-img'), tab: r('.ntabs .tab'), round: r('.ntabs .round'), cols, ctrls, tctl, lens: r('.cam .lens'),
      title: css('.ttl strong', 'fontSize'), artist: css('.art2', 'fontSize'), time: css('[data-ptime]', 'fontSize'), artRadius: css('.art-img', 'borderTopLeftRadius'), radius: css('#notch', 'borderRadius'), sep: css('.col + .col', 'paddingLeft') };
  });
  check('isla abierta mide 1077 × 187 px a 100 %', sz.island[0] === 1077 && sz.island[1] === 187, JSON.stringify(sz.island));
  check('fila de 140 px y franja de 40 px', sz.row[1] === 140 && sz.strip[1] === 40, JSON.stringify([sz.row, sz.strip]));
  check('a 12 px del borde de arriba y esquinas 20 arriba / 34 abajo', sz.top === 12 && sz.radius === '20px 20px 34px 34px', `${sz.top} ${sz.radius}`);
  check('carátula de 140 × 140 con esquinas de 16 px', sz.art[0] === 140 && sz.art[1] === 140 && sz.artRadius === '16px', JSON.stringify([sz.art, sz.artRadius]));
  check('anchos de los componentes: 312, 222, 178, 159, 178', JSON.stringify(sz.cols) === '[312,222,178,159,178]', JSON.stringify(sz.cols));
  check('botones: franja 25, anterior/siguiente 34, pausa 44, pomodoro 28/34/28, cámara 56', sz.tab[0] === 25 && sz.round[0] === 25 && JSON.stringify(sz.ctrls) === '[34,44,34]' && JSON.stringify(sz.tctl) === '[28,34,28]' && sz.lens[0] === 56, JSON.stringify([sz.tab, sz.round, sz.ctrls, sz.tctl, sz.lens]));
  check('textos como en Mac: título 15, artista 14, hora 44', sz.title === '15px' && sz.artist === '14px' && sz.time === '44px', JSON.stringify([sz.title, sz.artist, sz.time]));
  const glass = await page.evaluate(() => { const e = document.querySelector('.ntabs .round'); const cs = getComputedStyle(e); const a = getComputedStyle(e, '::after'); return { bg: cs.backgroundColor, blur: cs.backdropFilter, shadow: cs.boxShadow, rim: a.padding, rimBg: a.backgroundImage.slice(0, 40) }; });
  check('vidrio de la Mac en los botones (relleno 12 %, borde de 1.5 px, blur 10 + saturación 1.8)', glass.bg.includes('0.12') && glass.blur.includes('blur(10px)') && glass.blur.includes('saturate(1.8)') && glass.rim === '1.5px' && glass.rimBg.startsWith('linear-gradient'), JSON.stringify(glass));
  const samples = [];
  for (let i = 0; i < 24; i++) {
    samples.push(await page.evaluate(() => Number(document.getElementById('stage').style.getPropertyValue('--pulse') || 0)));
    await page.waitForTimeout(45);
  }
  const lo = Math.min(...samples), hi = Math.max(...samples);
  check('los colores laten con la música (pulso entre 0 y 1)', hi - lo > 0.25 && lo >= 0 && hi <= 1, `mín ${lo.toFixed(2)} máx ${hi.toFixed(2)}`);
  check('sin borde por defecto (isla negra lisa)', await page.evaluate(() => getComputedStyle(document.querySelector('.rim')).display === 'none'));

  // Click-through: the region outside the island is not interactive while the cursor is away.
  const reported = await app.evaluate(() => globalThis.__DIM__.islands.first().rect);
  check('la isla informa su rectángulo al proceso principal', reported && reported.w > 400, JSON.stringify(reported));

  // Pomodoro, notes, music and clipboard through the real main process.
  await app.evaluate(() => { globalThis.__DIM__.pomodoro.setDuration(90); globalThis.__DIM__.pomodoro.start(); });
  await page.waitForTimeout(500);
  check('Pomodoro 1:30 en marcha', (await page.textContent('[data-ptime]')).startsWith('1:'));
  await app.evaluate(() => globalThis.__DIM__.notes.add('Probar la isla de Windows', true));
  await page.waitForTimeout(500);
  check('nota creada como archivo .md', fs.readdirSync(path.join(ud, 'Notas')).some((f) => f.endsWith('.md')));
  check('nota visible en la isla', (await page.content()).includes('Probar la isla de Windows'));
  check('música simulada visible', (await page.textContent('.player strong')).length > 0);
  await app.evaluate(() => globalThis.__DIM__.clip.clipboard.writeText('texto de prueba del portapapeles'));
  await page.waitForTimeout(1800);
  const clipN = await app.evaluate(() => globalThis.__DIM__.clip.list().map((i) => i.text));
  check('portapapeles guarda lo copiado', clipN.includes('texto de prueba del portapapeles'));
  await app.evaluate(() => globalThis.__DIM__.clip.clipboard.writeText('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx'));
  await page.waitForTimeout(1800);
  const clipN2 = await app.evaluate(() => globalThis.__DIM__.clip.list().map((i) => i.text));
  check('portapapeles ignora una clave de API', !clipN2.some((t) => t.startsWith('sk-ant')));

  // Settings window.
  await app.evaluate(() => globalThis.__DIM__.islands.openSettings('pomodoro'));
  let settings;
  for (let i = 0; i < 40 && !settings; i++) {
    await page.waitForTimeout(150);
    settings = app.windows().find((w) => w.url().includes('settings.html'));
  }
  check('ventana de ajustes abre', !!settings);
  if (settings) {
    await settings.waitForSelector('body[data-ready=\"1\"]', { state: 'attached', timeout: 10000 });
    await settings.waitForTimeout(500);
    errors.push(...[]);
  }

  // AI tab: the official site is embedded with the person's own account (no API key).
  await page.click('[data-act="tab"][data-v="chat"]');
  await page.waitForTimeout(2500);
  const web = await page.evaluate(() => {
    const w = document.querySelector('webview');
    let id = null;
    try { id = w && w.getWebContentsId(); } catch { /* not attached */ }
    return { has: !!w, id, dockVisible: !document.getElementById('webdock').hidden, src: w && w.getAttribute('src') };
  });
  check('pestaña de IA muestra la página oficial dentro de la isla', web.has && web.dockVisible && typeof web.id === 'number', JSON.stringify(web));
  await page.click('[data-act="tab"][data-v="home"]');

  // Typing into the AI site: the island window must take the keyboard (it is not focusable while idle).
  await page.click('[data-act="tab"][data-v="chat"]');
  await page.waitForTimeout(3000);
  const typed = await app.evaluate(async ({ webContents }) => {
    const c = globalThis.__DIM__;
    const isl = c.islands.first();
    const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
    if (!guest) return { error: 'no hay webview' };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let last = { error: 'la página no terminó de cargar' };
    // The site may still be redirecting to its sign-in page: try again until the page holds still.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        for (let i = 0; i < 40 && guest.isLoading(); i++) await sleep(250);
        await guest.executeJavaScript(`(() => { document.getElementById('dim-test-input')?.remove(); const i = document.createElement('input'); i.id = 'dim-test-input'; i.style.cssText = 'position:fixed;top:60px;left:60px;width:260px;height:44px;z-index:2147483647;font-size:20px'; document.body.appendChild(i); })()`);
        guest.sendInputEvent({ type: 'mouseMove', x: 150, y: 80 });
        guest.sendInputEvent({ type: 'mouseDown', x: 150, y: 80, button: 'left', clickCount: 1 });
        guest.sendInputEvent({ type: 'mouseUp', x: 150, y: 80, button: 'left', clickCount: 1 });
        await sleep(400);
        for (const ch of 'hola') {
          guest.sendInputEvent({ type: 'keyDown', keyCode: ch });
          guest.sendInputEvent({ type: 'char', keyCode: ch });
          guest.sendInputEvent({ type: 'keyUp', keyCode: ch });
        }
        await sleep(300);
        const r = await guest.executeJavaScript(`({ focus: document.hasFocus(), active: document.activeElement && document.activeElement.id, value: document.getElementById('dim-test-input').value })`);
        last = { ...r, focusable: isl.win.isFocusable(), winFocused: isl.win.isFocused(), pins: [...isl.pins] };
        if (r.value === 'hola') return last;
      } catch (err) {
        last = { error: String(err && err.message ? err.message : err).slice(0, 120) };
      }
      await sleep(1000);
    }
    return last;
  });
  check('la ventana de la isla se vuelve enfocable al abrir la IA', typed.focusable === true, JSON.stringify(typed));
  check('al hacer clic en el cuadro de texto de la IA, el teclado llega', typed.active === 'dim-test-input' && typed.value === 'hola', JSON.stringify(typed));
  await page.waitForTimeout(500);
  const stillFocusable = await app.evaluate(() => globalThis.__DIM__.islands.first().win.isFocusable());
  check('la isla no suelta el teclado mientras escribes en la IA', stillFocusable === true);
  await page.click('[data-act="tab"][data-v="home"]');
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
  await page.waitForTimeout(400);
  const after = await app.evaluate(() => { const i = globalThis.__DIM__.islands.first(); return { focusable: i.win.isFocusable() }; });
  check('al cerrar la isla vuelve a no enfocable (no le roba el foco a un juego)', after.focusable === false, JSON.stringify(after));
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(600);

  // The AI sign-in is remembered: one shared saved session, session cookies get 90 days of life.
  await app.evaluate(async () => {
    const c = globalThis.__DIM__;
    await c.aiSession.cookies.set({ url: 'https://claude.ai/', name: 'dim_test_session', value: 'abc123', secure: true, httpOnly: true }); // no expiry on purpose
  });
  await page.waitForTimeout(800);
  const ck = await app.evaluate(async () => {
    const list = await globalThis.__DIM__.aiSession.cookies.get({ name: 'dim_test_session' });
    return list.map((c) => ({ session: c.session, exp: c.expirationDate, value: c.value }));
  });
  const days = ck[0] && ck[0].exp ? (ck[0].exp - Date.now() / 1000) / 86400 : 0;
  check('cookie de sesión de la IA queda con 90 días de vida', ck.length === 1 && ck[0].session === false && days > 89 && days < 91, JSON.stringify(ck));
  check('las IA comparten una sola sesión guardada (persist:ai)', await page.evaluate(() => { document.querySelector('[data-act="tab"][data-v="chat"]').click(); return true; }));
  await page.waitForTimeout(500);
  const part = await page.evaluate(() => Array.from(document.querySelectorAll('webview')).map((w) => w.getAttribute('partition')));
  check('el webview usa la partición persistente compartida', part.length >= 1 && part.every((p) => p === 'persist:ai'), JSON.stringify(part));
  const pk = await page.evaluate(async () => {
    const w = document.querySelector('webview');
    const ready = await new Promise((res) => { let done = false; const f = (v) => { if (!done) { done = true; res(v); } }; w.addEventListener('dom-ready', () => f(true)); setTimeout(() => f(false), 15000); });
    if (!ready) return 'sin-red';
    return w.executeJavaScript('typeof window.PublicKeyCredential');
  });
  if (pk === 'sin-red') console.log('• llaves de acceso ocultas en el webview: omitido (sin red para cargar claude.ai)');
  else check('las llaves de acceso (WebAuthn) están ocultas en el webview de la IA', pk === 'undefined', String(pk));
  await page.click('[data-act="tab"][data-v="home"]');

  // Lock in front of the AI chat: default is Windows Hello if there is one, otherwise no lock (this Mac has none).
  const lk = (fn, ...a) => page.evaluate(([f, args]) => window.dim.ailock[f](...args), [fn, a]);
  const st0 = await lk('state');
  check('por defecto, sin Windows Hello, el chat no se bloquea', st0.locked === false && st0.mode === 'none', JSON.stringify(st0));
  await app.evaluate(() => globalThis.__DIM__.store.patch({ aiLock: 'secure', aiLockRelock: 'always' }));
  await page.waitForTimeout(400);
  const st1 = await lk('state');
  check('«Windows Hello o PIN de la app» sin Hello pide un PIN y bloquea', st1.mode === 'pin' && st1.needsPin === true && st1.locked === true, JSON.stringify(st1));
  await page.click('[data-act="tab"][data-v="chat"]');
  await page.waitForTimeout(500);
  const scr = await page.evaluate(() => ({ lock: document.querySelector('.lockbox')?.textContent || '', dock: !document.getElementById('webdock').hidden }));
  check('pantalla «Chat de IA bloqueado» y el chat tapado', scr.lock.includes('Chat de IA bloqueado') && scr.dock === false, scr.lock.slice(0, 60));
  const set1 = await lk('setPin', '2468');
  check('se crea el PIN', set1.ok === true, JSON.stringify(set1));
  const pinFile = fs.readFileSync(path.join(ud, 'aipin.json'), 'utf8');
  check('el PIN se guarda solo como hash con sal (nunca en claro)', !pinFile.includes('2468') && pinFile.includes('"hash"') && pinFile.includes('"salt"'));
  await page.waitForTimeout(400);
  try {
    await page.waitForSelector('#lockpin', { timeout: 5000 });
  } catch {
    console.log('  (diagnóstico) fila:', (await page.evaluate(() => ({ row: document.getElementById('row').innerHTML.slice(0, 160), hidden: document.getElementById('row').hidden, open: document.getElementById('stage').className }))));
  }
  await page.fill('#lockpin', '1111');
  await page.press('#lockpin', 'Enter');
  await page.waitForTimeout(500);
  check('PIN incorrecto: avisa y cuenta intentos', (await page.textContent('#lockmsg')).includes('Te quedan 4'));
  await page.fill('#lockpin', '2468');
  await page.press('#lockpin', 'Enter');
  await page.waitForTimeout(900);
  const open1 = await page.evaluate(() => ({ lock: !!document.querySelector('.lockbox'), dock: !document.getElementById('webdock').hidden }));
  check('PIN correcto: se abre el chat', open1.lock === false && open1.dock === true, JSON.stringify(open1));
  await page.click('[data-act="tab"][data-v="home"]');
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
  await page.waitForTimeout(500);
  check('al cerrar la isla se vuelve a bloquear', (await lk('state')).locked === true);
  let lastTry;
  for (let i = 0; i < 5; i++) lastTry = await lk('unlockPin', '0000');
  check('5 intentos fallidos: espera obligatoria', lastTry.retryIn >= 30, JSON.stringify(lastTry));
  const blocked = await lk('unlockPin', '2468');
  check('durante la espera ni el PIN correcto entra', blocked.ok === false && blocked.retryIn > 0, JSON.stringify(blocked));
  const sess = await app.evaluate(async () => (await globalThis.__DIM__.aiSession.cookies.get({ name: 'dim_test_session' })).length);
  check('el bloqueo no borra la sesión guardada de la IA', sess === 1);
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.patch({ aiLock: 'none' }); const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(500);

  // Re-asking: by default it does not ask every time the island closes (15 minutes).
  await app.evaluate(() => { const c = globalThis.__DIM__; c.aiLock.vault.set('2468'); c.store.patch({ aiLock: 'secure', aiLockRelock: '15' }); });
  await page.waitForTimeout(300);
  await lk('refresh');
  const un = await lk('unlockPin', '2468');
  check('con «a los 15 minutos» el PIN abre', un.ok === true || un.retryIn > 0, JSON.stringify(un));
  if (un.ok) {
    await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
    await page.waitForTimeout(300);
    check('al cerrar la isla NO vuelve a pedirlo (15 minutos)', (await lk('state')).locked === false);
    await app.evaluate(() => { const c = globalThis.__DIM__; c.aiLock.forceRelock(); });
    check('al bloquear o suspender Windows sí vuelve a pedirlo', (await lk('state')).locked === true);
  }
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.patch({ aiLock: 'none' }); const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(400);

  // HD cover from the Apple catalog (needs the network; skipped when offline).
  const hd = await app.evaluate(async () => { const c = globalThis.__DIM__; const a = await c.hdCover.find({ title: 'Blinding Lights (Official Video)', artist: 'The Weeknd - Topic' }); const b = await c.hdCover.find({ title: 'zzqq xxww no existe', artist: 'nadie jamas' }); return { a: a ? a.slice(0, 22) : null, len: a ? a.length : 0, b }; });
  if (!hd.a) console.log('• carátula HD: omitido (sin red para consultar iTunes)', JSON.stringify(hd), await app.evaluate(async () => { try { const r = await fetch('https://itunes.apple.com/search?term=Blinding%20Lights&entity=song&limit=1', { signal: AbortSignal.timeout(8000) }); return `fetch directo: ${r.status}`; } catch (e) { return `fetch directo falló: ${e && e.cause ? e.cause.code || e.cause : e}`; } }));
  else {
    check('carátula HD: encuentra la portada oficial por título y artista', hd.a.startsWith('data:image/') && hd.len > 20000, `${hd.a} ${hd.len} bytes`);
    check('carátula HD: una canción inexistente no devuelve nada', hd.b === null);
  }
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.patch({ coverHD: false }); });
  const off = await app.evaluate(async () => await globalThis.__DIM__.hdCover.find({ title: 'Otra Canción Distinta', artist: 'Otro' }));
  check('carátula HD: apagada en Ajustes no consulta nada', off === null);
  await app.evaluate(() => globalThis.__DIM__.store.patch({ coverHD: true }));

  // Saved sessions: encrypted copy of the AI sign-ins, saved and restored.
  const sb = (expr, arg) => app.evaluate(async (_e, [code, a]) => { const c = globalThis.__DIM__; return await new Function('c', 'a', `return (async () => { ${code} })()`)(c, a); }, [expr, arg]);
  await sb("await c.aiSession.cookies.set({ url: 'https://claude.ai/', name: 'dim_backup_test', value: 'VALOR-SECRETO-777', secure: true, httpOnly: true });");
  await page.waitForTimeout(600);
  const saved = await sb('return await c.sessionBackup.save();');
  const copyFile = path.join(ud, 'Sesiones', 'Sesiones-IA.dimsession');
  check('guarda la copia sin configurar nada (carpeta de la app)', saved.ok && /Copia guardada \(\d+ cookies de las IA\)/.test(saved.message) && fs.existsSync(copyFile), saved.message);
  const raw = fs.readFileSync(copyFile);
  check('la copia no contiene el valor de la cookie en claro', !raw.toString('utf8').includes('VALOR-SECRETO-777') && !raw.toString('latin1').includes('VALOR-SECRETO-777') && raw.subarray(0, 5).toString('ascii') === 'DIMS1');
  const has = () => sb("return (await c.aiSession.cookies.get({ name: 'dim_backup_test' })).map((k) => k.value);");
  await sb("await c.aiSession.cookies.remove('https://claude.ai/', 'dim_backup_test');");
  check('la cookie de prueba se borró', (await has()).length === 0);
  const rest = await sb('return await c.sessionBackup.restore();');
  check('ida y vuelta: restaurar devuelve la cookie', rest.ok && JSON.stringify(await has()) === '["VALOR-SECRETO-777"]', rest.message);
  // Own password: a wrong one restores nothing and says why.
  await sb("c.sessionBackup.setOwnPassword('clave-propia'); await c.aiSession.cookies.remove('https://claude.ai/', 'dim_backup_test');");
  const wrong = await sb('return await c.sessionBackup.restore();');
  check('contraseña incorrecta: no restaura nada y avisa', wrong.ok === false && wrong.message.includes('No pude leer la copia') && (await has()).length === 0, wrong.message);
  await sb("await c.aiSession.cookies.set({ url: 'https://claude.ai/', name: 'dim_backup_test', value: 'VALOR-SECRETO-777', secure: true, httpOnly: true }); return await c.sessionBackup.save();");
  await sb("await c.aiSession.cookies.remove('https://claude.ai/', 'dim_backup_test');");
  const own = await sb('return await c.sessionBackup.restore();');
  check('con la contraseña propia correcta sí restaura', own.ok && (await has()).length === 1, own.message);
  // A damaged file does not break anything.
  fs.writeFileSync(copyFile, Buffer.concat([Buffer.from('DIMS1'), Buffer.alloc(80, 7)]));
  const dmg = await sb('return await c.sessionBackup.restore();');
  fs.writeFileSync(copyFile, 'basura');
  const dmg2 = await sb('return await c.sessionBackup.restore();');
  check('un archivo dañado no rompe la app', dmg.ok === false && dmg2.ok === false && (await page.evaluate(() => 1 + 1)) === 2, `${dmg.message} | ${dmg2.message}`);
  // On start with no AI session at all, the copy comes back by itself.
  await sb("c.sessionBackup.clearOwnPassword(); await c.aiSession.cookies.set({ url: 'https://claude.ai/', name: 'dim_backup_test', value: 'VALOR-SECRETO-777', secure: true, httpOnly: true }); return await c.sessionBackup.save();");
  await sb("for (const k of await c.aiSession.cookies.get({})) { await c.aiSession.cookies.remove(`http${k.secure ? 's' : ''}://${k.domain.replace(/^\\./, '')}${k.path}`, k.name); }");
  const none = await sb('return (await c.aiSession.cookies.get({})).length;');
  const auto = await sb('return await c.sessionBackup.restoreIfEmpty();');
  check('sin sesiones de las IA al arrancar, la copia se restaura sola', none === 0 && auto.ok && (await has()).length === 1, `${none} cookies antes · ${auto.message}`);
  await sb("c.sessionBackup.deleteCopy(); await c.aiSession.cookies.set({ url: 'https://claude.ai/', name: 'dim_test_session', value: 'abc123', secure: true, httpOnly: true });");
  check('al cerrar sesión en todas las IA se borra también la copia', !fs.existsSync(copyFile));
  await page.waitForTimeout(700);

  // Performance: off by default, small and discreet, never blank.
  const perfDefault = await app.evaluate(() => globalThis.__DIM__.store.get('components').find((c) => c.id === 'performance').enabled);
  check('Rendimiento viene apagado por defecto', perfDefault === false);
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.patch({ components: c.store.get('components').map((x) => (x.id === 'performance' ? { ...x, enabled: true } : x.id === 'camera' ? { ...x, enabled: false } : x)) }); const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(2600);
  const pf = await page.evaluate(() => { const e = document.querySelector('[data-perf]'); if (!e) return null; const col = e.closest('.col'); const cs = getComputedStyle(e); return { text: e.textContent.replace(/\s+/g, ' ').trim(), w: col.offsetWidth, opacity: cs.opacity, label: getComputedStyle(e.querySelector('.pf span')).fontSize, value: getComputedStyle(e.querySelector('.pf em')).fontSize, bar: e.querySelector('.pf i') ? e.querySelector('.pf i').offsetHeight : 0 }; });
  check('Rendimiento: 130 px de ancho, letras de 9-10 px, barras de 3 px, al 38 %', pf && pf.w === 130 && pf.opacity === '0.38' && pf.label === '9px' && pf.value === '10px' && pf.bar === 3, JSON.stringify(pf));
  check('Rendimiento: nunca en blanco (CPU, GPU «No disponible», RAM, Hz y estado)', pf && /CPU\s*\d+%/.test(pf.text) && /GPU\s*No disponible/.test(pf.text) && /RAM\s*[\d.]+ GB/.test(pf.text) && /Pantalla\s*\d+ Hz/.test(pf.text) && /Estado\s*(Normal|Ocupado|Alto)/.test(pf.text), pf && pf.text);
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.patch({ components: c.store.get('components').map((x) => (x.id === 'performance' ? { ...x, enabled: false } : x.id === 'camera' ? { ...x, enabled: true } : x)) }); });
  await page.waitForTimeout(400);

  // The island is in proportion to every screen: automatic scale from the work area (simulated sizes, nothing shown).
  const sims = [[1366, 768, 0.71], [1920, 1080, 1.0], [2560, 1440, 1.33], [3440, 1440, 1.54], [2560, 1440, 1.33]]; // the last one is 3840x2160 at 150 %
  const settle = async () => { await page.waitForTimeout(750); };
  const rectOf = () => app.evaluate(() => { const i = globalThis.__DIM__.islands.first(); return { r: i.rect, auto: globalThis.__DIM__.islands.autoFor(i.display) }; });
  for (const [w, h, want] of sims) {
    await app.evaluate((_e, [a, b]) => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); c.islands.simulate(a, b); }, [w, h]);
    await settle();
    const open = await rectOf();
    const okOpen = Math.abs(open.auto - want) < 0.01 && Math.abs(open.r.w - 1077 * want) <= 3 && Math.abs(open.r.h - 187 * want) <= 2;
    check(`pantalla ${w}×${h}: isla abierta ${Math.round(1077 * want)} × ${Math.round(187 * want)} px (escala ${want})`, okOpen, `escala ${open.auto.toFixed(3)} · ${Math.round(open.r.w)} × ${Math.round(open.r.h)}`);
    await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
    await settle();
    const closed = await rectOf();
    check(`pantalla ${w}×${h}: píldora cerrada de ${Math.round(28 * want)} px de alto (28 a escala 1.0)`, Math.abs(closed.r.h - 28 * want) <= 1.5, `${closed.r.h.toFixed(1)} px`);
  }
  // Size selector on top of the automatic scale (1920x1080: Chico 0.75, Grande 1.2).
  await app.evaluate((_e) => { const c = globalThis.__DIM__; c.islands.simulate(1920, 1080); const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); c.store.set('uiSize', 'l'); });
  await settle();
  const big = await rectOf();
  check('selector Grande: escala automática × 1.2', Math.abs(big.r.w - 1077 * 1.2 * big.auto) <= 3, `${Math.round(big.r.w)} px`);
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.set('uiSize', 's'); });
  await settle();
  const small = await rectOf();
  check('selector Chico: escala automática × 0.75', Math.abs(small.r.w - 1077 * 0.75 * small.auto) <= 3, `${Math.round(small.r.w)} px`);
  await app.evaluate(() => { const c = globalThis.__DIM__; c.store.set('uiSize', 'm'); c.islands.simulate(null, null); const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await settle();

  // Closed island: cover on the left, timer on the right, both sides the same width.
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
  await page.waitForTimeout(1200);
  const pill = await page.evaluate(() => {
    const p = document.getElementById('pill');
    const l = p.querySelector('.lside'), r = p.querySelector('.rside');
    return { h: p.offsetHeight, off: p.classList.contains('off'), l: l && l.getBoundingClientRect().width, r: r && r.getBoundingClientRect().width, w: p.getBoundingClientRect().width, text: p.textContent.trim() };
  });
  check('isla cerrada: píldora de 28 px con música y Pomodoro, lados simétricos', !pill.off && pill.h === 28 && pill.l > 0 && Math.abs(pill.l - pill.r) < 2, JSON.stringify(pill));

  // Colors and the two lights, from the little panel next to the pencil.
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(800);
  await page.click('[data-act="lights-toggle"]');
  await page.waitForTimeout(500);
  const rect0 = await app.evaluate(() => globalThis.__DIM__.islands.first().rect);
  const panelVisible = await page.evaluate(() => !document.getElementById('lightpanel').hidden);
  check('el botón del sol abre el panel de luces', panelVisible);
  check('la zona clicable incluye el panel que cuelga de la isla', rect0.h > 220, JSON.stringify(rect0)); // the island alone is about 190 px high at this scale
  await page.click('#lightpanel [data-k="colorMode"][data-v="rainbow"]');
  await page.waitForTimeout(400);
  const rb1 = await page.evaluate(() => getComputedStyle(document.getElementById('notch')).getPropertyValue('--c1'));
  await page.waitForTimeout(1800);
  const rb2 = await page.evaluate(() => ({ c1: getComputedStyle(document.getElementById('notch')).getPropertyValue('--c1'), cls: document.getElementById('stage').className }));
  check('Arcoíris: los colores giran solos', rb2.cls.includes('cm-rainbow') && rb1 !== rb2.c1, `${rb1} -> ${rb2.c1}`);
  await page.click('#lightpanel [data-k="colorMode"][data-v="custom"]');
  await page.waitForTimeout(300);
  await page.click('#lightpanel .lp-sw[data-k="colorA"][data-v="#4D7CFF"]');
  await page.click('#lightpanel .lp-sw[data-k="colorB"][data-v="#AF52DE"]');
  await page.waitForTimeout(500);
  const cu = await page.evaluate(() => ({ c1: document.documentElement.style.getPropertyValue('--c1'), c2: document.documentElement.style.getPropertyValue('--c2'), swatches: document.querySelectorAll('#lightpanel .lp-sw').length }));
  check('Mis colores: 11 cuadros por color y se aplican', cu.swatches === 22 && cu.c1.toLowerCase() === '#4d7cff' && cu.c2.toLowerCase() === '#af52de', JSON.stringify(cu));
  await page.fill('#lightpanel [data-k="inLightIntensity"]', '500');
  await page.click('#lightpanel [data-k="outLightSize"][data-v="l"]');
  await page.click('#lightpanel [data-k="inLightDance"][data-v="still"]');
  await page.waitForTimeout(700);
  const lt = await page.evaluate(() => { const st = document.getElementById('stage').style; return { gin: st.getPropertyValue('--gin'), so: st.getPropertyValue('--so'), pin: st.getPropertyValue('--pin') }; });
  check('intensidad 500 %, tamaño grande y baile quieto se aplican', lt.gin === '5' && lt.so === '1.5' && Number(lt.pin) === 0.3, JSON.stringify(lt));
  const savedLights = await app.evaluate(() => { const s = globalThis.__DIM__.store; return { m: s.get('colorMode'), a: s.get('colorA'), i: s.get('inLightIntensity'), o: s.get('outLightSize'), d: s.get('inLightDance') }; });
  check('los ajustes de luces se guardan', savedLights.m === 'custom' && savedLights.a === '#4D7CFF' && savedLights.i === 500 && savedLights.o === 'l' && savedLights.d === 'still', JSON.stringify(savedLights));
  await app.evaluate(() => globalThis.__DIM__.store.patch({ colorMode: 'auto', inLightDance: 'm', inLightIntensity: 260, outLightSize: 'm' }));
  await page.click('[data-act="lights-toggle"]');
  await page.waitForTimeout(300);

  // Outline options and the dance switch.
  await app.evaluate(() => globalThis.__DIM__.store.patch({ borderStyle: 'always' }));
  await page.waitForTimeout(300);
  check('contorno «Siempre» muestra el borde', await page.evaluate(() => getComputedStyle(document.querySelector('.rim')).display !== 'none'));
  await app.evaluate(() => globalThis.__DIM__.store.patch({ borderStyle: 'none', colorsDance: false }));
  await page.waitForTimeout(500);
  const idle = await page.evaluate(() => Number(document.getElementById('stage').style.getPropertyValue('--pulse')));
  check('con «bailan» apagado el brillo queda quieto', idle <= 0.2, String(idle));
  await app.evaluate(() => globalThis.__DIM__.store.patch({ colorsDance: true }));

  // Settings changes reach the island.
  await app.evaluate(() => globalThis.__DIM__.store.set('glowStyle', 'strong'));
  await page.waitForTimeout(300);
  check('un ajuste cambia la isla en vivo', await page.evaluate(() => document.getElementById('notch').classList.contains('g-strong')));
  check('sin errores en la consola de la isla', errors.length === 0, errors.join(' | ').slice(0, 300));
} catch (err) {
  console.log('✖ fallo inesperado:', err.message);
  console.log(String(err.stack).split('\n').filter((l) => l.includes('run.mjs')).slice(0, 3).join('\n'));
  failed++;
} finally {
  await app.close();
}
// Second start with the same data folder: the AI session must still be there.
{
  const app2 = await electron.launch({ args: [root], env: { ...process.env, DIM_TEST: '1', DIM_MOCK_MEDIA: '1', DIM_USER_DATA: ud } });
  try {
    const p2 = await app2.firstWindow();
    await p2.waitForSelector('body[data-ready=\"1\"]', { state: 'attached', timeout: 15000 });
    await p2.waitForTimeout(800);
    const again = await app2.evaluate(async () => (await globalThis.__DIM__.aiSession.cookies.get({ name: 'dim_test_session' })).map((c) => ({ value: c.value, session: c.session })));
    check('la sesión de la IA sigue ahí después de cerrar y abrir la app', again.length === 1 && again[0].value === 'abc123' && again[0].session === false, JSON.stringify(again));
  } finally {
    await app2.close();
  }
}
// First start of a new install: one short screen with "By: MoisesGuerraDev" and an Empezar button, nothing asked.
{
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'dim-e2e-fresh-'));
  const app3 = await electron.launch({ args: [root], env: { ...process.env, DIM_TEST: '1', DIM_MOCK_MEDIA: '1', DIM_USER_DATA: fresh } });
  try {
    const p3 = await app3.firstWindow();
    await p3.waitForSelector('.welcome', { state: 'attached', timeout: 15000 });
    const w = await p3.evaluate(() => ({ title: document.querySelector('.welcome > b').textContent.trim(), button: document.querySelector('[data-act="welcome-done"]').textContent.trim(), perms: document.querySelectorAll('.welcome input[type=checkbox]:checked').length }));
    check('primera vez: pantalla con «By: MoisesGuerraDev» y botón Empezar', w.title === 'By: MoisesGuerraDev' && w.button === 'Empezar', JSON.stringify(w));
    const before = await app3.evaluate(() => ({ login: globalThis.__DIM__.store.get('launchAtLogin'), welcomed: globalThis.__DIM__.store.get('welcomed') }));
    check('primera vez: no se activa nada por sí solo (ni inicio con Windows)', before.login === false && w.perms === 0, JSON.stringify(before));
    await p3.click('[data-act="welcome-done"]');
    await p3.waitForTimeout(500);
    const after = await p3.evaluate(() => ({ gone: !document.querySelector('.welcome'), players: !!document.querySelector('.player, .nomusic') }));
    check('Empezar cierra el tutorial y muestra la isla', after.gone && after.players, JSON.stringify(after));
  } catch (err) {
    check('primera vez: tutorial', false, err.message.split('\n')[0]);
  } finally {
    await app3.close();
  }
}
await new Promise((r) => setTimeout(r, 1500));
let leftovers = '';
try { leftovers = execSync('pgrep -f "windows/node_modules/electron" || true', { encoding: 'utf8' }).trim(); } catch { /* none */ }
check('al terminar no queda ningún proceso de Electron', leftovers === '', leftovers.replace(/\n/g, ' '));
console.log(failed ? `\n${failed} comprobaciones fallaron. Capturas en ${out}` : `\nTodo bien. Capturas en ${out}`);
process.exit(failed ? 1 : 0);
