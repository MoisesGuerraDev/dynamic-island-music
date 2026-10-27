import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeFileName, newBody, parseNote, toggleContent } from '../shared/notes-md.js';

/**
 * Notes and tasks as plain Markdown files, one file per note, in a folder the person chooses.
 * A folder inside iCloud Drive (iCloud for Windows) or any synced folder keeps them in step with other devices.
 */
export class Notes extends EventEmitter {
  constructor({ store, defaultFolder, trash }) {
    super();
    this.store = store;
    this.defaultFolder = defaultFolder;
    this.trash = trash; // async (path) => void, moves a file to the Recycle Bin
    this.items = [];
    this.timer = null;
    this.lastSig = '';
  }

  folder() {
    const f = String(this.store.get('notesFolder') || '').trim();
    return f || this.defaultFolder;
  }

  #ensureFolder() {
    const f = this.folder();
    try {
      fs.mkdirSync(f, { recursive: true });
      return f;
    } catch {
      // The chosen folder is gone (a drive that is not connected, for example): use the local one.
      fs.mkdirSync(this.defaultFolder, { recursive: true });
      return this.defaultFolder;
    }
  }

  info() {
    const f = this.folder();
    const lower = f.toLowerCase();
    const isICloud = lower.includes('iclouddrive') || lower.includes('mobile documents');
    const home = os.homedir();
    const parts = f.split(/[\\/]/);
    const at = parts.findIndex((p) => p.toLowerCase() === 'iclouddrive');
    const display = isICloud
      ? at >= 0
        ? 'iCloud Drive' + parts.slice(at + 1).filter(Boolean).map((p) => ` › ${p}`).join('')
        : 'iCloud'
      : f.startsWith(home)
        ? `~${f.slice(home.length)}`
        : f;
    let exists = true;
    try {
      exists = fs.statSync(f).isDirectory();
    } catch {
      exists = false;
    }
    return {
      folder: f,
      display,
      isDefault: f === this.defaultFolder,
      isICloud,
      exists,
      status: !exists ? 'La carpeta no está disponible. Se usa la carpeta local.' : isICloud ? 'Se sincroniza con iCloud Drive' : 'Guardadas en esta carpeta de tu PC',
      iCloudGuess: this.#iCloudGuess(),
    };
  }

  #iCloudGuess() {
    const c = path.join(os.homedir(), 'iCloudDrive');
    try {
      return fs.statSync(c).isDirectory() ? c : '';
    } catch {
      return '';
    }
  }

  start() {
    this.reload();
    this.timer = setInterval(() => this.reload(), 8000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  list() {
    return this.items;
  }

  reload() {
    const dir = this.#ensureFolder();
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('.'));
    } catch {
      names = [];
    }
    const rows = [];
    for (const name of names) {
      try {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        rows.push({ name, full, st });
      } catch {
        /* a file that changed while we looked */
      }
    }
    rows.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    const items = [];
    for (const r of rows.slice(0, 300)) {
      try {
        const content = fs.readFileSync(r.full, 'utf8');
        const p = parseNote(content);
        items.push({ id: r.name, text: p.text, isTask: p.isTask, done: p.done, created: Math.round(r.st.birthtimeMs || r.st.mtimeMs), due: p.due, lead: p.lead });
      } catch {
        /* unreadable (still downloading from iCloud, for example) */
      }
    }
    items.sort((a, b) => b.created - a.created);
    const sig = JSON.stringify(items);
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.items = items;
      this.emit('change');
    }
  }

  /** remind: { date: 'YYYY-MM-DD', time: 'HH:MM', lead: minutes } for a task that should warn before, or null. */
  add(text, task = true, remind = null) {
    const clean = String(text ?? '').trim().slice(0, 4000);
    if (!clean) return null;
    const dir = this.#ensureFolder();
    let name = makeFileName(clean);
    let n = 1;
    while (fs.existsSync(path.join(dir, name))) name = makeFileName(clean).replace(/\.md$/, `-${++n}.md`);
    const r = remind && /^\d{4}-\d{2}-\d{2}$/.test(remind.date || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(remind.time || '') ? remind : null;
    fs.writeFileSync(path.join(dir, name), newBody(clean, task, r), 'utf8');
    this.reload();
    return name;
  }

  #safe(id) {
    const name = String(id ?? '');
    if (path.basename(name) !== name || !name.toLowerCase().endsWith('.md')) return null;
    return path.join(this.folder(), name);
  }

  toggle(id) {
    const file = this.#safe(id);
    if (!file) return;
    try {
      const content = fs.readFileSync(file, 'utf8');
      const next = toggleContent(content);
      if (next !== content) fs.writeFileSync(file, next, 'utf8');
    } catch {
      /* gone */
    }
    this.reload();
  }

  async remove(id) {
    const file = this.#safe(id);
    if (!file) return;
    try {
      await this.trash(file);
    } catch {
      fs.rmSync(file, { force: true });
    }
    this.reload();
  }

  async removeAll() {
    for (const i of [...this.items]) await this.remove(i.id);
  }
}
