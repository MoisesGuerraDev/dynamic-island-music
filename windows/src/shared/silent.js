// "The browser says it is playing, but no sound comes out": the pure part, shared by the app and its tests.

/** Names of the browser programs (without .exe) for the app that plays through the system media controls. */
export function browserProcesses(app = '') {
  const a = String(app).toLowerCase();
  if (a.includes('msedge') || a.includes('edge')) return { name: 'Edge', procs: ['msedge'] };
  if (a.includes('brave')) return { name: 'Brave', procs: ['brave'] };
  if (a.includes('opera')) return { name: 'Opera', procs: ['opera', 'opera_gx'] };
  if (a.includes('vivaldi')) return { name: 'Vivaldi', procs: ['vivaldi'] };
  if (a.includes('firefox')) return { name: 'Firefox', procs: ['firefox'] };
  if (a.includes('chrome')) return { name: 'Chrome', procs: ['chrome'] };
  return null;
}

/**
 * Counts consecutive checks in which the player says "playing" but the browser sends no sound.
 * A few seconds of grace, because a video that is loading or buffering is silent for a moment too.
 */
export class SilentTracker {
  constructor({ needed = 3, loudEnough = 0.0005 } = {}) {
    this.needed = needed;
    this.loudEnough = loudEnough;
    this.count = 0;
  }

  /** `sample` is { playing, found, peak, muted }. Returns { silent, cause } where cause is 'mixer' or 'page'. */
  update(sample) {
    if (!sample || !sample.playing || (sample.peak ?? 0) > this.loudEnough) {
      this.count = 0;
      return { silent: false, cause: '' };
    }
    this.count += 1;
    const silent = this.count >= this.needed;
    return { silent, cause: silent ? (sample.muted ? 'mixer' : 'page') : '' };
  }

  reset() {
    this.count = 0;
  }
}
