import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DebouncedJson } from './fsutil.js';

/** Tray: files dropped on the island wait here until used. They are references, the files are not copied. */
export class Shelf extends EventEmitter {
  constructor({ file }) {
    super();
    this.json = new DebouncedJson(file, 400);
    const saved = this.json.read([]);
    this.items = Array.isArray(saved) ? saved.filter((i) => i && typeof i.path === 'string' && typeof i.id === 'string').slice(0, 200) : [];
  }

  list() {
    return this.items.map((i) => ({ id: i.id, name: i.name, ext: i.ext, addedAt: i.addedAt, missing: !fs.existsSync(i.path) }));
  }

  add(paths) {
    let added = 0;
    for (const p of Array.isArray(paths) ? paths : []) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) continue;
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (this.items.some((i) => i.path === p)) continue;
      const ext = path.extname(p).replace('.', '').toLowerCase().slice(0, 5) || (st.isDirectory() ? 'dir' : 'file');
      this.items.unshift({ id: crypto.randomUUID(), path: p, name: path.basename(p), ext, addedAt: Date.now() });
      added++;
    }
    if (added) this.#changed();
    return added;
  }

  pathOf(id) {
    return this.items.find((i) => i.id === id)?.path ?? null;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length !== before) this.#changed();
  }

  clear() {
    this.items = [];
    this.#changed();
  }

  #changed() {
    this.json.save(this.items);
    this.emit('change');
  }

  flush() {
    this.json.flush();
  }
}
