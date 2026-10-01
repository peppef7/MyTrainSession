// Service worker: mette in cache l'app per usarla anche senza rete (palestra senza campo).
const VERSION = 'mts-1.1.0';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/store.js', 'js/parser.js', 'js/sample-plan.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Rete prima (così gli aggiornamenti arrivano subito), cache se offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
