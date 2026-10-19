// Service worker: lets the home screen app start offline.
// Network first, so every new deploy shows up as soon as the phone is online.
const BUILD = 'dev';
const CACHE = `new-world-${BUILD}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/build.js', 'js/data.js', 'js/rng.js', 'js/mapgen.js', 'js/state.js', 'js/units.js',
  'js/colony.js', 'js/combat.js', 'js/movement.js', 'js/path.js', 'js/europe.js', 'js/ai.js',
  'js/game.js', 'js/save.js',
  'js/ui/ctx.js', 'js/ui/render.js', 'js/ui/input.js', 'js/ui/dialogs.js', 'js/ui/mapui.js',
  'js/ui/colonyScreen.js', 'js/ui/europeScreen.js', 'js/ui/menu.js', 'js/ui/describe.js',
  'js/ui/advisor.js', 'js/ui/roster.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith((async () => {
    try {
      // no-cache: revalidate with the server instead of trusting the HTTP cache.
      const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
      if (res.ok && !url.search) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req.url, copy));
      }
      return res;
    } catch {
      const hit = await caches.match(req.url, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
