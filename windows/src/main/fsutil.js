import fs from 'node:fs';
import path from 'node:path';

export function readJsonSync(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      // Keep the unreadable file so nothing is lost, then start clean.
      try {
        fs.renameSync(file, `${file}.bad-${Date.now()}`);
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}

/** Writes through a temp file so a crash never leaves half a JSON file behind. */
export function writeJsonAtomicSync(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** A JSON file that saves a moment after the last change. */
export class DebouncedJson {
  constructor(file, delay = 400) {
    this.file = file;
    this.delay = delay;
    this.timer = null;
    this.pending = undefined;
  }

  read(fallback) {
    return readJsonSync(this.file, fallback);
  }

  save(data) {
    this.pending = data;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.pending === undefined) return;
    const data = this.pending;
    this.pending = undefined;
    try {
      writeJsonAtomicSync(this.file, data);
    } catch (err) {
      console.error('No se pudo guardar', this.file, err);
    }
  }

  remove() {
    clearTimeout(this.timer);
    this.pending = undefined;
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}
