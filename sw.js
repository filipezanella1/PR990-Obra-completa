/* Service worker do Painel PR-990: guarda o app e a base no aparelho para abrir sem internet.
   A versão é trocada a cada publicação (o workflow substitui __BUILD__ pelo commit). */
const VERSION = 'pr990-__BUILD__';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './src/style.css', './src/engine.js', './src/app.js',
  './data/model.json', './data/insumos.json', './data/base.json', './data/painel.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const FONTS = 'pr990-fonts';

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // fontes do Google: guarda na primeira vez que carregar
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // páginas: rede primeiro (pega a versão nova), cache se estiver sem internet
  if (req.mode === 'navigate') {
    ev.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return res; })
      .catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  // arquivos do app e base: cache primeiro, atualiza em segundo plano
  ev.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Sem conexão', { status: 503 });
  }));
});

self.addEventListener('message', ev => { if (ev.data === 'skipWaiting') self.skipWaiting(); });
