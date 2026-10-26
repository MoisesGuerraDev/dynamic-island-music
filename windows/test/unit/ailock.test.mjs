import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiLock } from '../../src/main/ailock.js';
import { PinVault } from '../../src/main/pin.js';

function make(settings = {}) {
  const data = { aiLock: 'secure', aiLockPreferPin: false, aiLockRelock: '15', ...settings };
  const store = { get: (k) => data[k], set: (k, v) => (data[k] = v) };
  let t = 1_000_000;
  const vault = new PinVault(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dim-lock-')), 'aipin.json'), () => t);
  vault.set('2468');
  const lock = new AiLock({ store, vault, helper: null, now: () => t, schedule: false });
  return { lock, data, advance: (ms) => (t += ms) };
}

test('by default it asks again after 15 minutes, not every time the island closes', () => {
  const { lock, advance } = make();
  assert.equal(lock.state().locked, true);
  assert.ok(lock.unlockPin('2468').ok);
  assert.equal(lock.state().locked, false);
  lock.relock(); // the island closed
  assert.equal(lock.state().locked, false, 'still unlocked');
  advance(14 * 60_000);
  lock.relock();
  assert.equal(lock.state().locked, false);
  advance(2 * 60_000);
  assert.equal(lock.state().locked, true, 'after 15 minutes it asks again');
});

test('"siempre" asks again as soon as the island closes', () => {
  const { lock } = make({ aiLockRelock: 'always' });
  assert.ok(lock.unlockPin('2468').ok);
  assert.equal(lock.state().locked, false);
  lock.relock();
  assert.equal(lock.state().locked, true);
});

test('"a la hora" and "solo al abrir la app"', () => {
  const hour = make({ aiLockRelock: '60' });
  assert.ok(hour.lock.unlockPin('2468').ok);
  hour.advance(59 * 60_000);
  assert.equal(hour.lock.state().locked, false);
  hour.advance(2 * 60_000);
  assert.equal(hour.lock.state().locked, true);

  const app = make({ aiLockRelock: 'app' });
  assert.ok(app.lock.unlockPin('2468').ok);
  app.advance(48 * 3600_000);
  app.lock.relock();
  assert.equal(app.lock.state().locked, false, 'never asks again until the app restarts');
});

test('locking or suspending Windows locks the chat whatever the setting', () => {
  const { lock } = make({ aiLockRelock: 'app' });
  assert.ok(lock.unlockPin('2468').ok);
  assert.equal(lock.state().locked, false);
  lock.forceRelock();
  assert.equal(lock.state().locked, true);
});

test('changing the lock settings asks again, and "none" never locks', () => {
  const { lock, data } = make();
  assert.ok(lock.unlockPin('2468').ok);
  lock.settingsChanged();
  assert.equal(lock.state().locked, true);
  data.aiLock = 'none';
  assert.equal(lock.state().locked, false);
});
