import { EventEmitter } from 'node:events';
import { DEFAULTS, clone, normalizeSettings } from '../shared/defaults.js';
import { DebouncedJson } from './fsutil.js';

function sameType(a, b) {
  if (Array.isArray(a)) return Array.isArray(b);
  if (a && typeof a === 'object') return !!b && typeof b === 'object' && !Array.isArray(b);
  return typeof a === typeof b;
}

/** Settings kept in one JSON file. Unknown keys and wrong types are rejected, so the page cannot write junk. */
export class Store extends EventEmitter {
  constructor(file) {
    super();
    this.json = new DebouncedJson(file, 300);
    this.data = normalizeSettings(this.json.read({}));
  }

  all() {
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    return this.patch({ [key]: value });
  }

  /** Applies several keys, saves, and emits "change" with only what really changed. */
  patch(obj) {
    const changed = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (!(k in DEFAULTS)) continue;
      if (!sameType(DEFAULTS[k], v)) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (JSON.stringify(this.data[k]) === JSON.stringify(v)) continue;
      this.data[k] = clone(v);
      changed[k] = clone(v);
    }
    if (Object.keys(changed).length) {
      if ('components' in changed || 'aiEnabled' in changed) {
        const fixed = normalizeSettings(this.data);
        this.data.components = fixed.components;
        this.data.aiEnabled = fixed.aiEnabled;
        if ('components' in changed) changed.components = clone(this.data.components);
        if ('aiEnabled' in changed) changed.aiEnabled = clone(this.data.aiEnabled);
      }
      this.json.save(this.data);
      this.emit('change', changed, this.data);
    }
    return changed;
  }

  reset() {
    const changed = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (JSON.stringify(this.data[k]) !== JSON.stringify(DEFAULTS[k])) changed[k] = clone(DEFAULTS[k]);
    }
    this.data = normalizeSettings({});
    this.json.save(this.data);
    this.emit('change', changed, this.data);
  }

  flush() {
    this.json.save(this.data);
    this.json.flush();
  }
}
