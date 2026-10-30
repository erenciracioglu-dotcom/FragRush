// Olum turleri: olduren silahin / kuralin kimligi (weaponId) -> akis etiketi (i18n 'k.<id>'), kendi kendine olum akisi,
// oldurene ortada cikan mesaj, olenin ekranindaki baslik. Ev sahibi (game.js), konuk (net/guest.js) ve HUD ayni tablolari
// kullanir: yeni bir haritanin olum turu yalniz buraya ve i18n.js'e eklenir.
export const KILL_IDS = new Set(['pulse', 'shotgun', 'plasma', 'rocket', 'rail', 'crush', 'world', 'drown', 'lava', 'cold', 'icicle', 'spaced', 'domino', 'chain', 'island', 'clouds']);
export const killLabelId = (w) => (KILL_IDS.has(w) ? w : 'world');

// kendi kendine (ya da kimseye yazilmadan) olunce akis metni; tabloda yoksa 'blewUp'
export const SELF_FEED = {
  crush: 'crushedFeed', drown: 'drownedFeed', lava: 'lavaFeed', cold: 'coldFeed', icicle: 'icicleFeed', spaced: 'spacedFeed', domino: 'dominoFeed',
  chain: 'chainFeed', island: 'islandFeed', clouds: 'cloudsFeed',
};

// oldurene ortada cikan mesaj (coklu parcalama mesaji once gelir; buz golunde bogulma ayrica 'iceKill')
export const KILLER_MSG = {
  crush: 'buried', lava: 'lavaKill', cold: 'iceKill', icicle: 'icicleKill', spaced: 'spacedKill', domino: 'dominoKill',
  chain: 'chainKill', island: 'islandKill', clouds: 'cloudsKill',
};

// ortam olumu: olenin ekraninda ozel baslik; kendin olduysen '-1' notu
export const DEATH_TITLE = {
  drown: 'youDrowned', lava: 'youBurned', cold: 'youFroze', icicle: 'youIcicle', spaced: 'youSpaced', domino: 'youDomino',
  chain: 'youChain', island: 'youIsland', clouds: 'youClouds',
};
