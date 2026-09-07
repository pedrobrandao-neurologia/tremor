/* TremorPSD — service worker: pré-cache de todos os recursos para uso offline */
const VERSION = 'tremorpsd-v2.0.0';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/dsp.js',
  './js/interpret.js',
  './js/charts.js',
  './js/report.js',
  './js/app.js',
  './vendor/chart.umd.js',
  './vendor/jspdf.umd.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // sem recursos externos

  // Navegações: rede primeiro (para pegar atualizações), cache como reserva
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {}); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Demais recursos: cache primeiro, atualização em segundo plano (stale-while-revalidate)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); } return res; }).catch(() => cached);
      return cached || network;
    })
  );
});
