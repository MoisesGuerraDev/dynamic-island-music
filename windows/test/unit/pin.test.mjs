import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PinVault, validPin, lockoutSeconds, MAX_FAILS } from '../../src/main/pin.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dim-pin-')), 'aipin.json');

test('a PIN has 4 to 8 digits', () => {
  for (const ok of ['1234', '12345678', '0000']) assert.ok(validPin(ok), ok);
  for (const bad of ['123', '123456789', 'abcd', '12 34', '', null, 1234]) assert.ok(!validPin(bad), String(bad));
});

test('the PIN is never stored, only a salted scrypt hash', () => {
  const file = tmp();
  const v = new PinVault(file);
  assert.equal(v.isSet(), false);
  assert.ok(v.set('2468').ok);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('2468'), 'the PIN must not appear in the file');
  const d = JSON.parse(raw);
  assert.ok(d.salt && d.hash && d.n === 16384);
  assert.notEqual(Buffer.from(d.hash, 'base64').toString('utf8'), '2468');
  // Same PIN, new vault: different salt, different hash.
  const file2 = tmp();
  new PinVault(file2).set('2468');
  assert.notEqual(JSON.parse(fs.readFileSync(file2, 'utf8')).hash, d.hash);
});

test('right PIN opens, wrong PIN does not, and it survives a restart', () => {
  const file = tmp();
  new PinVault(file).set('2468');
  const v = new PinVault(file); // as after closing the app
  assert.ok(v.isSet());
  assert.ok(v.verify('2468').ok);
  const bad = v.verify('1111');
  assert.equal(bad.ok, false);
  assert.equal(bad.attemptsLeft, MAX_FAILS - 1);
  assert.ok(v.verify('2468').ok);
});

test('five wrong guesses lock for a growing time, even with the right PIN', () => {
  let t = 1_000_000;
  const file = tmp();
  const v = new PinVault(file, () => t);
  v.set('2468');
  for (let i = 0; i < MAX_FAILS - 1; i++) assert.equal(v.verify('0000').retryIn, 0);
  const fifth = v.verify('0000');
  assert.equal(fifth.retryIn, 30);
  assert.equal(v.verify('2468').ok, false, 'locked out: not even the right PIN');
  assert.equal(v.verify('2468').retryIn, 30);
  // The wait survives closing the app.
  assert.equal(new PinVault(file, () => t).retryIn(), 30);
  t += 31_000;
  for (let i = 0; i < MAX_FAILS; i++) v.verify('0000');
  assert.equal(v.retryIn(), 60, 'the second wait is longer');
  t += 61_000;
  assert.ok(v.verify('2468').ok);
  assert.equal(v.data.lockouts, 0, 'a good PIN resets the count');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(lockoutSeconds), [30, 60, 120, 240, 480, 900, 900, 900]);
});

test('changing and removing the PIN need the current PIN', () => {
  const v = new PinVault(tmp());
  v.set('2468');
  assert.equal(v.change('0000', '1357').ok, false);
  assert.ok(v.change('2468', '1357').ok);
  assert.ok(v.verify('1357').ok);
  assert.equal(v.verify('2468').ok, false);
  assert.equal(v.change('1357', '12').ok, false, 'the new PIN must be valid');
  assert.equal(v.remove('0000').ok, false);
  assert.ok(v.isSet());
  assert.ok(v.remove('1357').ok);
  assert.equal(v.isSet(), false);
});
