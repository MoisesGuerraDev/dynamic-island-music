// Liquid Glass refraction for the small controls: each element gets an SVG filter built from a displacement map
// shaped like a rounded lens, with a slight color split at the edge. Same as the design mockup.

const SVG = 'http://www.w3.org/2000/svg';
const lqMap = {};
const lqFlt = {};
let lqN = 0;

function ns(tag, at) {
  const e = document.createElementNS(SVG, tag);
  for (const k in at) e.setAttribute(k, at[k]);
  return e;
}

function lensURL(w, h, r, bz) {
  const key = `${w}x${h}x${r}x${bz}`;
  if (lqMap[key]) return lqMap[key];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const im = g.createImageData(w, h);
  const d = im.data;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = i + 0.5 - w / 2, py = j + 0.5 - h / 2;
      const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const o = (j * w + i) * 4;
      let vx = 0, vy = 0;
      const depth = -(Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r);
      if (depth >= 0 && depth < bz) {
        const t = 1 - depth / bz, m = Math.pow(t, 1.8);
        let nx, ny;
        if (ox > 0 || oy > 0) {
          const l = Math.sqrt(ox * ox + oy * oy) || 1;
          nx = Math.sign(px) * ox / l;
          ny = Math.sign(py) * oy / l;
        } else if (qx > qy) { nx = Math.sign(px); ny = 0; } else { nx = 0; ny = Math.sign(py); }
        vx = nx * m;
        vy = ny * m;
      }
      d[o] = Math.round(128 + vx * 127);
      d[o + 1] = Math.round(128 + vy * 127);
      d[o + 2] = 128;
      d[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  lqMap[key] = c.toDataURL();
  return lqMap[key];
}

function mkFilter(w, h, r, bz, sc) {
  const key = [w, h, r, bz, sc].join('_');
  if (lqFlt[key]) return lqFlt[key];
  const id = `lq${++lqN}`;
  const f = w * h > 120000 ? 4 : 1;
  const url = lensURL(Math.ceil(w / f), Math.ceil(h / f), r / f, bz / f);
  const F = ns('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  const im = ns('feImage', { x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'm' });
  im.setAttribute('href', url);
  F.appendChild(im);
  F.appendChild(ns('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.1', result: 'b' }));
  [['r', 1, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['g', 0.88, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'], ['b', 0.76, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0']].forEach((c) => {
    F.appendChild(ns('feDisplacementMap', { in: 'b', in2: 'm', scale: String(sc * c[1]), xChannelSelector: 'R', yChannelSelector: 'G', result: `d${c[0]}` }));
    F.appendChild(ns('feColorMatrix', { in: `d${c[0]}`, type: 'matrix', values: c[2], result: `c${c[0]}` }));
  });
  F.appendChild(ns('feBlend', { in: 'cr', in2: 'cg', mode: 'screen', result: 'rg' }));
  F.appendChild(ns('feBlend', { in: 'rg', in2: 'cb', mode: 'screen', result: 'rgb' }));
  F.appendChild(ns('feColorMatrix', { in: 'rgb', type: 'saturate', values: '1.5', result: 'sat' }));
  const ct = ns('feComponentTransfer', { in: 'sat' });
  ['feFuncR', 'feFuncG', 'feFuncB'].forEach((t) => ct.appendChild(ns(t, { type: 'linear', slope: '1.22', intercept: '0.03' })));
  F.appendChild(ct);
  document.getElementById('lqdefs').appendChild(F);
  lqFlt[key] = id;
  return id;
}

function lensify(el) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w < 18 || h < 18) return;
  const cs = getComputedStyle(el);
  const rs = cs.borderBottomLeftRadius;
  let rr = Math.max(parseFloat(cs.borderTopLeftRadius) || 0, parseFloat(rs) || 0);
  if (rs.indexOf('%') > -1) rr = Math.min(w, h) / 2;
  const r = Math.min(rr, w / 2, h / 2), m = Math.min(w, h);
  const bz = Math.max(6, Math.min(m * 0.42, 26)), sc = Math.min(34, 10 + m * 0.5);
  const key = `${w}_${h}_${Math.round(r)}`;
  if (el.__lq === key) return;
  el.__lq = key;
  el.style.backdropFilter = `url(#${mkFilter(w, h, Math.round(r), Math.round(bz), Math.round(sc))})`;
}

const SELECTORS = '.notch .tab,.notch .round,.notch .pill,.notch .nbtn,.notch .plus,.notch .pv,.notch .ci,.notch .file,.notch .drop,.notch .chatf button,.notch .chatf input,.gcard';

let enabled = true;
let raf = 0;

function lensAll() {
  if (!(window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'url(#x)'))) return;
  document.querySelectorAll(SELECTORS).forEach((el) => {
    if (enabled) lensify(el);
    else if (el.__lq) {
      el.style.backdropFilter = '';
      el.__lq = null;
    }
  });
}

export function lensSoon() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    lensAll();
  });
}

export function setLensEnabled(on) {
  enabled = !!on;
  lensSoon();
}

export function startLens(root) {
  new MutationObserver(lensSoon).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'hidden'] });
  window.addEventListener('resize', lensSoon);
  lensSoon();
}
