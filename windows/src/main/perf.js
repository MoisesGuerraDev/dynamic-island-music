import { EventEmitter } from 'node:events';
import os from 'node:os';

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/**
 * CPU, memory, GPU and screen refresh rate of this PC. Nothing leaves the machine.
 * It only samples while something on screen shows it (acquire/release), so it costs nothing otherwise.
 * CPU and memory come from Node; GPU load and temperature come from the Windows helper (NVIDIA or Windows counters).
 */
export class PerfMonitor extends EventEmitter {
  constructor({ store, helper, refreshHz }) {
    super();
    this.store = store;
    this.helper = helper;
    this.refreshHz = refreshHz || (() => 60);
    this.users = 0;
    this.timer = null;
    this.prev = cpuTimes();
    this.gpu = { gpu: null, gpuTemp: null, gpuName: null };
    this.gpuBusy = false;
    this.last = null;
  }

  acquire() {
    this.users++;
    if (!this.timer) {
      this.#sample();
      this.#schedule();
    }
  }

  release() {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reschedule() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.#schedule();
    }
  }

  #schedule() {
    const ms = Math.max(500, Math.min(10_000, this.store.get('perfInterval')));
    this.timer = setTimeout(() => {
      this.#sample();
      if (this.users > 0) this.#schedule();
    }, ms);
  }

  #sample() {
    const cur = cpuTimes();
    const dTotal = cur.total - this.prev.total;
    const dIdle = cur.idle - this.prev.idle;
    this.prev = cur;
    const cpu = dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0;
    const total = os.totalmem();
    const used = total - os.freemem();

    if (this.helper && !this.helper.dead && !this.gpuBusy && this.store.get('perfShowGPU')) {
      this.gpuBusy = true;
      this.helper
        .call('gpu')
        .then((r) => {
          this.gpu = { gpu: r.gpu ?? null, gpuTemp: r.gpuTemp ?? null, gpuName: r.gpuName ?? null };
        })
        .catch(() => {
          this.gpu = { gpu: null, gpuTemp: null, gpuName: null };
        })
        .finally(() => {
          this.gpuBusy = false;
        });
    }

    this.last = {
      cpu: Math.round(cpu),
      ramUsedGB: used / 1024 ** 3,
      ramTotalGB: total / 1024 ** 3,
      ramPercent: Math.round((used / total) * 100),
      gpu: this.gpu.gpu === null ? null : Math.round(this.gpu.gpu),
      gpuTemp: this.gpu.gpuTemp === null ? null : Math.round(this.gpu.gpuTemp),
      gpuName: this.gpu.gpuName,
      hz: Math.round(this.refreshHz()),
      at: Date.now(),
    };
    this.emit('sample', this.last);
  }
}
