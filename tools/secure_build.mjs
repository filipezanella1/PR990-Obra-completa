// Gera o site PROTEGIDO (tudo cifrado) em build-secure/: só a tela de acesso, o service worker e arquivos .bin
// com nomes aleatórios ficam visíveis. Chave dos dados (AES-256-GCM) embrulhada por código de acesso (PBKDF2-SHA256).
// uso: node tools/secure_build.mjs                 (usa/gera privado/secure.json com a chave e os códigos)
//      node tools/secure_build.mjs --add "Nome"    (cria mais um código de acesso)
//      node tools/secure_build.mjs --del "Nome"    (revoga um código)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { webcrypto as C, randomBytes } from 'crypto';
const root = new URL('..', import.meta.url).pathname, out = join(root, 'build-secure'), sec = join(root, 'privado/secure.json');
const ITER = 600000;
const AL = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newCode = () => { const b = randomBytes(20); let s = ''; for (let i = 0; i < 20; i++) s += AL[b[i] % AL.length]; return s.match(/.{5}/g).join('-'); };
const b64 = u => Buffer.from(u).toString('base64');
let S = existsSync(sec) ? JSON.parse(readFileSync(sec, 'utf8')) : null;
if (!S) { S = { dk: b64(randomBytes(32)), codes: [{ n: 'Dono', code: newCode() }] }; console.log('NOVA chave de dados e código do dono criados.'); }
const ai = process.argv.indexOf('--add'); if (ai > 0) { S.codes.push({ n: process.argv[ai + 1], code: newCode() }); console.log('Código criado para', process.argv[ai + 1]); }
const di = process.argv.indexOf('--del'); if (di > 0) { S.codes = S.codes.filter(c => c.n !== process.argv[di + 1]); console.log('Código revogado:', process.argv[di + 1]); }
mkdirSync(dirname(sec), { recursive: true }); writeFileSync(sec, JSON.stringify(S, null, 1));
const dk = await C.subtle.importKey('raw', Buffer.from(S.dk, 'base64'), 'AES-GCM', true, ['encrypt']);
const enc = async buf => { const iv = randomBytes(12); const ct = new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, dk, buf)); return Buffer.concat([iv, Buffer.from(ct)]); };
// chave embrulhada por cada código
const wraps = [];
for (const c of S.codes) {
  const code = c.code.replace(/[^A-Z0-9]/g, ''); const salt = randomBytes(16), iv = randomBytes(12);
  const base = await C.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  const wk = await C.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  wraps.push({ salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, wk, Buffer.from(S.dk, 'base64')))) });
}
for (let i = wraps.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [wraps[i], wraps[j]] = [wraps[j], wraps[i]]; }   // ordem não revela quem é quem
// arquivos do app e dados (tudo o que vira .bin)
const walk = d => readdirSync(join(root, d)).flatMap(f => { const p = join(d, f); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const build = readFileSync(join(root, 'index.html'), 'utf8').replace('<head>', '<head>\n<script>window.__SECURE__=1</script>\n<meta name="robots" content="noindex, nofollow">');
const list = [['app.html', Buffer.from(build)],
  ...walk('src').filter(f => /\.(js|css)$/.test(f)), ...walk('vendor'), ...walk('data').filter(f => f.endsWith('.json')),
  ...walk('pranchas'), ...walk('drenagem'), ...walk('memorias')].map(x => Array.isArray(x) ? x : [x, readFileSync(join(root, x))]);
rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'enc'), { recursive: true });
const files = {}, pre = []; const BUILD = Date.now().toString(36);
for (const [p, buf] of list) {
  let data = buf; if (p.startsWith('src/') || p === 'app.html') data = Buffer.from(buf.toString('utf8').replace(/__BUILD__/g, BUILD));
  const id = randomBytes(12).toString('hex'); const blob = await enc(data); const PART = 20 * 1024 * 1024;   // Cloudflare Pages: até 25 MiB por arquivo
  if (blob.length <= PART) { files[p] = id; writeFileSync(join(out, 'enc', id + '.bin'), blob); }
  else { const n = Math.ceil(blob.length / PART); files[p] = [id, n]; for (let i = 0; i < n; i++) writeFileSync(join(out, 'enc', `${id}-${i}.bin`), blob.subarray(i * PART, (i + 1) * PART)); }
  if (!/^(pranchas|drenagem|memorias)\//.test(p)) pre.push(...(Array.isArray(files[p]) ? Array.from({ length: files[p][1] }, (_, i) => `./enc/${id}-${i}.bin`) : ['./enc/' + id + '.bin']));
}
writeFileSync(join(out, 'enc/m.bin'), await enc(Buffer.from(JSON.stringify({ v: 1, b: BUILD, files }))));
writeFileSync(join(out, 'enc/k.json'), JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, wraps }));
// casca pública: tela de acesso, service worker, ícones, manifesto genérico, cabeçalhos
copyFileSync(join(root, 'secure/index.html'), join(out, 'index.html'));
writeFileSync(join(out, 'sw.js'), readFileSync(join(root, 'secure/sw.js'), 'utf8').replace('__PRE__', JSON.stringify(pre)).replace(/__BUILD__/g, BUILD));
mkdirSync(join(out, 'icons')); for (const f of readdirSync(join(root, 'icons'))) copyFileSync(join(root, 'icons', f), join(out, 'icons', f));
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify({ name: 'Painel PR-990', short_name: 'PR-990', id: './', start_url: './#painel', scope: './', display: 'standalone', background_color: '#2a3036', theme_color: '#2a3036',
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }));
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(out, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow, noarchive
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/enc/k.json
  Cache-Control: no-cache
/enc/m.bin
  Cache-Control: no-cache
`);
writeFileSync(join(out, 'netlify.toml'), '[build]\n  publish = "."\n  command = ""\n');
const mb = readdirSync(join(out, 'enc')).reduce((s, f) => s + statSync(join(out, 'enc', f)).size, 0) / 1e6;
console.log(`build-secure/: ${Object.keys(files).length} arquivos cifrados (${mb.toFixed(1)} MB), ${S.codes.length} código(s) de acesso, versão ${BUILD}`);
