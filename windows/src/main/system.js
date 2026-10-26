import os from 'node:os';
import { execFile } from 'node:child_process';
import { displayKey } from '../shared/layout.js';

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

/** What this PC is and what screens it has. Read locally; nothing is sent anywhere. */
export class SystemInfo {
  constructor({ screen, helper }) {
    this.screen = screen;
    this.helper = helper;
    this.extra = { model: '', gpus: [], battery: null };
  }

  /** Slow parts (PC model, GPU names, battery): done once in the background. */
  async refresh() {
    if (process.platform === 'win32' && this.helper && !this.helper.dead) {
      try {
        const r = await this.helper.call('sysinfo');
        this.extra = { model: r.model || '', gpus: Array.isArray(r.gpus) ? r.gpus : [], battery: !!r.battery };
      } catch {
        /* keep defaults */
      }
    } else if (process.platform === 'darwin') {
      const model = (await run('sysctl', ['-n', 'hw.model'])).trim();
      const batt = await run('pmset', ['-g', 'batt']);
      this.extra = { model, gpus: [], battery: /InternalBattery/.test(batt) };
    }
    return this.get();
  }

  displays() {
    const primary = this.screen.getPrimaryDisplay();
    return this.screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      key: displayKey(d),
      label: d.label || `Pantalla ${i + 1}`,
      primary: d.id === primary.id,
      internal: !!d.internal,
      bounds: d.bounds,
      workArea: d.workArea,
      size: d.size,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      hz: d.displayFrequency || 60,
      pixels: { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) },
    }));
  }

  get() {
    const cpus = os.cpus();
    const release = os.release();
    return {
      platform: process.platform,
      arch: process.arch,
      os: process.platform === 'win32' ? `Windows ${Number(release.split('.')[2]) >= 22000 ? '11' : '10'} (${release})` : `${os.type()} ${release}`,
      model: this.extra.model || os.hostname(),
      cpu: cpus[0] ? cpus[0].model.trim() : '',
      cores: cpus.length,
      ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      gpus: this.extra.gpus,
      hasBattery: this.extra.battery,
      displays: this.displays(),
    };
  }
}
