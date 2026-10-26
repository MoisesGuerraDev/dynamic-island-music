import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptSession, decryptSession, domainAllowed, toEntry, toRestorable, MAGIC, FILE_NAME, AI_DOMAINS } from '../../src/shared/sessionfile.js';

const COOKIES = [
  { name: 'sessionKey', value: 'sk-ant-sid01-SECRETVALUE', domain: '.claude.ai', path: '/', secure: true, httpOnly: true, expires: 2_000_000_000, sameSite: 'lax' },
  { name: '__Secure-next-auth.session-token', value: 'tok-abc', domain: 'chatgpt.com', path: '/', secure: true, httpOnly: true },
];

test('the file name and the list of sites are the agreed ones', () => {
  assert.equal(FILE_NAME, 'Sesiones-IA.dimsession');
  assert.deepEqual(AI_DOMAINS, ['claude.ai', 'anthropic.com', 'chatgpt.com', 'openai.com', 'deepseek.com', 'google.com']);
});

test('the file layout is exactly DIMS1 + salt16 + nonce12 + cipher text + tag16 (opened here by hand, not with our own decrypt)', () => {
  const buf = encryptSession(COOKIES, 'contraseña ñ ✓');
  assert.equal(buf.subarray(0, 5).toString('ascii'), 'DIMS1');
  assert.ok(MAGIC.equals(buf.subarray(0, 5)));
  const json = Buffer.from(JSON.stringify(COOKIES), 'utf8');
  assert.equal(buf.length, 5 + 16 + 12 + json.length + 16, 'no extra bytes anywhere');
  // Independent reader written only from the spec.
  const salt = buf.subarray(5, 21);
  const nonce = buf.subarray(21, 33);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(33, buf.length - 16);
  const key = crypto.pbkdf2Sync(Buffer.from('contraseña ñ ✓', 'utf8'), salt, 200000, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  assert.deepEqual(JSON.parse(plain), COOKIES);
});

test('round trip with the right password', () => {
  assert.deepEqual(decryptSession(encryptSession(COOKIES, 'abc123'), 'abc123'), COOKIES);
});

test('a wrong password restores nothing', () => {
  const buf = encryptSession(COOKIES, 'abc123');
  assert.throws(() => decryptSession(buf, 'otra'), { message: 'clave' });
  assert.throws(() => decryptSession(buf, ''), { message: 'clave' });
});

test('a damaged or foreign file never crashes the app', () => {
  const good = encryptSession(COOKIES, 'abc123');
  const flipped = Buffer.from(good);
  flipped[flipped.length - 20] ^= 0xff; // inside the cipher text
  assert.throws(() => decryptSession(flipped, 'abc123'), { message: 'clave' });
  const noTag = good.subarray(0, good.length - 1);
  assert.throws(() => decryptSession(noTag, 'abc123'), { message: 'clave' });
  assert.throws(() => decryptSession(good.subarray(0, 20), 'abc123'), { message: 'formato' });
  assert.throws(() => decryptSession(Buffer.from('esto no es una copia, solo texto cualquiera de más de sesenta bytes seguro'), 'abc123'), { message: 'formato' });
  assert.throws(() => decryptSession(Buffer.alloc(0), 'abc123'), { message: 'formato' });
  assert.throws(() => decryptSession(null, 'abc123'), { message: 'formato' });
});

test('the file does not contain the cookie values in plain text', () => {
  const buf = encryptSession(COOKIES, 'abc123');
  const s = buf.toString('latin1');
  for (const needle of ['SECRETVALUE', 'sk-ant-sid01', 'tok-abc', 'sessionKey', 'claude.ai']) assert.ok(!s.includes(needle), needle);
});

test('two saves of the same data differ (fresh salt and nonce each time)', () => {
  assert.notDeepEqual(encryptSession(COOKIES, 'x1234'), encryptSession(COOKIES, 'x1234'));
});

test('only the AI sites and their subdomains are allowed', () => {
  for (const d of ['claude.ai', '.claude.ai', 'api.claude.ai', 'accounts.google.com', '.google.com', 'chat.deepseek.com', 'auth.openai.com', 'console.anthropic.com', 'chatgpt.com']) assert.ok(domainAllowed(d), d);
  for (const d of ['evil.com', 'notclaude.ai', 'claude.ai.evil.com', 'google.com.evil.org', '', null, 'gmail.example']) assert.ok(!domainAllowed(d), String(d));
});

test('toEntry keeps the agreed fields and leaves other sites out', () => {
  const e = toEntry({ name: 'a', value: 'v', domain: '.openai.com', path: '/x', secure: true, httpOnly: false, session: false, expirationDate: 1900000000.7, sameSite: 'no_restriction' });
  assert.deepEqual(e, { name: 'a', value: 'v', domain: '.openai.com', path: '/x', secure: true, httpOnly: false, expires: 1900000000, sameSite: 'none' });
  assert.equal(toEntry({ name: 'a', value: 'v', domain: 'bank.example', path: '/' }), null);
  const s = toEntry({ name: 's', value: '1', domain: 'claude.ai', path: '/', session: true, secure: false, httpOnly: false, sameSite: 'unspecified' });
  assert.equal('expires' in s, false, 'a session cookie has no expires');
  assert.equal('sameSite' in s, false);
});

test('restoring skips expired cookies and domains outside the list, and accepts the Mac spelling of sameSite', () => {
  const now = 1_800_000_000;
  const list = [
    { name: 'ok', value: '1', domain: '.claude.ai', path: '/', secure: true, httpOnly: true, expires: now + 1000, sameSite: 'None' },
    { name: 'old', value: '1', domain: '.claude.ai', path: '/', secure: true, httpOnly: true, expires: now - 5 },
    { name: 'bad', value: '1', domain: '.evil.com', path: '/', secure: true, httpOnly: true, expires: now + 1000 },
    { name: 'session', value: '2', domain: 'chatgpt.com', path: '/a', secure: false, httpOnly: false },
    { value: 'no name', domain: 'claude.ai' },
    null,
  ];
  const r = toRestorable(list, now);
  assert.deepEqual(r.map((c) => c.name), ['ok', 'session']);
  assert.equal(r[0].domain, '.claude.ai');
  assert.equal(r[0].url, 'https://claude.ai/');
  assert.equal(r[0].sameSite, 'no_restriction');
  assert.equal(r[0].expirationDate, now + 1000);
  assert.equal(r[1].domain, undefined, 'host-only cookie has no domain');
  assert.equal(r[1].url, 'http://chatgpt.com/a');
  assert.equal('expirationDate' in r[1], false);
  assert.deepEqual(toRestorable('nope'), []);
});
