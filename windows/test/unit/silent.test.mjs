import test from 'node:test';
import assert from 'node:assert/strict';
import { SilentTracker, browserProcesses } from '../../src/shared/silent.js';

test('browserProcesses: reconoce los navegadores por el nombre de la app', () => {
  assert.deepEqual(browserProcesses('Chrome'), { name: 'Chrome', procs: ['chrome'] });
  assert.deepEqual(browserProcesses('MSEdge'), { name: 'Edge', procs: ['msedge'] });
  assert.equal(browserProcesses('Spotify.exe'), null);
});

test('SilentTracker: avisa solo tras unos segundos de silencio con la música sonando', () => {
  const t = new SilentTracker({ needed: 3 });
  const quiet = { playing: true, found: true, peak: 0, muted: false };
  assert.equal(t.update(quiet).silent, false);
  assert.equal(t.update(quiet).silent, false);
  const r = t.update(quiet);
  assert.equal(r.silent, true);
  assert.equal(r.cause, 'page');
});

test('SilentTracker: si el mezclador de Windows lo tiene en mudo, lo dice', () => {
  const t = new SilentTracker({ needed: 1 });
  assert.equal(t.update({ playing: true, found: true, peak: 0, muted: true }).cause, 'mixer');
});

test('SilentTracker: cualquier sonido o la pausa reinician la cuenta', () => {
  const t = new SilentTracker({ needed: 2 });
  t.update({ playing: true, found: true, peak: 0, muted: false });
  assert.equal(t.update({ playing: true, found: true, peak: 0.2, muted: false }).silent, false);
  t.update({ playing: true, found: true, peak: 0, muted: false });
  assert.equal(t.update({ playing: false, found: true, peak: 0, muted: false }).silent, false);
  assert.equal(t.count, 0);
});
