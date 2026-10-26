import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { DebouncedJson } from './fsutil.js';
import { MAC_SECRET_FORMATS, WIN_SECRET_FORMATS, classifyText, isIgnoredApp, looksSecret } from '../shared/secret-detect.js';

/**
 * Clipboard history. It never keeps what looks secret:
 * password managers (by the flags they set and by app name), and anything shaped like a key or token.
 * Text is saved to disk only if the person leaves that on; images stay in memory.
 */
export class ClipboardHistory extends EventEmitter {
  constructor({ store, clipboard, nativeImage, ClipboardItem, file, getForeground }) {
    super();
    this.store = store;
    this.clipboard = clipboard;
    this.nativeImage = nativeImage;
    this.ClipboardItem = ClipboardItem;
    this.getForeground = getForeground || (async () => ({ name: '' }));
    this.json = new DebouncedJson(file, 800);
    this.items = [];
    this.images = new Map(); // id -> { buf, mime } (memory only)
    this.timer = null;
    this.lastSig = '';
    this.imageTick = 0;
    this.busy = false;
    this.lastPrune = 0;
    if (store.get('clipPersist')) {
      const saved = this.json.read([]);
      if (Array.isArray(saved)) this.items = saved.filter((i) => i && typeof i.text === 'string' && i.kind !== 'image').slice(0, 500);
      this.#prune();
    }
  }

  async start() {
    if (this.timer) return;
    this.lastSig = (await this.#signature()).sig; // what is already on the clipboard at start is not "new"
    this.timer = setInterval(() => this.poll(), 700);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.store.get('clipPersist')) this.json.remove();
    else this.json.flush();
  }

  list() {
    return this.items;
  }

  /** True when the clipboard carries a raw platform format (Windows: the flags password managers set). */
  async #has(format) {
    try {
      return !!(await this.clipboard.has(`electron application/osclipboard;format="${format}"`));
    } catch {
      return false;
    }
  }

  async #signature() {
    let text = '';
    try {
      text = await this.clipboard.readText();
    } catch {
      /* clipboard busy */
    }
    if (text) return { sig: `t:${text}`, text };
    try {
      const items = await this.clipboard.read();
      for (const item of items) {
        const mime = item.types.find((t) => t === 'image/png') || item.types.find((t) => t.startsWith('image/'));
        if (!mime) continue;
        const blob = await item.getType(mime);
        const buf = Buffer.from(await blob.arrayBuffer());
        return { sig: `i:${crypto.createHash('md5').update(buf).digest('hex')}`, imageBuf: buf, mime };
      }
      return { sig: `f:${items.flatMap((i) => i.types).join(',')}` };
    } catch {
      return { sig: 'f:' };
    }
  }

  async poll() {
    if (this.busy) return;
    const now = Date.now();
    if (now - this.lastPrune > 60_000) {
      this.lastPrune = now;
      if (this.#prune()) this.#changed();
    }
    if (!this.store.get('clipEnabled') || this.store.get('clipPaused')) {
      this.lastSig = (await this.#signature()).sig;
      return;
    }
    // A big picture is hashed in full: check it less often while it stays on the clipboard.
    if (this.lastSig.startsWith('i:') && ++this.imageTick % 3 !== 0) return;
    this.busy = true;
    try {
      const cur = await this.#signature();
      if (cur.sig === this.lastSig) return;
      this.lastSig = cur.sig;

      const secretFormats = [...WIN_SECRET_FORMATS, ...MAC_SECRET_FORMATS];
      for (const f of secretFormats) if (await this.#has(f)) return;

      let appName = '';
      try {
        appName = (await this.getForeground()).name || '';
      } catch {
        /* unknown app */
      }
      if (isIgnoredApp(appName, this.store.get('clipIgnoredApps'))) return;

      if (cur.text !== undefined) {
        const t = cur.text.trim();
        if (!t) return;
        if (this.store.get('clipIgnoreSecrets') && looksSecret(t)) return;
        const kind = classifyText(t);
        const item = { id: crypto.randomUUID(), kind, text: t.slice(0, 2000), date: Date.now(), app: appName };
        this.items = this.items.filter((i) => !(i.kind === kind && i.text === item.text));
        this.#add(item);
      } else if (cur.imageBuf) {
        const img = this.nativeImage.createFromBuffer(cur.imageBuf);
        if (img.isEmpty()) return;
        const { width, height } = img.getSize();
        const thumb = img.resize({ width: Math.min(240, width) }).toDataURL();
        const item = { id: crypto.randomUUID(), kind: 'image', text: `Imagen ${width} × ${height}`, thumb, date: Date.now(), app: appName };
        this.images.set(item.id, { buf: cur.imageBuf, mime: cur.mime });
        this.#add(item);
        const keep = new Set(this.items.filter((i) => i.kind === 'image').slice(0, 8).map((i) => i.id));
        for (const id of [...this.images.keys()]) if (!keep.has(id)) this.images.delete(id);
      }
    } finally {
      this.busy = false;
    }
  }

  #add(item) {
    this.items.unshift(item);
    this.#prune();
    this.#changed();
    this.emit('toast', item);
  }

  #prune() {
    let changed = false;
    const max = Math.max(5, this.store.get('clipMax'));
    if (this.items.length > max) {
      this.items = this.items.slice(0, max);
      changed = true;
    }
    const days = this.store.get('clipAutoDeleteDays');
    if (days > 0) {
      const before = this.items.length;
      this.items = this.items.filter((i) => Date.now() - i.date < days * 86_400_000);
      changed = changed || this.items.length !== before;
    }
    return changed;
  }

  #changed() {
    if (this.store.get('clipPersist')) this.json.save(this.items.filter((i) => i.kind !== 'image'));
    this.emit('change', this.items);
  }

  async copy(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    if (item.kind === 'image') {
      const img = this.images.get(id);
      if (!img) return false;
      await this.clipboard.write([new this.ClipboardItem({ [img.mime]: new Blob([img.buf], { type: img.mime }) })]);
    } else {
      await this.clipboard.writeText(item.text);
    }
    this.lastSig = (await this.#signature()).sig; // our own write is not a new copy
    return true;
  }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.images.delete(id);
    this.#changed();
  }

  clear() {
    this.items = [];
    this.images.clear();
    this.#changed();
  }

  /** Called when settings change (max items, persistence, days). */
  settingsChanged() {
    if (this.store.get('clipPersist')) this.json.save(this.items.filter((i) => i.kind !== 'image'));
    else this.json.remove();
    if (this.#prune()) this.#changed();
  }
}
