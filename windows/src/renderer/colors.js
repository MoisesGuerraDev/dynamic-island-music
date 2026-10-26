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

const cache = new Map();

/** Loads the cover (data URL) and returns a palette, or null if it cannot be read. */
export function paletteFromImage(url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const side = 24;
        const c = document.createElement('canvas');
        c.width = c.height = side;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, side, side);
        const pal = paletteFromRgb(vibrantFromPixels(g.getImageData(0, 0, side, side).data));
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
