import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, leadText } from '../../src/shared/reminders.js';

const at = (h, m) => new Date(2026, 9, 27, h, m).getTime();
const ev = { id: 'a', title: 'Reunión', date: '2026-10-27', time: '10:00', lead: 10 };

test('an event warns its lead minutes before, and only once', () => {
  assert.equal(dueReminders(at(9, 49), [ev]).length, 0);
  const r = dueReminders(at(9, 50), [ev]);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Reunión');
  assert.equal(r[0].body, 'En 10 min, a las 10:00');
  assert.equal(dueReminders(at(9, 51), [ev], [], new Set([r[0].key])).length, 0);
});

test('a missed warning is not shown late, and events without time or lead never warn', () => {
  assert.equal(dueReminders(at(9, 56), [ev]).length, 0);
  assert.equal(dueReminders(at(9, 50), [{ ...ev, time: '' }]).length, 0);
  assert.equal(dueReminders(at(9, 50), [{ ...ev, lead: null }]).length, 0);
});

test('open tasks with a reminder warn; done tasks do not', () => {
  const task = { id: 'x.md', text: 'Llamar a Ana', isTask: true, done: false, due: at(18, 30), lead: 30 };
  assert.equal(dueReminders(at(18, 0), [], [task])[0].body, 'En 30 min, a las 18:30');
  assert.equal(dueReminders(at(18, 0), [], [{ ...task, done: true }]).length, 0);
  assert.equal(dueReminders(at(18, 30), [], [{ ...task, lead: 0 }])[0].body, 'Ahora, 18:30');
});

test('leadText', () => {
  assert.equal(leadText(0), 'Es ahora');
  assert.equal(leadText(15), 'En 15 min');
  assert.equal(leadText(60), 'En 1 h');
});
