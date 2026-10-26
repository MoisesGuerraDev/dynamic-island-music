// Pomodoro end sounds, made with Web Audio so the app needs no sound files. A custom file can be chosen in Settings.

let ctx = null;
let customAudio = null;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(c, out, { f, t = 0, dur = 0.8, type = 'sine', gain = 0.5, attack = 0.005 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, c.currentTime + t);
  g.gain.setValueAtTime(0.0001, c.currentTime + t);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + dur);
  o.connect(g).connect(out);
  o.start(c.currentTime + t);
  o.stop(c.currentTime + t + dur + 0.05);
}

const VOICES = {
  // Soft bell: a base note and two partials.
  Campana: (c, o) => {
    tone(c, o, { f: 880, dur: 1.4, gain: 0.5 });
    tone(c, o, { f: 1760, dur: 0.9, gain: 0.18 });
    tone(c, o, { f: 2637, dur: 0.5, gain: 0.08 });
  },
  Cristal: (c, o) => {
    tone(c, o, { f: 1568, dur: 0.9, gain: 0.35, type: 'triangle' });
    tone(c, o, { f: 2349, t: 0.12, dur: 0.9, gain: 0.3, type: 'triangle' });
    tone(c, o, { f: 3136, t: 0.24, dur: 1.1, gain: 0.22, type: 'triangle' });
  },
  Marimba: (c, o) => {
    [523.25, 659.25, 783.99].forEach((f, i) => tone(c, o, { f, t: i * 0.16, dur: 0.5, gain: 0.5, type: 'triangle', attack: 0.002 }));
  },
  Pulso: (c, o) => {
    [0, 0.22, 0.44].forEach((t) => tone(c, o, { f: 740, t, dur: 0.14, gain: 0.35, type: 'square', attack: 0.002 }));
  },
  Digital: (c, o) => {
    [660, 880, 1320].forEach((f, i) => tone(c, o, { f, t: i * 0.1, dur: 0.12, gain: 0.25, type: 'square', attack: 0.002 }));
  },
  Gong: (c, o) => {
    tone(c, o, { f: 196, dur: 2.4, gain: 0.55 });
    tone(c, o, { f: 392.5, dur: 1.8, gain: 0.25 });
    tone(c, o, { f: 587, dur: 1.2, gain: 0.12 });
  },
};

export const SOUND_NAMES = Object.keys(VOICES);

function fileUrl(p) {
  const clean = String(p).replace(/\\/g, '/');
  return encodeURI(/^[a-zA-Z]:/.test(clean) ? `file:///${clean}` : `file://${clean}`);
}

/** { name, volume 0..1, repeat, custom } */
export function playPomodoroSound({ name, volume = 0.8, repeat = 1, custom = '' }) {
  const times = Math.max(1, Math.min(10, repeat | 0 || 1));
  if (custom) {
    try {
      if (customAudio) customAudio.pause();
      customAudio = new Audio(fileUrl(custom));
      customAudio.volume = Math.max(0, Math.min(1, volume));
      let left = times;
      customAudio.addEventListener('ended', () => {
        if (--left > 0) {
          customAudio.currentTime = 0;
          customAudio.play().catch(() => {});
        }
      });
      customAudio.play().catch(() => playSynth(name, volume, times));
      return;
    } catch {
      /* fall back to the built-in sound */
    }
  }
  playSynth(name, volume, times);
}

function playSynth(name, volume, times) {
  const c = audio();
  const voice = VOICES[name] || VOICES.Campana;
  for (let i = 0; i < times; i++) {
    setTimeout(() => {
      const master = c.createGain();
      master.gain.value = Math.max(0, Math.min(1, volume));
      master.connect(c.destination);
      voice(c, master);
    }, i * 1700);
  }
}
