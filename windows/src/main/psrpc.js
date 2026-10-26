import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';

export function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * A long-lived PowerShell helper that answers one JSON request per line with one JSON line.
 * Starting PowerShell costs about a second, so it stays open and is asked again and again.
 * If it crashes it is restarted a few times, then it is reported as dead and the feature is skipped.
 */
export class PsRpc extends EventEmitter {
  constructor(script, { name = 'ps', timeoutMs = 8000, command = powershellPath(), args = null } = {}) {
    super();
    this.script = script;
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.command = command;
    this.args = args || ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script];
    this.child = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.dead = false;
    this.stopped = false;
    this.restarts = [];
    this.lastError = '';
  }

  start() {
    if (this.child || this.dead) return;
    this.stopped = false;
    let child;
    try {
      child = spawn(this.command, this.args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.#fail(String(err && err.message ? err.message : err));
      return;
    }
    this.child = child;
    this.ready = false;
    this.buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.#onData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      this.lastError = String(chunk).slice(0, 400);
    });
    child.on('error', (err) => {
      this.#fail(String(err && err.message ? err.message : err));
    });
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      this.#rejectAll(new Error(`${this.name} terminó`));
      if (!this.stopped) this.#maybeRestart();
    });
  }

  stop() {
    this.stopped = true;
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.#rejectAll(new Error('detenido'));
    if (child) {
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }, 500).unref?.();
    }
  }

  /** Sends a request and waits for its reply. Rejects on timeout (and restarts the helper). */
  call(cmd, args = {}, { timeoutMs = this.timeoutMs } = {}) {
    if (this.dead) return Promise.reject(new Error(`${this.name} no está disponible`));
    if (!this.child) this.start();
    if (!this.child) return Promise.reject(new Error(`${this.name} no está disponible`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} no respondió`));
        // A stuck helper is replaced.
        const c = this.child;
        if (c) {
          try {
            c.kill();
          } catch {
            /* ignore */
          }
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${JSON.stringify({ id, cmd, ...args })}\n`);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  #onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // stray output that is not ours
      }
      if (msg && msg.ready !== undefined && msg.id === undefined) {
        if (msg.ready) {
          this.ready = true;
          this.emit('ready');
        } else {
          this.#fail(msg.error || 'no pudo iniciar');
        }
        continue;
      }
      const p = msg && this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.ok === false) p.reject(new Error(msg.error || 'error'));
        else p.resolve(msg);
      }
    }
  }

  #rejectAll(err) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  #maybeRestart() {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < 60_000);
    if (this.restarts.length >= 4) {
      this.#fail(this.lastError || 'se cerró varias veces');
      return;
    }
    this.restarts.push(now);
    setTimeout(() => {
      if (!this.stopped && !this.child && !this.dead) this.start();
    }, 1000).unref?.();
  }

  #fail(reason) {
    this.dead = true;
    this.lastError = reason;
    const child = this.child;
    this.child = null;
    this.ready = false;
    this.#rejectAll(new Error(reason));
    if (child) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
    this.emit('dead', reason);
  }
}
