import { EventEmitter } from 'node:events';

/**
 * Pomodoro timer. Any duration is allowed (seconds, set from the notch or from Settings).
 * It lives in the main process so it keeps running with every island and the settings window,
 * and the end is computed from a wall-clock deadline, so a busy PC cannot make it drift.
 */
export class Pomodoro extends EventEmitter {
  constructor(store, { now = () => Date.now(), autoTick = true } = {}) {
    super();
    this.store = store;
    this.now = now;
    this.phase = 'focus';
    this.sprint = 1;
    this.running = false;
    this.endAt = null;
    this.remaining = store.get('pomoFocusSeconds');
    this.timer = null;
    this.autoTick = autoTick;
  }

  duration(phase = this.phase) {
    return this.store.get(phase === 'focus' ? 'pomoFocusSeconds' : 'pomoRestSeconds');
  }

  snapshot() {
    const remaining = this.running ? Math.max(0, (this.endAt - this.now()) / 1000) : this.remaining;
    return {
      phase: this.phase,
      running: this.running,
      sprint: this.sprint,
      sprints: this.store.get('pomoSprints'),
      duration: this.duration(),
      remaining,
      endAt: this.running ? this.endAt : null,
      at: this.now(),
    };
  }

  #emit() {
    this.emit('state', this.snapshot());
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  start() {
    if (this.running || this.remaining <= 0) return;
    this.endAt = this.now() + this.remaining * 1000;
    this.running = true;
    if (this.autoTick) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 250);
    }
    this.#emit();
  }

  pause() {
    if (!this.running) return;
    this.remaining = Math.max(0, (this.endAt - this.now()) / 1000);
    this.#stopTimer();
    this.#emit();
  }

  reset() {
    this.#stopTimer();
    this.phase = 'focus';
    this.sprint = 1;
    this.remaining = this.duration('focus');
    this.#emit();
  }

  skip() {
    const was = this.running;
    this.#stopTimer();
    this.#advance();
    if (was) this.start();
    else this.#emit();
  }

  /** Sets the length of the current phase (the same setting Settings edits). */
  setDuration(seconds) {
    const s = Math.round(Number(seconds));
    if (!Number.isFinite(s) || s <= 0) return;
    this.#stopTimer();
    this.store.set(this.phase === 'focus' ? 'pomoFocusSeconds' : 'pomoRestSeconds', s);
    this.remaining = s;
    this.#emit();
  }

  /** Call when a duration or the sprint count changed in Settings. */
  durationsChanged() {
    if (!this.running) this.remaining = this.duration();
    this.#emit();
  }

  tick() {
    if (!this.running) return;
    if (this.endAt - this.now() <= 0) this.#finish();
  }

  #stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.endAt = null;
  }

  #advance() {
    if (this.phase === 'focus') {
      this.phase = 'rest';
      this.remaining = this.duration('rest');
    } else {
      this.phase = 'focus';
      this.sprint = this.sprint >= this.store.get('pomoSprints') ? 1 : this.sprint + 1;
      this.remaining = this.duration('focus');
    }
  }

  #finish() {
    const finishedFocus = this.phase === 'focus';
    this.#stopTimer();
    this.#advance();
    this.emit('finished', { finishedFocus, nextPhase: this.phase });
    if (this.store.get('pomoAutoNext')) this.start();
    else this.#emit();
  }

  stop() {
    this.#stopTimer();
  }
}
