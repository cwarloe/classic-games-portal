/* 5BX service worker — offline-first for a fixed, tiny asset set. */

var CACHE = '5bx-v10';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data/5bx-charts.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './figures/c1e1.png',
  './figures/c1e2.png',
  './figures/c1e3.png',
  './figures/c1e4.png',
  './figures/c1e5.png',
  './figures/c2e1.png',
  './figures/c2e2.png',
  './figures/c2e3.png',
  './figures/c2e4.png',
  './figures/c2e5.png',
  './figures/c3e1.png',
  './figures/c3e2.png',
  './figures/c3e3.png',
  './figures/c3e4.png',
  './figures/c3e5.png',
  './figures/c4e1.png',
  './figures/c4e2.png',
  './figures/c4e3.png',
  './figures/c4e4.png',
  './figures/c4e5.png',
  './figures/c5e1.png',
  './figures/c5e2.png',
  './figures/c5e3.png',
  './figures/c5e4.png',
  './figures/c5e5.png',
  './figures/c6e1.png',
  './figures/c6e2.png',
  './figures/c6e3.png',
  './figures/c6e4.png',
  './figures/c6e5.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so updates land, cache as the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (r) {
            return r || caches.match('./');
          });
        })
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
