// End-to-end check on the development machine: starts the real app with a fake music player and a throw-away
// data folder, and checks the island window and the main process. Windows-only parts cannot run here.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
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
  check('visible', main.visible);
  check('cerrada y con clic a través', main.open === false && main.ignoring === true);

  // Open it like the cursor would.
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.add('toggle'); c.islands.setOpen(i, true); });
  await page.waitForTimeout(900);
  check('se abre', await page.evaluate(() => document.getElementById('stage').classList.contains('is-open')));
  const rect = await page.evaluate(() => { const n = document.getElementById('notch'); return { w: n.offsetWidth, x: n.offsetLeft }; });
  check('isla abierta no gigante', rect.w <= 1100, `${rect.w}px`);
  await page.screenshot({ path: path.join(out, 'island-open.png') });
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
  await app.evaluate(({ clipboard }) => clipboard.writeText('texto de prueba del portapapeles'));
  await page.waitForTimeout(1800);
  const clipN = await app.evaluate(() => globalThis.__DIM__.clip.list().map((i) => i.text));
  check('portapapeles guarda lo copiado', clipN.includes('texto de prueba del portapapeles'));
  await app.evaluate(({ clipboard }) => clipboard.writeText('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx'));
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
    await settings.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
    await settings.waitForTimeout(500);
    await settings.screenshot({ path: path.join(out, 'settings-pomodoro.png') });
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
  await page.screenshot({ path: path.join(out, 'island-ai.png') });
  await page.click('[data-act="tab"][data-v="home"]');

  // Closed island: cover on the left, timer on the right, both sides the same width.
  await app.evaluate(() => { const c = globalThis.__DIM__; const i = c.islands.first(); i.pins.clear(); c.islands.setOpen(i, false); });
  await page.waitForTimeout(1200);
  const pill = await page.evaluate(() => {
    const p = document.getElementById('pill');
    const l = p.querySelector('.lside'), r = p.querySelector('.rside');
    return { off: p.classList.contains('off'), l: l && l.getBoundingClientRect().width, r: r && r.getBoundingClientRect().width, w: p.getBoundingClientRect().width, text: p.textContent.trim() };
  });
  check('isla cerrada muestra música y Pomodoro, lados simétricos', !pill.off && pill.l > 0 && Math.abs(pill.l - pill.r) < 2, JSON.stringify(pill));
  await page.screenshot({ path: path.join(out, 'island-closed.png'), clip: { x: 0, y: 0, width: 1198, height: 120 } });

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
  failed++;
} finally {
  await app.close();
}
console.log(failed ? `\n${failed} comprobaciones fallaron. Capturas en ${out}` : `\nTodo bien. Capturas en ${out}`);
process.exit(failed ? 1 : 0);
