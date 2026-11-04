/* Service worker do painel protegido: guarda só arquivos CIFRADOS e decifra cada pedido no próprio aparelho,
   com a chave que fica no IndexedDB depois do código de acesso. Sem a chave, nada do conteúdo é servido. */
const VERSION = 'pr990-s-__BUILD__';
const MIDIA = 'pr990-midia';
const SHELL = ['./', './index.html', './manifest.webmanifest', './enc/k.json', './enc/m.bin', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png', './icons/apple-touch-icon.png'];
const PRE = __PRE__;   // blobs cifrados do app e dos dados (nomes aleatórios)
const MEDIA = /^(pranchas|drenagem|memorias)\//;
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', pdf: 'application/pdf', pfb: 'application/octet-stream', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8' };

self.addEventListener('install', ev => { ev.waitUntil(caches.open(VERSION).then(c => c.addAll([...SHELL, ...PRE].map(u => new Request(u, { cache: 'reload' }))))); });
self.addEventListener('activate', ev => { ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== MIDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', ev => { if (ev.data === 'skipWaiting') self.skipWaiting(); if (ev.data === 'logout') { KEY = null; MAN = null; } });

const db = (mode, fn) => new Promise((ok, no) => { const r = indexedDB.open('pr990sec', 1); r.onupgradeneeded = () => r.result.createObjectStore('k');
  r.onerror = () => no(r.error); r.onsuccess = () => { const tx = r.result.transaction('k', mode); const q = fn(tx.objectStore('k')); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); }; });
let KEY = null, MAN = null;
async function key() { if (KEY) return KEY; try { KEY = await db('readonly', s => s.get('dk')) || null; } catch { KEY = null; } return KEY; }
async function blob(url, store) {           // cache primeiro (cifrado); senão rede
  const c = await caches.open(store); let r = await c.match(url, { ignoreSearch: true });
  if (!r) { r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(url, r.clone()); }
  return r.arrayBuffer();
}
async function dec(buf, k) { const u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, k, u.subarray(12)); }
async function man(k) { if (MAN) return MAN; MAN = JSON.parse(new TextDecoder().decode(await dec(await blob(new URL('enc/m.bin', self.registration.scope).href, VERSION), k))); return MAN; }

self.addEventListener('fetch', ev => {
  const req = ev.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;
  let p = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  if (p === '' || p === 'index.html') { ev.respondWith(fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html'))); return; }
  if (p === 'sw.js') return;
  if (p.startsWith('enc/') || p.startsWith('icons/') || p === 'manifest.webmanifest') { ev.respondWith(caches.match(req, { ignoreSearch: true }).then(h => h || fetch(req))); return; }
  ev.respondWith((async () => {
    const k = await key();
    if (!k) return req.mode === 'navigate' ? Response.redirect(scope.href + (url.hash || ''), 302) : new Response('Acesso restrito', { status: 401 });
    let m; try { m = await man(k); } catch { KEY = null; MAN = null; return req.mode === 'navigate' ? Response.redirect(scope.href, 302) : new Response('Chave inválida', { status: 401 }); }
    const f = m.files[p]; if (!f) return new Response('Não encontrado', { status: 404 });
    const ext = p.split('.').pop().toLowerCase(); const parts = Array.isArray(f) ? Array.from({ length: f[1] }, (_, i) => new URL(`enc/${f[0]}-${i}.bin`, scope).href) : [new URL('enc/' + f + '.bin', scope).href];
    const net = async () => { const bufs = []; for (const u of parts) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); bufs.push(new Uint8Array(await r.arrayBuffer())); }
      const all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; } return all.buffer; };
    try {
      let buf;
      if (MEDIA.test(p)) {            // mídia: guardada cifrada sob o próprio endereço (conta como "baixada")
        const c = await caches.open(MIDIA); const logical = new URL(p, scope).href; let r = await c.match(logical);
        if (r) buf = await r.arrayBuffer(); else { buf = await net(); await c.put(logical, new Response(buf)); }
      } else if (parts.length === 1) buf = await blob(parts[0], VERSION);
      else { const c = await caches.open(VERSION); const bufs = []; for (const u of parts) bufs.push(new Uint8Array(await blob(u, VERSION))); const all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; } buf = all.buffer; }
      const plain = await dec(buf, k);
      return new Response(plain, { status: 200, headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch (e) { return new Response('Indisponível sem internet: ' + p, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  })());
});
