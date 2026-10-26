// A simulated beat for the "colors dance with the music" effect. It does not listen to the audio: every song gets a
// fixed tempo (86 to 133 BPM) from a stable hash of its title and artist, and the pulse follows the song's own clock.
// Main beat every beat (fast rise, smooth fall), a smaller hit off the beat, and a slight swell every 4 beats.

export const MIN_BPM = 86;
export const MAX_BPM = 133;

export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function bpmFor(title, artist) {
  return MIN_BPM + (hashString(`${String(title ?? '').trim().toLowerCase()}|${String(artist ?? '').trim().toLowerCase()}`) % (MAX_BPM - MIN_BPM + 1));
}

const RISE = 0.06; // share of a beat spent going up

function hit(ph) {
  return ph < RISE ? ph / RISE : Math.exp(-(ph - RISE) * 5);
}

/** Pulse from 0 to 1 at time `t` (seconds into the song) for a tempo in BPM. */
export function pulseAt(t, bpm) {
  const beats = (Math.max(0, t) * bpm) / 60;
  const ph = beats - Math.floor(beats);
  const main = hit(ph);
  const off = 0.45 * hit((ph + 0.5) % 1);
  const swell = 0.9 + 0.1 * Math.sin((2 * Math.PI * beats) / 4);
  return Math.max(0, Math.min(1, Math.max(main, off) * swell));
}
