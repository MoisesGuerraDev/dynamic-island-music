import test from 'node:test';
import assert from 'node:assert/strict';
import { capWidth, paginate, openWidth, usage, moveOnto, clampWidth, uiScaleFor, MIN_UI } from '../../src/shared/layout.js';
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
  const pages = paginate(act, capWidth(1920) / MIN_UI);
  assert.equal(pages.length, 1);
  assert.equal(openWidth(pages[0], 1440), 1077);
});

test('the island keeps its size (Mediano 1.0) and shrinks only when the screen is too narrow, never under 0.75', () => {
  assert.equal(uiScaleFor(1077, capWidth(1920), 'm'), 1);
  assert.equal(uiScaleFor(1077, capWidth(1920), 'l'), 1.2);
  assert.equal(uiScaleFor(1077, capWidth(1920), 's'), 0.75);
  const narrow = uiScaleFor(1077, capWidth(1366), 'm');
  assert.ok(narrow < 1 && narrow > 0.9, String(narrow));
  assert.ok(1077 * narrow <= capWidth(1366) + 0.5, 'never wider than 75 % of the screen');
  assert.equal(uiScaleFor(1077, 500, 'm'), 0.75);
  assert.equal(uiScaleFor(1077, 5000, 'x'), 1, 'unknown size falls back to Mediano');
});

test('components that do not fit even at the smallest size go to another page instead of being squeezed', () => {
  const many = defaultComponents().map((c) => ({ ...c, enabled: true }));
  const pages = paginate(many, capWidth(1366) / MIN_UI);
  assert.ok(pages.length >= 2);
  assert.deepEqual(pages.flat().map((c) => c.id), many.map((c) => c.id));
  for (const p of pages) assert.ok(p.reduce((s, c) => s + c.width, 0) <= capWidth(1366) / MIN_UI - 28);
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
