import { safeStorage } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './fsutil.js';

/**
 * API keys, encrypted with Electron's safeStorage (Windows DPAPI: only this Windows user can decrypt them).
 * They live in their own file, never in settings.json, and are only decrypted in the main process.
 * If the system cannot encrypt, nothing is stored: a key is never written as plain text.
 */
export class Secrets {
  constructor(file, { testMode = false } = {}) {
    this.file = file;
    this.data = readJsonSync(file, {});
    // Only for automated tests on a machine without a keychain. Never enabled in the packaged app.
    this.testMode = testMode;
  }

  available() {
    return this.testMode || safeStorage.isEncryptionAvailable();
  }

  has(name) {
    return typeof this.data[name] === 'string' && this.data[name].length > 0;
  }

  get(name) {
    const enc = this.data[name];
    if (!enc) return '';
    try {
      const buf = Buffer.from(enc, 'base64');
      return this.testMode ? buf.toString('utf8') : safeStorage.decryptString(buf);
    } catch {
      return '';
    }
  }

  set(name, value) {
    const v = String(value ?? '').trim();
    if (!v) return this.delete(name);
    if (!this.available()) {
      throw new Error('Windows no pudo cifrar la clave en este equipo, así que no se guardó.');
    }
    const buf = this.testMode ? Buffer.from(v, 'utf8') : safeStorage.encryptString(v);
    this.data[name] = buf.toString('base64');
    writeJsonAtomicSync(this.file, this.data);
  }

  delete(name) {
    if (name in this.data) {
      delete this.data[name];
      writeJsonAtomicSync(this.file, this.data);
    }
  }
}
