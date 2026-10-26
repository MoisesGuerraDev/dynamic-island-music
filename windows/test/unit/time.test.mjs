import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatDuration, relativeAge } from '../../src/shared/time.js';

test('parseDuration: minutes, mm:ss and h:mm:ss', () => {
  assert.equal(parseDuration('25'), 1500);
  assert.equal(parseDuration('1:30'), 90);
  assert.equal(parseDuration('1:30:00'), 5400);
  assert.equal(parseDuration('0,5'), 30);
  assert.equal(parseDuration('1.5'), 90);
  assert.equal(parseDuration(' 90 '), 5400);
  assert.equal(parseDuration('0:05'), 5);
  assert.equal(parseDuration('100:00'), 6000);
});

test('parseDuration: rejects nonsense', () => {
  for (const bad of ['', 'abc', '1:60', '1:2:3:4', '-5', '1::2', ':30', '1:99:00']) {
    assert.ok(Number.isNaN(parseDuration(bad)), `"${bad}" should be NaN`);
  }
  assert.ok(Number.isNaN(parseDuration(null)));
});

test('formatDuration', () => {
  assert.equal(formatDuration(90), '1:30');
  assert.equal(formatDuration(5400), '1:30:00');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(1500), '25:00');
  assert.equal(formatDuration(-3), '0:00');
  assert.equal(formatDuration(3599.9), '59:59');
});

test('relativeAge speaks Spanish', () => {
  const now = Date.UTC(2026, 9, 26, 12);
  assert.equal(relativeAge(now - 10_000, now), 'ahora');
  assert.equal(relativeAge(now - 5 * 60_000, now), 'hace 5 min');
  assert.equal(relativeAge(now - 2 * 3600_000, now), 'hace 2 h');
  assert.equal(relativeAge(now - 86_400_000, now), 'hace 1 día');
  assert.equal(relativeAge(now - 3 * 86_400_000, now), 'hace 3 días');
});
