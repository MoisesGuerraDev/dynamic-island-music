import test from 'node:test';
import assert from 'node:assert/strict';
import { bpmFor, pulseAt, hashString, MIN_BPM, MAX_BPM } from '../../src/shared/pulse.js';

test('tempo is stable per song and stays between 86 and 133 BPM', () => {
  assert.equal(bpmFor('Sangre', 'Dante Ríos'), bpmFor('sangre ', ' dante ríos'));
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const b = bpmFor(`canción ${i}`, `artista ${i % 17}`);
    assert.ok(b >= MIN_BPM && b <= MAX_BPM, String(b));
    seen.add(b);
  }
  assert.ok(seen.size > 30, 'tempos should be spread out');
  assert.equal(hashString('a'), hashString('a'));
});

test('pulse is always between 0 and 1', () => {
  for (const bpm of [86, 110, 133]) {
    for (let t = 0; t < 120; t += 0.013) {
      const p = pulseAt(t, bpm);
      assert.ok(p >= 0 && p <= 1, `${bpm} ${t} ${p}`);
    }
  }
});

test('beats rise fast and fall smoothly', () => {
  const bpm = 120; // a beat every 0.5 s
  const beat = 0.5;
  const peak = pulseAt(beat * 4 + beat * 0.06, bpm);
  assert.ok(peak > 0.9, `peak ${peak}`);
  const justBefore = pulseAt(beat * 4 - 0.01, bpm);
  assert.ok(justBefore < 0.5, 'quiet right before the beat');
  // Rising takes about 6 % of a beat, falling takes much longer.
  const rise = pulseAt(beat * 4 + beat * 0.03, bpm);
  const fall = pulseAt(beat * 4 + beat * 0.06 + beat * 0.2, bpm);
  assert.ok(rise > 0.3 && fall > 0.2 && fall < peak);
  // Smooth fall: it keeps going down across the beat.
  let prev = peak;
  for (let f = 0.1; f < 0.45; f += 0.05) {
    const v = pulseAt(beat * 4 + beat * f, bpm);
    assert.ok(v <= prev + 1e-9);
    prev = v;
  }
});

test('there is a smaller hit off the beat', () => {
  const bpm = 100;
  const beat = 60 / bpm;
  const off = pulseAt(beat * 8 + beat * 0.5 + beat * 0.06, bpm);
  const main = pulseAt(beat * 8 + beat * 0.06, bpm);
  assert.ok(off > 0.25 && off < main, `${off} < ${main}`);
});
