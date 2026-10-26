import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSong, albumFromTitle, parseTrack, pickSong, pickAlbum, searchUrl, hdArtworkUrl, norm } from '../../src/shared/cover-title.js';

test('titles are cleaned of brackets, ft., noise and what follows "|"', () => {
  assert.equal(cleanSong('Blinding Lights (Official Video)'), 'Blinding Lights');
  assert.equal(cleanSong('Hawái [Letra] | Colores'), 'Hawái');
  assert.equal(cleanSong('Tusa ft. Nicki Minaj'), 'Tusa');
  assert.equal(cleanSong('Song Name Official Music Video HD'), 'Song Name');
  assert.equal(cleanSong('  Lyrics - Despacito (Remastered 2017) '), 'Despacito');
  assert.equal(cleanSong('Bohemian Rhapsody feat. Someone (Live)'), 'Bohemian Rhapsody');
});

test('"Artista - Canción" in the title wins over the channel name', () => {
  const t = parseTrack('Dua Lipa - Levitating (Official Music Video)', 'Dua Lipa Official');
  assert.deepEqual(t, { artist: 'Dua Lipa', song: 'Levitating', album: '' });
  const u = parseTrack('Bad Bunny - Monaco | Un Verano Sin Ti', 'Bad Bunny');
  assert.deepEqual(u, { artist: 'Bad Bunny', song: 'Monaco', album: 'Un Verano Sin Ti' });
});

test('without a dash the player artist is used, cleaned of "- Topic" and "VEVO"', () => {
  assert.deepEqual(parseTrack('Perdida', 'Luar La L - Topic'), { artist: 'Luar La L', song: 'Perdida', album: '' });
  assert.equal(parseTrack('Hello', 'AdeleVEVO').artist, 'Adele');
  assert.equal(albumFromTitle('Canción | Mi Álbum (Deluxe)'), 'Mi Álbum');
  assert.equal(albumFromTitle('Sin barra'), '');
});

const RESULTS = [
  { trackName: 'Blinding Lights (Remix)', artistName: 'The Weeknd & Rosalía', artworkUrl100: 'https://x/a/100x100bb.jpg' },
  { trackName: 'Blinding Lights', artistName: 'The Weeknd', artworkUrl100: 'https://x/b/100x100bb.jpg' },
  { trackName: 'Starboy', artistName: 'The Weeknd', artworkUrl100: 'https://x/c/100x100bb.jpg' },
];

test('a result is accepted only when song and artist both match, exact first', () => {
  assert.equal(pickSong(RESULTS, 'Blinding Lights', 'The Weeknd').artworkUrl100, 'https://x/b/100x100bb.jpg');
  assert.equal(pickSong(RESULTS, 'Blinding Lights', 'Dua Lipa'), null, 'right song, wrong artist');
  assert.equal(pickSong(RESULTS, 'Otra canción', 'The Weeknd'), null, 'right artist, wrong song');
  assert.equal(pickSong([], 'x', 'y'), null);
  assert.equal(pickSong(null, 'x', 'y'), null);
  assert.equal(pickSong(RESULTS, 'blinding lights', 'the weeknd').trackName, 'Blinding Lights', 'case and accents do not matter');
});

test('the album fallback matches the album name and the artist', () => {
  const albums = [{ collectionName: 'Un Verano Sin Ti', artistName: 'Bad Bunny', artworkUrl100: 'https://x/d/100x100bb.jpg' }, { collectionName: 'YHLQMDLG', artistName: 'Bad Bunny', artworkUrl100: 'https://x/e/100x100bb.jpg' }];
  assert.equal(pickAlbum(albums, 'Un Verano Sin Ti', 'Bad Bunny').artworkUrl100, 'https://x/d/100x100bb.jpg');
  assert.equal(pickAlbum(albums, 'Un Verano Sin Ti', 'Otro'), null);
});

test('the search URL and the HD picture URL follow the agreed shapes', () => {
  assert.equal(searchUrl('The Weeknd Blinding Lights', 'song'), 'https://itunes.apple.com/search?term=The%20Weeknd%20Blinding%20Lights&entity=song&limit=25');
  assert.equal(hdArtworkUrl('https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg'), 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/1200x1200bb.jpg');
  assert.equal(norm('Canción Ñandú!'), 'cancionnandu');
});
