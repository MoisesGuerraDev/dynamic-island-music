// Time helpers for the Pomodoro: any duration is allowed (25, 1:30, 1:30:00, 0,5).

/** "25" -> 1500 (minutes), "1:30" -> 90 (mm:ss), "1:30:00" -> 5400 (h:mm:ss), "1,5" -> 90. NaN when invalid. */
export function parseDuration(value) {
  const v = String(value ?? '').trim();
  if (!v) return NaN;
  if (v.includes(':')) {
    const parts = v.split(':').map((p) => (p.trim() === '' ? NaN : Number(p)));
    if (parts.length > 3 || parts.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
    if (parts.length === 3) {
      if (parts[1] > 59 || parts[2] > 59) return NaN;
      return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
    if (parts[1] > 59) return NaN;
    return Math.round(parts[0] * 60 + parts[1]);
  }
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : NaN;
}

/** 90 -> "1:30", 5400 -> "1:30:00", 5 -> "0:05". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n) => (n < 10 ? '0' + n : String(n));
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/** Spanish relative time, same style as the macOS app ("hace 2 h"). */
export function relativeAge(date, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - +date) / 1000));
  if (sec < 45) return 'ahora';
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
  const y = Math.round(mo / 12);
  return `hace ${y} ${y === 1 ? 'año' : 'años'}`;
}
