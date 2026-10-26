import crypto from 'node:crypto';
import { readJsonSync, writeJsonAtomicSync } from './fsutil.js';

// The app's own PIN for the AI chat lock (4 to 8 digits). It is never stored: only a salted scrypt hash is.
// Wrong guesses are limited: after 5 in a row there is a wait that doubles each time (30 s, 1 min, 2 min... up to 15 min),
// and the count survives closing the app.

export const MAX_FAILS = 5;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function validPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

/** Seconds of waiting after the n-th lockout. */
export function lockoutSeconds(n) {
  return Math.min(900, 30 * 2 ** Math.max(0, n - 1));
}

function derive(pin, salt) {
  return crypto.scryptSync(pin, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
}

export class PinVault {
  constructor(file, now = () => Date.now()) {
    this.file = file;
    this.now = now;
    this.data = readJsonSync(file, {});
  }

  #save() {
    writeJsonAtomicSync(this.file, this.data);
  }

  isSet() {
    return typeof this.data.hash === 'string' && typeof this.data.salt === 'string';
  }

  /** Seconds left of the current wait, 0 when guesses are allowed. */
  retryIn() {
    const left = Math.ceil(((this.data.until || 0) - this.now()) / 1000);
    return left > 0 ? left : 0;
  }

  /** Sets a PIN (the first time) or replaces it. Callers must have checked the old PIN before replacing. */
  set(pin) {
    if (!validPin(pin)) return { ok: false, error: 'El PIN debe tener de 4 a 8 dígitos.' };
    const salt = crypto.randomBytes(16);
    this.data = { salt: salt.toString('base64'), hash: derive(pin, salt).toString('base64'), n: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, fails: 0, lockouts: 0, until: 0 };
    this.#save();
    return { ok: true };
  }

  verify(pin) {
    if (!this.isSet()) return { ok: false, error: 'No hay PIN.' };
    const wait = this.retryIn();
    if (wait > 0) return { ok: false, retryIn: wait };
    if (!validPin(pin)) return this.#fail();
    const expected = Buffer.from(this.data.hash, 'base64');
    const got = derive(pin, Buffer.from(this.data.salt, 'base64'));
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) {
      this.data.fails = 0;
      this.data.lockouts = 0;
      this.data.until = 0;
      this.#save();
      return { ok: true };
    }
    return this.#fail();
  }

  #fail() {
    this.data.fails = (this.data.fails || 0) + 1;
    let retryIn = 0;
    if (this.data.fails >= MAX_FAILS) {
      this.data.lockouts = (this.data.lockouts || 0) + 1;
      retryIn = lockoutSeconds(this.data.lockouts);
      this.data.until = this.now() + retryIn * 1000;
      this.data.fails = 0;
    }
    this.#save();
    return { ok: false, attemptsLeft: retryIn ? 0 : MAX_FAILS - this.data.fails, retryIn };
  }

  change(oldPin, newPin) {
    if (!validPin(newPin)) return { ok: false, error: 'El PIN nuevo debe tener de 4 a 8 dígitos.' };
    const v = this.verify(oldPin);
    return v.ok ? this.set(newPin) : v;
  }

  remove(pin) {
    const v = this.verify(pin);
    if (!v.ok) return v;
    this.data = {};
    this.#save();
    return { ok: true };
  }
}
