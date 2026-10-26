import { albumFromTitle, hdArtworkUrl, parseTrack, pickAlbum, pickSong, searchUrl } from '../shared/cover-title.js';

/**
 * Official cover in HD for a song whose picture is small (browser videos). It asks the iTunes catalog by title and
 * artist, accepts a result only if both match, and returns the picture as a data URL. The person can turn it off
 * (Ajustes › Reproductor) because it sends the title and the artist to Apple.
 */
export class HdCover {
  constructor({ store, fetchImpl = (...a) => fetch(...a) }) {
    this.store = store;
    this.fetch = fetchImpl;
    this.cache = new Map(); // key -> data URL or null
  }

  /** One more try after a short pause: Apple's servers sometimes drop the first connection. */
  async #twice(fn) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 600));
      return fn();
    }
  }

  async #json(url) {
    return this.#twice(async () => {
      const res = await this.fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
  }

  async #image(url) {
    return this.#twice(async () => {
      const res = await this.fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000 || buf.length > 6_000_000) return null;
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return `data:${mime.split(';')[0]};base64,${buf.toString('base64')}`;
    });
  }

  /** { title, artist } as the player reports them. Returns a data URL or null. */
  async find({ title, artist }) {
    if (!this.store.get('coverHD')) return null;
    const key = `${title}|${artist}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let out = null;
    let failed = false;
    try {
      const t = parseTrack(title, artist);
      let hit = null;
      if (t.song) {
        const data = await this.#json(searchUrl(`${t.artist} ${t.song}`.trim(), 'song'));
        hit = pickSong(data.results, t.song, t.artist);
      }
      if (!hit && t.album && t.artist) {
        const data = await this.#json(searchUrl(`${t.artist} ${t.album}`, 'album'));
        hit = pickAlbum(data.results, t.album || albumFromTitle(title), t.artist);
      }
      if (hit) out = await this.#image(hdArtworkUrl(hit.artworkUrl100));
    } catch {
      failed = true; // offline or Apple unreachable: keep the small picture and try again next time
    }
    if (!failed) {
      if (this.cache.size > 60) this.cache.clear();
      this.cache.set(key, out);
    }
    return out;
  }
}
