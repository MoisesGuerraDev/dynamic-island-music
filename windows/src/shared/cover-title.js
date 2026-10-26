// Finding the official cover of a song from what a player reports. Browser videos give a small picture and a title like
// "Artista - Canción (Official Video) | Álbum", so the title is cleaned before it is searched in the iTunes catalog.

const NOISE = /\b(official\s+(music\s+)?video|official\s+audio|official\s+lyric\s+video|lyric\s+video|lyrics?|letra|video\s+oficial|audio\s+oficial|visualizer|visualiser|hd|4k|remastered(\s+\d{4})?|remasterizado)\b/gi;

/** Removes (...), [...], "ft./feat. ...", "Official Video", "Lyrics"... and what comes after "|". */
export function cleanSong(raw) {
  let t = String(raw ?? '');
  t = t.split('|')[0];
  t = t.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
  t = t.replace(/\s+(?:ft|feat|featuring)\.?\s+.*$/i, ' ');
  t = t.replace(NOISE, ' ');
  return t.replace(/\s+/g, ' ').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
}

/** The album that some titles carry after a "|". */
export function albumFromTitle(raw) {
  const parts = String(raw ?? '').split('|');
  if (parts.length < 2) return '';
  return cleanSong(parts[1]);
}

function cleanArtist(a) {
  return String(a ?? '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*(vevo|official)$/i, '')
    .replace(/\s+(?:ft|feat|featuring)\.?\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** { song, artist, album } ready to search. "Artista - Canción" in the title wins over the channel name. */
export function parseTrack(title, artist) {
  const album = albumFromTitle(title);
  const head = String(title ?? '').split('|')[0];
  const dash = head.split(/\s+[-–—]\s+/);
  if (dash.length >= 2 && cleanSong(dash[0]) && cleanSong(dash.slice(1).join(' - '))) {
    return { artist: cleanArtist(cleanSong(dash[0])), song: cleanSong(dash.slice(1).join(' - ')), album };
  }
  return { artist: cleanArtist(artist), song: cleanSong(head), album };
}

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function same(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.includes(short);
}

export function searchUrl(term, entity) {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=25`;
}

/** First result whose song name and artist both match (exact matches win). null when nothing fits. */
export function pickSong(results, song, artist) {
  const ok = (Array.isArray(results) ? results : []).filter((r) => r && r.artworkUrl100 && same(r.trackName, song) && same(r.artistName, artist));
  return ok.find((r) => norm(r.trackName) === norm(song) && norm(r.artistName) === norm(artist)) || ok[0] || null;
}

export function pickAlbum(results, album, artist) {
  const ok = (Array.isArray(results) ? results : []).filter((r) => r && r.artworkUrl100 && same(r.collectionName, album) && same(r.artistName, artist));
  return ok[0] || null;
}

export function hdArtworkUrl(url100) {
  return String(url100).replace('100x100bb', '1200x1200bb');
}
