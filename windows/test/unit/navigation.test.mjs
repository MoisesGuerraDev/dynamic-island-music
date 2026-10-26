import test from 'node:test';
import assert from 'node:assert/strict';
import { navAllowed, isHttpsUrl, hostAllowed, AI_NAV_DOMAINS } from '../../src/shared/navigation.js';

test('the AIs and their sign-in providers may be visited', () => {
  for (const u of [
    'https://claude.ai/new', 'https://chatgpt.com/', 'https://auth.openai.com/authorize', 'https://chat.deepseek.com/',
    'https://accounts.google.com/o/oauth2/v2/auth', 'https://gemini.google.com/app', 'https://www.gstatic.com/x.js',
    'https://appleid.apple.com/auth/authorize', 'https://login.live.com/oauth20_authorize.srf', 'https://login.microsoftonline.com/common',
    'https://challenges.cloudflare.com/turnstile', 'https://www.recaptcha.net/recaptcha/api.js', 'https://console.anthropic.com/',
  ]) assert.ok(navAllowed(u), u);
});

test('everything else is refused', () => {
  for (const u of [
    'https://evil.example/', 'https://claude.ai.evil.example/', 'https://notclaude.ai/', 'https://google.com.evil.org/', 'https://apple.com/',
    'https://idmsa.apple.com/', 'http://claude.ai/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<script>1</script>',
    'ftp://claude.ai/', 'ms-settings:privacy-webcam', 'vbscript:x', 'chrome://gpu', 'about:blank', '', null, undefined, 'not a url',
    'https://user:pass@claude.ai/', 'https://claude.ai@evil.example/',
  ]) assert.ok(!navAllowed(u), String(u));
});

test('only https addresses may be opened outside the app', () => {
  assert.ok(isHttpsUrl('https://example.com/page?x=1'));
  for (const u of ['http://example.com', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-settings:sound', 'mailto:a@b.c', 'steam://run/1', 'data:text/plain,hi', 'https://u:p@example.com/', `https://example.com/${'a'.repeat(5000)}`]) {
    assert.ok(!isHttpsUrl(u), u.slice(0, 40));
  }
});

test('host matching is exact or a real subdomain', () => {
  assert.ok(hostAllowed('claude.ai') && hostAllowed('API.Claude.AI'));
  assert.ok(!hostAllowed('xclaude.ai') && !hostAllowed('claude.ai.x.com') && !hostAllowed(''));
  assert.ok(AI_NAV_DOMAINS.includes('appleid.apple.com') && !AI_NAV_DOMAINS.includes('apple.com'));
});
