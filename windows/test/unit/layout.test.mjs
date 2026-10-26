import test from 'node:test';
import assert from 'node:assert/strict';
import { capWidth, paginate, openWidth, usage, moveOnto, clampWidth } from '../../src/shared/layout.js';
import { defaultComponents, normalizeComponents, normalizeSettings, COMPONENT_META, DEFAULTS } from '../../src/shared/defaults.js';

const active = (ids) => defaultComponents().filter((c) => ids.includes(c.id)).map((c) => ({ ...c, enabled: true }));

test('capWidth is 72 % of the screen and never above 1300', () => {
  assert.equal(capWidth(1470), 1058);
  assert.equal(capWidth(1920), 1300);
  assert.equal(capWidth(3440), 1300);
  assert.equal(capWidth(1366), 984);
  assert.equal(capWidth(1920, true, 900), 900);
});

test('the five default components fit one page on a 1920 screen', () => {
  const act = defaultComponents().filter((c) => c.enabled);
  const pages = paginate(act, capWidth(1920));
  assert.equal(pages.length, 1);
  assert.equal(openWidth(pages[0], 1300), 1006);
});

test('components that do not fit go to another page instead of being squeezed', () => {
  const act = defaultComponents().filter((c) => c.enabled);
  const pages = paginate(act, capWidth(1366)); // cap 984: room 948 < 970
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.flat().map((c) => c.id), act.map((c) => c.id));
  for (const p of pages) assert.ok(p.reduce((s, c) => s + c.width, 0) <= 984 - 36);
});

test('usage can go over 100 %', () => {
  const act = active(['player', 'calendar', 'notes', 'pomodoro', 'camera', 'chat', 'clipboard']);
  assert.ok(usage(act, 1058) > 100);
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
  assert.equal(fixed[0].width, 300);
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
