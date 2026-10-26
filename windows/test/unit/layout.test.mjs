import test from 'node:test';
import assert from 'node:assert/strict';
import { capWidth, paginate, openWidth, usage, moveOnto, clampWidth, uiScaleFor, autoScale, BASE_W, BASE_H } from '../../src/shared/layout.js';
import { defaultComponents, normalizeComponents, normalizeSettings, COMPONENT_META, DEFAULTS } from '../../src/shared/defaults.js';

const active = (ids) => defaultComponents().filter((c) => ids.includes(c.id)).map((c) => ({ ...c, enabled: true }));

test('capWidth is 75 % of the screen', () => {
  assert.equal(capWidth(1920), 1440);
  assert.equal(capWidth(3440), 2580);
  assert.equal(capWidth(1366), 1025);
  assert.equal(capWidth(1920, true, 900), 900);
});

test('the five default components make an island of 1077 px, like the Mac', () => {
  const act = defaultComponents().filter((c) => c.enabled);
  assert.deepEqual(act.map((c) => c.width), [312, 222, 178, 159, 178]);
  const pages = paginate(act, capWidth(1920));
  assert.equal(pages.length, 1);
  assert.equal(openWidth(pages[0], 1440), 1077);
});

test('automatic scale makes the island proportional to the screen', () => {
  const w = (a) => Math.round(BASE_W * a);
  assert.equal(autoScale(1366, 768).toFixed(2), '0.71');
  assert.ok(Math.abs(w(autoScale(1366, 768)) - 765) <= 2);
  assert.ok(Math.abs(autoScale(1920, 1080) - 1) < 0.01, 'a 1080p screen gets the base size');
  assert.ok(Math.abs(w(autoScale(1920, 1080)) - 1077) <= 3);
  assert.equal(autoScale(2560, 1440).toFixed(2), '1.33');
  assert.equal(autoScale(3440, 1440).toFixed(2), '1.54', 'ultrawide: limited by the height');
  assert.equal(autoScale(3840 / 1.5, 2160 / 1.5).toFixed(2), '1.33', '4K at 150 % is 2560x1440 for the app');
  assert.equal(autoScale(800, 600), 0.7, 'never smaller than 0.70');
  assert.equal(autoScale(7680, 4320), 1.7, 'never bigger than 1.70');
});

test('final scale = automatic x the size chosen, never wider than the cap', () => {
  assert.equal(uiScaleFor(1077, capWidth(1920), 'm', 1), 1);
  assert.equal(uiScaleFor(1077, capWidth(1920), 'l', 1), 1.2);
  assert.equal(uiScaleFor(1077, capWidth(1920), 's', 1), 0.75);
  assert.ok(Math.abs(uiScaleFor(1077, capWidth(2560), 'm', autoScale(2560, 1440)) - 1.33) < 0.01);
  assert.ok(Math.abs(uiScaleFor(1077, capWidth(2560), 'l', autoScale(2560, 1440)) - 1.6) < 0.01);
  assert.ok(1077 * uiScaleFor(1077, 900, 'l', 1.7) <= 900.5, 'the cap wins');
  assert.equal(uiScaleFor(1077, 5000, 'x', 1), 1, 'unknown size falls back to Mediano');
  assert.equal(BASE_H, 187);
});

test('components that do not fit even at the smallest size go to another page instead of being squeezed', () => {
  const many = defaultComponents().map((c) => ({ ...c, enabled: true }));
  const pages = paginate(many, capWidth(1366) / autoScale(1366, 768));
  assert.ok(pages.length >= 2);
  assert.deepEqual(pages.flat().map((c) => c.id), many.map((c) => c.id));
  for (const p of pages) assert.ok(p.reduce((s, c) => s + c.width, 0) <= capWidth(1366) / autoScale(1366, 768) - 28);
});

test('usage can go over 100 %', () => {
  const act = active(['player', 'calendar', 'notes', 'pomodoro', 'camera', 'chat', 'clipboard']);
  assert.ok(usage(act, 1103) > 100);
  assert.equal(usage([], 1000), 0);
});

test('moveOnto puts the dragged component in the slot of the target', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(moveOnto(list, 'a', 'c').map((c) => c.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveOnto(list, 'd', 'a').map((c) => c.id), ['d', 'a', 'b', 'c']);
  assert.equal(moveOnto(list, 'a', 'a'), list);
});

test('clampWidth respects the minimum of each component', () => {
  assert.equal(clampWidth('player', 100), COMPONENT_META.player.min);
  assert.equal(clampWidth('player', 9999), 520);
  assert.equal(clampWidth('notes', 200), 200);
});

test('normalizeComponents repairs lists from old or damaged settings', () => {
  const fixed = normalizeComponents([{ id: 'player', enabled: 1, width: 'x' }, { id: 'nope' }, { id: 'player', enabled: false }]);
  assert.equal(fixed.length, 10);
  assert.equal(fixed[0].id, 'player');
  assert.equal(fixed[0].enabled, true);
  assert.equal(fixed[0].width, 312);
  assert.equal(new Set(fixed.map((c) => c.id)).size, 10);
});

test('normalizeSettings fills defaults and keeps what the user set', () => {
  const s = normalizeSettings({ glowStyle: 'soft', aiEnabled: { gemini: true } });
  assert.equal(s.glowStyle, 'soft');
  assert.equal(s.aiEnabled.gemini, true);
  assert.equal(s.aiEnabled.claude, true);
  assert.equal(s.pomoFocusSeconds, DEFAULTS.pomoFocusSeconds);
  assert.notEqual(s.components, DEFAULTS.components); // a copy, not shared
});
