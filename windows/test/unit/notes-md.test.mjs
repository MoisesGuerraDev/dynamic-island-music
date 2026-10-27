import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, makeFileName, newBody, parseNote, toggleContent, reminderLine, parseReminder } from '../../src/shared/notes-md.js';

test('slugify drops accents and symbols', () => {
  assert.equal(slugify('Reunión mañana a las 9!'), 'reunion-manana-a-las-9');
  assert.equal(slugify('  ¿Qué tal?  '), 'que-tal');
  assert.equal(slugify('x'.repeat(40)).length, 24);
  assert.equal(slugify('###'), '');
});

test('makeFileName uses a time stamp and the slug', () => {
  const name = makeFileName('Probar el notch', new Date(2026, 9, 25, 21, 4, 9));
  assert.equal(name, '2026-10-25-210409-probar-el-notch.md');
  assert.equal(makeFileName('???', new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02-030405-nota.md');
});

test('tasks and notes are written like the Mac app', () => {
  assert.equal(newBody('comprar pan', true), '- [ ] comprar pan\n');
  assert.equal(newBody('una idea', false), 'una idea\n');
});

test('parseNote reads tasks, done tasks and titles', () => {
  const none = { due: null, lead: 0 };
  assert.deepEqual(parseNote('- [ ] pagar luz\n'), { text: 'pagar luz', isTask: true, done: false, ...none });
  assert.deepEqual(parseNote('* [x] listo'), { text: 'listo', isTask: true, done: true, ...none });
  assert.deepEqual(parseNote('- [X] listo'), { text: 'listo', isTask: true, done: true, ...none });
  assert.deepEqual(parseNote('\n\n# Mi título\ncuerpo'), { text: 'Mi título', isTask: false, done: false, ...none });
  assert.deepEqual(parseNote(''), { text: '', isTask: false, done: false, ...none });
  assert.deepEqual(parseNote('- [ ]\r\nx'), { text: '', isTask: true, done: false, ...none });
});

test('a task can carry a reminder line, the same as on the Mac', () => {
  assert.equal(reminderLine('2026-10-27', '10:00', 10), '⏰ 2026-10-27 10:00 · 10');
  assert.equal(newBody('reunión', true, { date: '2026-10-27', time: '10:00', lead: 30 }), '- [ ] reunión\n⏰ 2026-10-27 10:00 · 30\n');
  const p = parseNote('- [ ] reunión\r\n⏰ 2026-10-27 10:00 · 30\r\n');
  assert.equal(p.due, new Date(2026, 9, 27, 10, 0).getTime());
  assert.equal(p.lead, 30);
  assert.equal(parseReminder('⏰ 2026-10-27 09:05').lead, 0);
  assert.equal(parseReminder('⏰ 2026-13-45 25:00 · 5'), null);
  assert.equal(parseReminder('texto'), null);
  assert.equal(toggleContent('- [ ] reunión\n⏰ 2026-10-27 10:00 · 30\n'), '- [x] reunión\n⏰ 2026-10-27 10:00 · 30\n');
});

test('toggleContent flips the first task line and keeps the rest of the file', () => {
  assert.equal(toggleContent('- [ ] a\n'), '- [x] a\n');
  assert.equal(toggleContent('- [x] a\n'), '- [ ] a\n');
  assert.equal(toggleContent('- [ ] a\n\nmás texto\n- [ ] otra\n'), '- [x] a\n\nmás texto\n- [ ] otra\n');
  assert.equal(toggleContent('solo una nota\n'), 'solo una nota\n');
  assert.equal(toggleContent('- [ ] a\r\nb\r\n'), '- [x] a\r\nb\r\n');
});
