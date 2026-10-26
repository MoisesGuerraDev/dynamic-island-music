// "Sesiones guardadas": the sign-ins of the AI sites in one encrypted file, Sesiones-IA.dimsession.
// The format is the same on Mac and Windows, so a file made on one opens on the other:
//
//   "DIMS1" (5 bytes ASCII) + salt (16 random bytes) + nonce (12 bytes) + cipher text + GCM tag (16 bytes)
//   key   = PBKDF2-HMAC-SHA256(password as UTF-8, salt, 200000 iterations, 32 bytes)
//   cipher = AES-256-GCM, no additional data
//   plain text = JSON array of { name, value, domain, path, secure, httpOnly, expires?, sameSite? }
//   (expires = Unix seconds; no expires = session cookie)
//
// Only cookies of the AI sites are saved. Passwords never pass through here.
import crypto from 'node:crypto';

export const FILE_NAME = 'Sesiones-IA.dimsession';
export const MAGIC = Buffer.from('DIMS1', 'ascii');
const SALT = 16;
const NONCE = 12;
const TAG = 16;
const ITERATIONS = 200_000;

export const AI_DOMAINS = ['claude.ai', 'anthropic.com', 'chatgpt.com', 'openai.com', 'deepseek.com', 'google.com'];

/** True for a cookie domain that is one of the AI sites or a subdomain of one. */
export function domainAllowed(domain) {
  const d = String(domain || '').replace(/^\./, '').toLowerCase();
  return !!d && AI_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`));
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, ITERATIONS, 32, 'sha256');
}

export function encryptSession(cookies, password) {
  const salt = crypto.randomBytes(SALT);
  const nonce = crypto.randomBytes(NONCE);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), nonce);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(cookies), 'utf8')), cipher.final()]);
  return Buffer.concat([MAGIC, salt, nonce, ct, cipher.getAuthTag()]);
}

/** Returns the cookie list, or throws an Error whose message is 'formato' (not our file) or 'clave' (wrong password or damaged). */
export function decryptSession(buf, password) {
  if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length + SALT + NONCE + TAG || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('formato');
  }
  const salt = buf.subarray(5, 5 + SALT);
  const nonce = buf.subarray(5 + SALT, 5 + SALT + NONCE);
  const tag = buf.subarray(buf.length - TAG);
  const ct = buf.subarray(5 + SALT + NONCE, buf.length - TAG);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), nonce);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    const list = JSON.parse(plain);
    if (!Array.isArray(list)) throw new Error('formato');
    return list;
  } catch {
    throw new Error('clave');
  }
}

// --- Electron cookie <-> file entry ---

const SAMESITE_OUT = { lax: 'lax', strict: 'strict', no_restriction: 'none' };
const SAMESITE_IN = { lax: 'lax', strict: 'strict', none: 'no_restriction', no_restriction: 'no_restriction', unspecified: 'unspecified' };

/** Electron cookie -> entry of the file. Only the AI sites are kept. */
export function toEntry(c) {
  if (!c || !domainAllowed(c.domain) || typeof c.name !== 'string') return null;
  const e = { name: c.name, value: String(c.value ?? ''), domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly };
  if (typeof c.expirationDate === 'number' && c.session !== true) e.expires = Math.floor(c.expirationDate);
  const ss = SAMESITE_OUT[c.sameSite];
  if (ss) e.sameSite = ss;
  return e;
}

/** Entries to put back: skips expired ones and domains outside the list. Returns details for session.cookies.set(). */
export function toRestorable(list, nowSeconds = Math.floor(Date.now() / 1000)) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.name !== 'string' || typeof e.domain !== 'string' || !domainAllowed(e.domain)) continue;
    if (typeof e.expires === 'number' && e.expires <= nowSeconds) continue;
    const host = e.domain.replace(/^\./, '');
    const path = e.path || '/';
    const d = { url: `http${e.secure ? 's' : ''}://${host}${path}`, name: e.name, value: String(e.value ?? ''), path, secure: !!e.secure, httpOnly: !!e.httpOnly };
    if (e.domain.startsWith('.')) d.domain = e.domain; // host-only cookies carry no domain
    if (typeof e.expires === 'number') d.expirationDate = e.expires;
    const ss = SAMESITE_IN[String(e.sameSite || '').toLowerCase()];
    if (ss) d.sameSite = ss;
    out.push(d);
  }
  return out;
}
