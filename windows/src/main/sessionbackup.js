import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FILE_NAME, decryptSession, domainAllowed, encryptSession, toEntry, toRestorable } from '../shared/sessionfile.js';

const SAVE_DELAY = 20_000;
const START_DELAY = 3_000;

/**
 * Saved sessions: the AI sign-ins in an encrypted file, saved by itself and restored if the app starts with no AI
 * sign-in. By default it lives in the app's own folder and is encrypted with a key that Windows keeps for this user
 * (safeStorage). Optionally: another folder (Documents, a USB drive, OneDrive...) and an own password, so the file
 * opens on another computer.
 */
export class SessionBackup {
  constructor({ aiSession, store, secrets, userData, onRestored }) {
    this.aiSession = aiSession;
    this.store = store;
    this.secrets = secrets;
    this.defaultFolder = path.join(userData, 'Sesiones');
    this.onRestored = onRestored; // called after cookies were put back, so the pages reload
    this.timer = null;
    this.startTimer = null;
  }

  folder() {
    const f = String(this.store.get('sessionBackupFolder') || '').trim();
    return f || this.defaultFolder;
  }

  file() {
    return path.join(this.folder(), FILE_NAME);
  }

  hasOwnPassword() {
    return this.secrets.has('session.password');
  }

  info() {
    let saved = null;
    try {
      saved = fs.statSync(this.file()).mtimeMs;
    } catch {
      /* no copy yet */
    }
    return {
      folder: this.folder(),
      isDefault: this.folder() === this.defaultFolder,
      file: this.file(),
      exists: saved !== null,
      savedAt: saved,
      ownPassword: this.hasOwnPassword(),
      encryption: this.secrets.available(),
    };
  }

  /** The password that opens the file: the person's own one, or the key generated for this PC. null if there is none. */
  #password({ create }) {
    if (this.hasOwnPassword()) return this.secrets.get('session.password') || null;
    if (!this.secrets.has('session.autokey')) {
      if (!create) return null;
      this.secrets.set('session.autokey', crypto.randomBytes(32).toString('base64')); // throws if the system cannot encrypt it
    }
    return this.secrets.get('session.autokey') || null;
  }

  start() {
    this.aiSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
      if (!this.store.get('sessionBackupAuto') || !domainAllowed(cookie && cookie.domain)) return;
      if (removed && cookie.session) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.save().catch(() => {}), SAVE_DELAY);
    });
    this.startTimer = setTimeout(() => this.restoreIfEmpty().catch(() => {}), START_DELAY);
  }

  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.startTimer);
  }

  async #aiCookies() {
    const all = await this.aiSession.cookies.get({});
    return all.filter((c) => domainAllowed(c.domain));
  }

  /** Saves the sign-ins now. Returns { ok, message }. */
  async save() {
    let password;
    try {
      password = this.#password({ create: true });
    } catch {
      return { ok: false, message: 'Windows no pudo guardar la clave de la copia en este equipo, así que no se guardó.' };
    }
    if (!password) return { ok: false, message: 'No pude leer la clave de la copia.' };
    const entries = (await this.#aiCookies()).map(toEntry).filter(Boolean);
    if (!entries.length) return { ok: false, message: 'Todavía no hay inicios de sesión de las IA que guardar.' };
    try {
      fs.mkdirSync(this.folder(), { recursive: true });
      const tmp = `${this.file()}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, encryptSession(entries, password));
      fs.renameSync(tmp, this.file());
    } catch (err) {
      return { ok: false, message: `No pude escribir la copia en esa carpeta (${err.code || err.message}).` };
    }
    return { ok: true, message: `Copia guardada (${entries.length} cookies de las IA).` };
  }

  /** Puts the saved sign-ins back. Returns { ok, message }. */
  async restore() {
    let buf;
    try {
      buf = fs.readFileSync(this.file());
    } catch {
      return { ok: false, message: 'No hay ninguna copia en esa carpeta.' };
    }
    const password = this.#password({ create: false });
    const hint = 'No pude leer la copia. Si viene de otra computadora, escribe la misma contraseña propia.';
    if (!password) return { ok: false, message: hint };
    let list;
    try {
      list = decryptSession(buf, password);
    } catch (err) {
      return { ok: false, message: err.message === 'formato' ? 'Ese archivo no es una copia de Dynamic Island Music.' : hint };
    }
    let n = 0;
    for (const d of toRestorable(list)) {
      try {
        await this.aiSession.cookies.set(d);
        n++;
      } catch {
        /* a cookie the browser refuses: skip it */
      }
    }
    if (n && this.onRestored) this.onRestored();
    return { ok: n > 0, message: n ? `Sesiones restauradas (${n} cookies de las IA).` : 'La copia no tenía sesiones vigentes.' };
  }

  /** At start: no AI sign-in in the session (new install or erased data) and there is a copy: put it back. */
  async restoreIfEmpty() {
    if ((await this.#aiCookies()).length > 0) return { ok: false, message: 'Ya hay sesiones.' };
    if (!fs.existsSync(this.file())) return { ok: false, message: 'Sin copia.' };
    return this.restore();
  }

  /** Deletes the saved file (used when the person signs out of every AI). */
  deleteCopy() {
    clearTimeout(this.timer);
    try {
      fs.rmSync(this.file(), { force: true });
    } catch {
      /* nothing to delete */
    }
  }

  setOwnPassword(pw) {
    const v = String(pw ?? '');
    if (v.length < 4) return { ok: false, message: 'Usa una contraseña de al menos 4 caracteres.' };
    this.secrets.set('session.password', v);
    return { ok: true, message: 'Contraseña propia guardada. Se usará en la próxima copia.' };
  }

  clearOwnPassword() {
    this.secrets.delete('session.password');
    return { ok: true, message: 'Se vuelve a usar la clave automática de este PC.' };
  }
}
