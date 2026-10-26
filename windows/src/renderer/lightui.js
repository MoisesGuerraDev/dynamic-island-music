// Controls of the lights: colors (automatic, rainbow, your own two) and, for the light inside the island and the light
// outside it, intensity, size and dance. Used by the little panel next to the pencil and by Settings › Estilo.

export const SWATCHES = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6', '#4D7CFF', '#5856D6', '#AF52DE', '#FF2D55', '#F2F2F7'];

export const SIZE_OPTIONS = [['s', 'Chico'], ['m', 'Mediano'], ['l', 'Grande']];
export const DANCE_OPTIONS = [['still', 'Quieto'], ['s', 'Chico'], ['m', 'Mediano'], ['l', 'Grande']];
export const DANCE_AMP = { still: 0, s: 0.55, m: 1, l: 1.7 };
export const SIZE_IN = { s: 0.75, m: 1, l: 1.4 };
export const SIZE_OUT = { s: 0.7, m: 1, l: 1.5 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function seg(key, options, cur) {
  return `<div class="lp-seg" role="group">${options.map(([v, l]) => `<button type="button" data-lp="seg" data-k="${key}" data-v="${v}" aria-pressed="${String(cur) === v}">${l}</button>`).join('')}</div>`;
}

function colorPick(label, key, cur) {
  const sw = SWATCHES.map((c) => `<button type="button" class="lp-sw${cur.toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-lp="swatch" data-k="${key}" data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  const dropper = typeof window !== 'undefined' && window.EyeDropper ? `<button type="button" class="lp-btn" data-lp="dropper" data-k="${key}" title="Gotero: toma un color de la pantalla">Gotero</button>` : '';
  return `<div class="lp-row col"><span>${label}</span><div class="lp-sws">${sw}<input type="color" class="lp-wheel" data-lp="wheel" data-k="${key}" value="${esc(cur)}" aria-label="Rueda de colores: ${label}">${dropper}</div></div>`;
}

function group(title, p, set) {
  return `<div class="lp-group"><b>${title}</b>
    <div class="lp-row"><span>Intensidad</span><span class="lp-rng"><input type="range" min="40" max="500" step="10" value="${set[p + 'LightIntensity']}" data-lp="range" data-k="${p}LightIntensity" aria-label="Intensidad: ${title}"><output>${set[p + 'LightIntensity']} %</output></span></div>
    <div class="lp-row"><span>Tamaño</span>${seg(p + 'LightSize', SIZE_OPTIONS, set[p + 'LightSize'])}</div>
    <div class="lp-row"><span>Baile</span>${seg(p + 'LightDance', DANCE_OPTIONS, set[p + 'LightDance'])}</div></div>`;
}

export function lightsHTML(set) {
  return `<div class="lp">
    <div class="lp-row"><span>Colores</span>${seg('colorMode', [['auto', 'Automático'], ['rainbow', 'Arcoíris'], ['custom', 'Mis colores']], set.colorMode)}</div>
    ${set.colorMode === 'custom' ? colorPick('Color 1', 'colorA', set.colorA) + colorPick('Color 2', 'colorB', set.colorB) : ''}
    ${group('Luz de adentro (isla abierta)', 'in', set)}
    ${group('Luz de afuera (isla cerrada y halo)', 'out', set)}
  </div>`;
}

/**
 * Wires the controls inside `root`. `patch(obj)` saves settings, `getSet()` returns them and `redraw()` draws the
 * controls again (not while a slider is being dragged). Safe to call again after a redraw of the same root.
 */
export function bindLights(root, { patch, getSet, redraw }) {
  root.__lights = { patch, getSet, redraw };
  if (root.__lightsBound) return;
  root.__lightsBound = true;

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-lp]');
    if (!t || !root.contains(t)) return;
    const { patch: pt, redraw: rd } = root.__lights;
    const kind = t.dataset.lp;
    if (kind === 'seg' || kind === 'swatch') {
      pt({ [t.dataset.k]: t.dataset.v });
      rd();
    } else if (kind === 'dropper' && window.EyeDropper) {
      try {
        const r = await new window.EyeDropper().open();
        pt({ [t.dataset.k]: r.sRGBHex.toUpperCase() });
        rd();
      } catch {
        /* cancelled */
      }
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.lp) return;
    const { patch: pt } = root.__lights;
    if (t.dataset.lp === 'range') {
      t.parentNode.querySelector('output').textContent = `${t.value} %`;
      pt({ [t.dataset.k]: Number(t.value) });
    } else if (t.dataset.lp === 'wheel') {
      pt({ [t.dataset.k]: t.value.toUpperCase() });
    }
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.lp === 'wheel') root.__lights.redraw();
  });
}

/** Sends the changes at most every 70 ms (a slider fires many times per second). */
export function throttledPatcher(send, ms = 70) {
  let pending = {};
  let timer = null;
  return (obj) => {
    Object.assign(pending, obj);
    if (timer) return;
    timer = setTimeout(() => {
      const out = pending;
      pending = {};
      timer = null;
      send(out);
    }, ms);
  };
}
