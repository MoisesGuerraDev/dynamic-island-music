import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { DebouncedJson } from './fsutil.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Small local calendar: events typed in the island. They stay on this PC in one JSON file. */
export class CalendarStore extends EventEmitter {
  constructor({ file }) {
    super();
    this.json = new DebouncedJson(file, 400);
    const saved = this.json.read([]);
    this.events = Array.isArray(saved) ? saved.filter((e) => e && DATE_RE.test(e.date || '') && typeof e.title === 'string') : [];
    this.#prune();
  }

  #prune() {
    const limit = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    this.events = this.events.filter((e) => e.date >= limit);
  }

  list() {
    return this.events;
  }

  /** lead: minutes before the event to warn (only for events with a time), or null for no warning. */
  add({ title, date, time, lead }) {
    const t = String(title ?? '').trim().slice(0, 200);
    if (!t || !DATE_RE.test(date || '')) return null;
    const hasTime = TIME_RE.test(time || '');
    const minutes = Number(lead);
    const ev = { id: crypto.randomUUID(), title: t, date, time: hasTime ? time : '', lead: hasTime && Number.isFinite(minutes) && minutes >= 0 ? Math.min(1440, Math.round(minutes)) : null };
    this.events.push(ev);
    this.events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    this.json.save(this.events);
    this.emit('change');
    return ev;
  }

  remove(id) {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.id !== id);
    if (this.events.length !== before) {
      this.json.save(this.events);
      this.emit('change');
    }
  }

  flush() {
    this.json.flush();
  }
}
