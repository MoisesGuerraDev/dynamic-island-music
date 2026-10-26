import test from 'node:test';
import assert from 'node:assert/strict';
import { needsPersist, persistDetails, PERSIST_SECONDS, AI_PARTITION } from '../../src/shared/cookies.js';

test('only session cookies need a new expiry', () => {
  assert.ok(needsPersist({ name: 'sid', domain: '.claude.ai', session: true }));
  assert.ok(!needsPersist({ name: 'sid', domain: '.claude.ai', session: false, expirationDate: 123 }));
  assert.ok(!needsPersist({ name: 'sid', session: true })); // no domain
  assert.ok(!needsPersist(null));
});

test('the cookie is saved again with the same attributes and 90 days of life', () => {
  const now = 1_800_000_000;
  const d = persistDetails({ name: 'sessionKey', value: 'abc', domain: '.claude.ai', hostOnly: false, path: '/', secure: true, httpOnly: true, sameSite: 'lax', session: true }, now);
  assert.equal(d.url, 'https://claude.ai/');
  assert.equal(d.domain, '.claude.ai');
  assert.equal(d.name, 'sessionKey');
  assert.equal(d.value, 'abc');
  assert.equal(d.secure, true);
  assert.equal(d.httpOnly, true);
  assert.equal(d.sameSite, 'lax');
  assert.equal(d.expirationDate, now + PERSIST_SECONDS);
  assert.equal(PERSIST_SECONDS, 90 * 86400);
});

test('host-only cookies keep no domain and plain http stays http', () => {
  const d = persistDetails({ name: '__Host-x', value: '1', domain: 'chatgpt.com', hostOnly: true, path: '/app', secure: false, httpOnly: false, session: true }, 10);
  assert.equal(d.domain, undefined);
  assert.equal(d.url, 'http://chatgpt.com/app');
  assert.equal(d.path, '/app');
  assert.equal(AI_PARTITION, 'persist:ai');
});
