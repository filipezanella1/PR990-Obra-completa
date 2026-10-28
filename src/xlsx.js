// Leitor mínimo de .xlsx (zip + XML), sem dependências: lê valores em cache e fórmulas.
// Funciona no navegador e no Node 18+ (DecompressionStream 'deflate-raw').

async function inflate(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
function unzipIndex(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('arquivo não é um .xlsx válido');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder();
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    files.set(name, { method, csize, off });
    p += 46 + nl + el + cl;
  }
  return { u8, dv, files };
}
async function readEntry(z, name) {
  const e = z.files.get(name); if (!e) return null;
  const nl = z.dv.getUint16(e.off + 26, true), el = z.dv.getUint16(e.off + 28, true);
  const start = e.off + 30 + nl + el; const data = z.u8.subarray(start, start + e.csize);
  const raw = e.method === 0 ? data : await inflate(data);
  return new TextDecoder().decode(raw);
}
const unesc = s => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (m, a, d, h) => d ? String.fromCharCode(+d) : h ? String.fromCharCode(parseInt(h, 16)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[a.toLowerCase()]));
const attr = (s, k) => { const m = new RegExp('\\b' + k + '="([^"]*)"').exec(s); return m ? unesc(m[1]) : null; };

export async function readXlsx(buf) {
  const z = unzipIndex(buf);
  const wbx = await readEntry(z, 'xl/workbook.xml');
  const rels = await readEntry(z, 'xl/_rels/workbook.xml.rels') || '';
  const rmap = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) rmap[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const sheets = [];
  for (const m of wbx.matchAll(/<sheet\b[^>]*>/g)) {
    let t = rmap[attr(m[0], 'r:id')] || ''; t = t.replace(/^\/?xl\//, '').replace(/^\//, '');
    sheets.push({ name: attr(m[0], 'name'), path: 'xl/' + t });
  }
  const ssx = await readEntry(z, 'xl/sharedStrings.xml') || '';
  const ss = [...ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const cache = new Map();
  async function sheet(name) {
    const s = sheets.find(x => x.name === name); if (!s) return null;
    if (cache.has(name)) return cache.get(name);
    const x = await readEntry(z, s.path) || '';
    const cells = new Map(); let maxRow = 0, maxCol = 0;
    for (const m of x.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = m[1], body = m[2] || '';
      const ref = attr(a, 'r'); if (!ref) continue;
      const t = attr(a, 't');
      const fm = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body); const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      let v = vm ? unesc(vm[1]) : null;
      if (t === 's') v = v === null ? null : ss[+v];
      else if (t === 'inlineStr') { const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body); v = im ? unesc(im[1]) : null; }
      else if (t === 'b') v = v === '1';
      else if (t === 'str' || t === 'e') { /* texto */ }
      else if (v !== null) v = +v;
      const cell = { v }; if (fm) cell.f = '=' + unesc(fm[1]);
      cells.set(ref, cell);
      const rc = xlSplitRef(ref); if (rc) { maxRow = Math.max(maxRow, rc[0]); maxCol = Math.max(maxCol, rc[1]); }
    }
    const o = { name, cells, maxRow, maxCol, get: (r, c) => cells.get(xlColName(c) + r)?.v ?? null, cell: (r, c) => cells.get(xlColName(c) + r) || null };
    cache.set(name, o); return o;
  }
  return { names: sheets.map(s => s.name), sheet };
}
export function xlColName(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
function xlSplitRef(ref) { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2], c]; }
