// Layout rules of the open island, from the mockup and from LayoutManager.swift:
// - the open width is capped at about 72 % of the screen width (never more than 1300),
// - every component has a minimum width and is never squeezed below it,
// - components that do not fit go to extra pages (dots) instead of being squeezed.

import { SIDE_PADDING, COMPONENT_META, MAX_COMPONENT_WIDTH } from './defaults.js';

export function capWidth(screenWidth, manual = false, manualWidth = 900) {
  if (manual) return Math.max(560, Math.min(2400, Math.round(manualWidth)));
  return Math.min(Math.round(screenWidth * 0.72), 1300);
}

/** Splits the enabled components into pages that fit inside `cap`. */
export function paginate(active, cap) {
  const room = cap - 2 * SIDE_PADDING;
  const pages = [];
  let cur = [];
  let sum = 0;
  for (const c of active) {
    if (cur.length && sum + c.width > room) {
      pages.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(c);
    sum += c.width;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** Width the open island needs for a page. */
export function openWidth(page, cap) {
  const sum = page.reduce((s, c) => s + c.width, 0) + 2 * SIDE_PADDING;
  return Math.max(560, Math.min(cap, sum));
}

/** Share of the cap used by all enabled components, in percent (can pass 100). */
export function usage(active, cap) {
  if (!active.length) return 0;
  const sum = active.reduce((s, c) => s + c.width, 0) + 2 * SIDE_PADDING;
  return (sum / cap) * 100;
}

export function clampWidth(id, width) {
  const meta = COMPONENT_META[id];
  return Math.round(Math.max(meta.min, Math.min(MAX_COMPONENT_WIDTH, width)));
}

/** Moves `id` so it ends up in the slot `target` had (drag one chip onto another). */
export function moveOnto(list, id, target) {
  const from = list.findIndex((c) => c.id === id);
  const to = list.findIndex((c) => c.id === target);
  if (from < 0 || to < 0 || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Key that identifies a display for "remember per screen". */
export function displayKey(d) {
  return `${d.size.width}x${d.size.height}@${d.scaleFactor}`;
}
