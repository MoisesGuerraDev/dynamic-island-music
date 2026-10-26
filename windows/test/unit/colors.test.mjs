import test from 'node:test';
import assert from 'node:assert/strict';
import { dominantPalette, paletteFromHex, DEFAULT_PALETTE } from '../../src/renderer/colors.js';

const px = (n, rgb) => Array.from({ length: n }).flatMap(() => [...rgb, 255]);
const hueOf = (hsl) => Number(/hsl\((\d+)/.exec(hsl)[1]);

test('a red and blue cover gives red and blue as the two colors', () => {
  const data = Uint8ClampedArray.from([...px(300, [230, 30, 40]), ...px(200, [30, 80, 230]), ...px(100, [20, 20, 20])]);
  const p = dominantPalette(data);
  const h1 = hueOf(p.c1), h2 = hueOf(p.c2);
  assert.ok(h1 < 15 || h1 > 345, `first color is red, got ${p.c1}`);
  assert.ok(h2 > 205 && h2 < 235, `second color is blue, got ${p.c2}`);
});

test('the stronger color goes first', () => {
  const data = Uint8ClampedArray.from([...px(100, [230, 30, 40]), ...px(500, [30, 200, 60])]);
  const p = dominantPalette(data);
  assert.ok(hueOf(p.c1) > 110 && hueOf(p.c1) < 150, p.c1);
});

test('a one-color cover still gets a neighbour second color', () => {
  const p = dominantPalette(Uint8ClampedArray.from(px(400, [240, 60, 30])));
  assert.ok(hueOf(p.c1) < 20);
  assert.notEqual(p.c1, p.c2);
});

test('a gray cover does not break and the custom colors become a palette', () => {
  const p = dominantPalette(Uint8ClampedArray.from(px(400, [120, 120, 120])));
  assert.ok(p.c1 && p.c2 && p.c3);
  assert.ok(paletteFromHex('#4D7CFF').c1.startsWith('hsl('));
  assert.equal(paletteFromHex('nope'), DEFAULT_PALETTE);
});
