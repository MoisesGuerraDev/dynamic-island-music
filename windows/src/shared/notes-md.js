// Notes are plain Markdown files, one per note (tasks are "- [ ]" / "- [x]"), the same format as the macOS app.
// That way a folder inside iCloud Drive (iCloud for Windows) or any synced folder works on every device.

const TASK_RE = /^([-*])\s\[( |x|X)\]\s?(.*)$/;

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function makeFileName(text, date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const slug = slugify(text);
  return `${stamp}-${slug || 'nota'}.md`;
}

// A task can carry a reminder on its own line, the same on Mac and Windows: "⏰ 2026-10-27 10:00 · 10"
// (date and time of the task, then how many minutes before to warn).
const REMIND_RE = /^⏰\s*(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):([0-5]\d)(?:\s*·\s*(\d{1,4}))?\s*$/;

export function reminderLine(date, time, lead = 0) {
  return `⏰ ${date} ${time} · ${Math.max(0, Math.round(Number(lead) || 0))}`;
}

/** Returns { due, lead } (due in ms, local time) from a reminder line, or null. */
export function parseReminder(line) {
  const m = REMIND_RE.exec(String(line).trim());
  if (!m) return null;
  const [y, mo, d] = m[1].split('-').map(Number);
  const due = new Date(y, mo - 1, d, Number(m[2]), Number(m[3])).getTime();
  return Number.isFinite(due) ? { due, lead: Number(m[4] || 0) } : null;
}

export function newBody(text, task, remind = null) {
  const clean = String(text).trim();
  if (!task) return `${clean}\n`;
  const extra = remind && remind.date && remind.time ? `${reminderLine(remind.date, remind.time, remind.lead)}\n` : '';
  return `- [ ] ${clean}\n${extra}`;
}

/** Returns { text, isTask, done, due, lead } from the first non-empty line (and the reminder line), like the macOS app. */
export function parseNote(content) {
  const lines = String(content).split(/\r?\n/).map((l) => l.trim());
  const first = lines.find((l) => l.length > 0) ?? '';
  const m = TASK_RE.exec(first);
  if (m) {
    const r = lines.map(parseReminder).find(Boolean) || null;
    return { text: m[3].trim(), isTask: true, done: m[2].toLowerCase() === 'x', due: r ? r.due : null, lead: r ? r.lead : 0 };
  }
  return { text: first.replace(/^[#\s]+/, ''), isTask: false, done: false, due: null, lead: 0 };
}

/** Flips the checkbox of the first task line and keeps the rest of the file as it was. */
export function toggleContent(content) {
  const src = String(content);
  const lines = src.split('\n');
  const i = lines.findIndex((l) => l.trim().length > 0);
  if (i < 0) return src;
  const m = TASK_RE.exec(lines[i].trim());
  if (!m) return src;
  const nowDone = m[2].toLowerCase() !== 'x';
  const eol = lines[i].endsWith('\r') ? '\r' : '';
  lines[i] = `${m[1]} [${nowDone ? 'x' : ' '}] ${m[3].trim()}${eol}`;
  return lines.join('\n');
}
