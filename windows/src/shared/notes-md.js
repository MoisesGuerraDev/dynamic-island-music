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

export function newBody(text, task) {
  const clean = String(text).trim();
  return task ? `- [ ] ${clean}\n` : `${clean}\n`;
}

/** Returns { text, isTask, done } from the first non-empty line, like the macOS app. */
export function parseNote(content) {
  const lines = String(content).split(/\r?\n/).map((l) => l.trim());
  const first = lines.find((l) => l.length > 0) ?? '';
  const m = TASK_RE.exec(first);
  if (m) return { text: m[3].trim(), isTask: true, done: m[2].toLowerCase() === 'x' };
  return { text: first.replace(/^[#\s]+/, ''), isTask: false, done: false };
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
