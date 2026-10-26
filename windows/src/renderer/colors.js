// Colors from the album cover. A plain average of a dark cover with a red logo looks brown, so every pixel is
// weighted by how saturated and bright it is (same idea as NSImage.vibrantColor in the macOS app).

export const DEFAULT_PALETTE = { c1: '#ff8a3d', c2: '#e0294a', c3: '#6b2f1a' };

export function vibrantFromPixels(data) {
  let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
  let rAvg = 0, gAvg = 0, bAvg = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    rAvg += r; gAvg += g; bAvg += b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const w = sat * sat * mx;
    if (sat > 0.28 && mx > 0.3) {
      rSum += r * w; gSum += g * w; bSum += b * w; wSum += w;
    }
  }
  if (wSum > 0.0001) return [rSum / wSum, gSum / wSum, bSum / wSum];
  return [rAvg / n, gAvg / n, bAvg / n];
}

function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** From the vibrant color: c1 is the neon color, c2 a neighbour hue, c3 a dark shade for the art fallback. */
export function paletteFromRgb(rgb) {
  let [h, s, l] = rgbToHsl(rgb);
  s = Math.max(0.55, Math.min(1, s * 1.1));
  l = Math.max(0.5, Math.min(0.62, l < 0.45 ? 0.5 : l));
  return {
    c1: hsl(h, s, l),
    c2: hsl(h + 28, Math.min(1, s), Math.max(0.45, l - 0.04)),
    c3: hsl(h, s * 0.7, 0.2),
  };
}

export function paletteFromHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return DEFAULT_PALETTE;
  const n = parseInt(m[1], 16);
  return paletteFromRgb([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
}

/** The two colors the person picked, used as they are (c3 is a dark shade of the first). */
export function customPalette(a, b) {
  const ok = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  const base = paletteFromHex(a);
  return { c1: ok(a) ? a : base.c1, c2: ok(b) ? b : base.c2, c3: base.c3 };
}

/**
 * The two main colors of a picture, by hue: pixels are put in 24 hue buckets weighted by how saturated and bright
 * they are; the strongest bucket is the first color and the strongest one at least 40 degrees away is the second.
 * With a one-color picture the second color is a neighbour hue. Returns { c1, c2, c3 }.
 */
export function dominantPalette(data) {
  const B = 24;
  const w = new Array(B).fill(0);
  const rgb = Array.from({ length: B }, () => [0, 0, 0]);
  let rAvg = 0, gAvg = 0, bAvg = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    rAvg += r; gAvg += g; bAvg += b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (!(sat > 0.28 && mx > 0.3)) continue;
    const [h] = rgbToHsl([r, g, b]);
    const k = Math.floor(h / (360 / B)) % B;
    const weight = sat * sat * mx;
    w[k] += weight;
    rgb[k][0] += r * weight; rgb[k][1] += g * weight; rgb[k][2] += b * weight;
  }
  const total = w.reduce((a, b) => a + b, 0);
  if (total < 0.0001) return paletteFromRgb([rAvg / n, gAvg / n, bAvg / n]);
  // Strength of a bucket together with its two neighbours, so a hue split across a boundary still counts.
  const near = (k) => w[k] + w[(k + 1) % B] * 0.6 + w[(k + B - 1) % B] * 0.6;
  const best = (skip) => {
    let bk = -1, bv = 0;
    for (let k = 0; k < B; k++) {
      if (skip && skip(k)) continue;
      const v = near(k);
      if (v > bv) { bv = v; bk = k; }
    }
    return { k: bk, v: bv };
  };
  const mean = (k) => {
    let r = 0, g = 0, b = 0, ww = 0;
    for (const j of [k, (k + 1) % B, (k + B - 1) % B]) { r += rgb[j][0]; g += rgb[j][1]; b += rgb[j][2]; ww += w[j]; }
    return [r / ww, g / ww, b / ww];
  };
  const a = best();
  const hueDist = (x, y) => { const d = Math.abs(x - y) * (360 / B); return Math.min(d, 360 - d); };
  const second = best((k) => hueDist(k, a.k) < 40);
  const first = paletteFromRgb(mean(a.k));
  if (second.k < 0 || second.v < a.v * 0.15) return first;
  const other = paletteFromRgb(mean(second.k));
  return { c1: first.c1, c2: other.c1, c3: first.c3 };
}

const cache = new Map();

/** Loads the cover (data URL) and returns a palette, or null if it cannot be read. */
export function paletteFromImage(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const side = 32;
        const c = document.createElement('canvas');
        c.width = c.height = side;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, side, side);
        const pal = dominantPalette(g.getImageData(0, 0, side, side).data);
        if (cache.size > 20) cache.clear();
        cache.set(url, pal);
        resolve(pal);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
