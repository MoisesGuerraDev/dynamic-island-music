// Edit mode: drag to reorder, pull the corner to resize, minus to remove, add from the bar, pages when it does not fit.
import { S, bus, comps, activeComps, metaOf, pages, userScale } from './state.js';
import { clampWidth, moveOnto, usage } from '../shared/layout.js';
import { ic } from './icons.js';

const dim = () => window.dim;

/** Saves a new component list: per screen when "remember per screen" is on, otherwise for all screens. */
export function setComps(list) {
  const s = S.set;
  if (s.rememberPerDisplay) {
    s.layoutsByDisplay = { ...(s.layoutsByDisplay || {}), [S.info.displayKey]: list };
    dim().settings.patch({ layoutsByDisplay: s.layoutsByDisplay });
  } else {
    s.components = list;
    dim().settings.patch({ components: list });
  }
}

export function editBarHTML() {
  const off = comps().filter((c) => !c.enabled);
  const u = usage(activeComps(), S.info.cap / userScale());
  const np = pages().length;
  const adds = off.length
    ? off.map((c) => `<button class="nbtn pbtn add" data-act="add-comp" data-k="${c.id}">${ic('plus')}${metaOf(c.id).name}</button>`).join('')
    : '<span class="eh">Ya están todos</span>';
  return `<span class="eh">Arrastra para ordenar. Tira de la esquina para cambiar el tamaño.</span>${np > 1 ? `<span class="eh warn">Aquí no caben todos: el resto pasa a la página 2.</span>` : ''}
    <span class="use${u > 100 ? ' over' : ''}" data-use><span class="track"><i style="width:${Math.min(100, u)}%"></i></span>Espacio ${(Math.round(u * 10) / 10).toFixed(1)}%</span>
    <span class="adds">${adds}</span>`;
}

function refreshUse(list) {
  const u = usage(list.filter((c) => c.enabled), S.info.cap / userScale());
  const el = document.querySelector('#editbar [data-use]');
  if (!el) return;
  el.classList.toggle('over', u > 100);
  el.querySelector('i').style.width = `${Math.min(100, u)}%`;
  el.lastChild.textContent = `Espacio ${(Math.round(u * 10) / 10).toFixed(1)}%`;
}

export function bindEdit(row) {
  if (!S.editing) return;
  let dragged = null;

  row.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragstart', (e) => {
      dragged = col.dataset.k;
      col.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', dragged);
      } catch {
        /* some engines need data to start a drag */
      }
    });
    col.addEventListener('dragend', () => {
      dragged = null;
      col.classList.remove('dragging');
      row.querySelectorAll('.dropt').forEach((o) => o.classList.remove('dropt'));
    });
    col.addEventListener('dragover', (e) => {
      if (!dragged) return;
      e.preventDefault();
      col.classList.add('dropt');
    });
    col.addEventListener('dragleave', () => col.classList.remove('dropt'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = col.dataset.k;
      if (dragged && dragged !== to) {
        setComps(moveOnto(comps(), dragged, to));
        bus.render();
      }
    });
  });

  row.querySelectorAll('[data-rz]').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
      const k = h.dataset.rz;
      const col = h.parentNode;
      const list = comps().map((c) => ({ ...c }));
      const item = list.find((c) => c.id === k);
      const x0 = e.clientX;
      const w0 = item.width;
      const sc = row.getBoundingClientRect().width / row.offsetWidth || 1;
      col.draggable = false;
      const move = (ev) => {
        item.width = clampWidth(k, w0 + (ev.clientX - x0) / sc);
        col.style.flex = `${item.width} 1 ${item.width}px`;
        refreshUse(list);
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        setComps(list);
        bus.render();
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
  });
}
