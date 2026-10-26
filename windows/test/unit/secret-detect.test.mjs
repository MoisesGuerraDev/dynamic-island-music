import test from 'node:test';
import assert from 'node:assert/strict';
import { looksSecret, isIgnoredApp, classifyText, WIN_SECRET_FORMATS } from '../../src/shared/secret-detect.js';

test('API keys and tokens are secret', () => {
  const secrets = [
    'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx',
    'sk-proj-1234567890abcdefghijklmnop',
    'ghp_' + 'a'.repeat(36),
    'github_pat_' + 'A1b2C3d4E5'.repeat(4),
    'AKIAIOSFODNN7EXAMPLE',
    'AIza' + 'SyA-1234567890abcdefghijklmnopqrstu'.slice(0, 35),
    'xoxb-123456789012-abcdefghij',
    'Bearer abcdefghijklmnopqrstuvwxyz012345',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    'a'.repeat(64),
  ];
  for (const s of secrets) assert.ok(looksSecret(s), s.slice(0, 30));
});

test('card numbers that pass the Luhn check are secret', () => {
  assert.ok(looksSecret('4111 1111 1111 1111'));
  assert.ok(looksSecret('4111-1111-1111-1111'));
  assert.ok(!looksSecret('4111 1111 1111 1112'));
  assert.ok(!looksSecret('1234567890123')); // fails Luhn
});

test('passwords with every kind of character are secret', () => {
  assert.ok(looksSecret('Tr0ub4dor&3xyz'));
  assert.ok(looksSecret('P@ssw0rd!2024'));
});

test('normal things are not secret', () => {
  const fine = [
    'Reunión mañana a las 9, llevar el reporte',
    'https://github.com/tu-usuario/tu-isla',
    'npm run build && npm start',
    'Report_Final_2024-v2.pdf',
    'C:\\Users\\tu\\Documents\\Informe-Final.docx',
    'hola@correo.com',
    'bro necesitamos más disciplina y estudiar más',
    '25',
    '',
    'Contraseña123',
    'a'.repeat(40),
    'https://example.com/A1b2C3!d4#x',
  ];
  for (const s of fine) assert.ok(!looksSecret(s), s);
});

test('isIgnoredApp matches password managers by process name', () => {
  const list = ['1password', 'keepass', 'bitwarden'];
  assert.ok(isIgnoredApp('1Password.exe', list));
  assert.ok(isIgnoredApp('KeePassXC', list));
  assert.ok(!isIgnoredApp('chrome', list));
  assert.ok(!isIgnoredApp('', list));
  assert.ok(!isIgnoredApp('chrome', ['']));
});

test('classifyText finds links', () => {
  assert.equal(classifyText('https://claude.ai'), 'link');
  assert.equal(classifyText('mira https://claude.ai'), 'text');
  assert.equal(classifyText('hola'), 'text');
});

test('the Windows "do not record" formats are listed', () => {
  assert.ok(WIN_SECRET_FORMATS.includes('ExcludeClipboardContentFromMonitorProcessing'));
  assert.ok(WIN_SECRET_FORMATS.includes('Clipboard Viewer Ignore'));
});
