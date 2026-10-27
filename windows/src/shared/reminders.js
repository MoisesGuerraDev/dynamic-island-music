// Reminders of calendar events (with a time) and tasks (with a "⏰" line): which ones should warn now.
// The same rules as the Mac app: warn `lead` minutes before; a warning missed by more than a few minutes
// (the PC was asleep or the app closed) is not shown late.

const LATE_MS = 5 * 60_000;

function eventDue(ev) {
  if (!ev || !ev.time || ev.lead == null) return null;
  const [y, m, d] = String(ev.date).split('-').map(Number);
  const [hh, mm] = String(ev.time).split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm).getTime();
  return Number.isFinite(t) ? t : null;
}

export function leadText(minutes) {
  const n = Number(minutes) || 0;
  if (n === 0) return 'Es ahora';
  return n >= 60 && n % 60 === 0 ? `En ${n / 60} h` : `En ${n} min`;
}

/**
 * Returns the warnings to show at `now`: [{ key, title, body }]. `fired` is a Set of keys already shown;
 * the caller adds the keys it shows.
 */
export function dueReminders(now, events = [], notes = [], fired = new Set()) {
  const out = [];
  const consider = (key, title, due, lead) => {
    if (due == null || fired.has(key)) return;
    const at = due - (Number(lead) || 0) * 60_000;
    if (now >= at && now - at <= LATE_MS) {
      const hh = new Date(due);
      const time = `${String(hh.getHours()).padStart(2, '0')}:${String(hh.getMinutes()).padStart(2, '0')}`;
      out.push({ key, title, body: Number(lead) ? `${leadText(lead)}, a las ${time}` : `Ahora, ${time}` });
    }
  };
  for (const ev of events) consider(`ev:${ev.id}:${ev.date}T${ev.time}:${ev.lead}`, ev.title, eventDue(ev), ev.lead);
  for (const n of notes) if (n.isTask && !n.done && n.due) consider(`task:${n.id}:${n.due}:${n.lead}`, n.text, n.due, n.lead);
  return out;
}
