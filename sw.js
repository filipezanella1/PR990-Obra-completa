/* Service worker do Painel PR-990: guarda o app e a base no aparelho para abrir sem internet.
   A versão é trocada a cada publicação (o workflow substitui __BUILD__ pelo commit). */
const VERSION = 'pr990-__BUILD__';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './src/style.css', './src/engine.js', './src/app.js', './src/obra.js', './src/medparse.js', './src/xlsx.js', './src/retig.js',
  './data/model.json', './data/insumos.json', './data/base.json', './data/painel.json',
  './data/protegido.json', './data/avanco.json', './data/eixo.json', './data/pranchas.json', './data/britagem.json', './data/reajuste.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const FONTS = 'pr990-fonts';

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
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
  // versão mestra: sempre da rede (é o que o dono publica), com a última cópia para usar sem internet
  if (url.pathname.endsWith('/data/mestre.json')) {
    ev.respondWith(fetch(req, { cache: 'no-store' }).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put('./data/mestre.json', res.clone())); return res.clone(); })
      .catch(() => caches.match('./data/mestre.json', { ignoreSearch: true }).then(r => r || new Response('null', { headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  // página: sai do cache desta versão (HTML, estilos e scripts sempre da mesma publicação);
  // a versão nova é baixada pelo service worker novo e entra quando o usuário toca em "Atualizar"
  if (req.mode === 'navigate') {
    ev.respondWith(caches.open(VERSION).then(async c => (await c.match('./index.html', { ignoreSearch: true })) || fetch(req))
      .catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  // arquivos do app e base: cache primeiro, atualiza em segundo plano
  ev.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req).catch(() => null);
    if (res && res.ok) c.put(req, res.clone());
    return res || new Response('Sem conexão', { status: 503 });
  }));
});

self.addEventListener('message', ev => { if (ev.data === 'skipWaiting') self.skipWaiting(); });
