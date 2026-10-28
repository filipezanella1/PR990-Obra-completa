// Lê a planilha de medição do contrato (Medição Resumo + memórias de cálculo por estaca).
import { readXlsx } from './xlsx.js?v=__BUILD__';

const U = v => String(v ?? '').trim().toUpperCase();
const fl = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  let s = String(v).trim(); if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const r4 = x => x === null ? null : Math.round(x * 1e4) / 1e4;

function findResumo(names) {
  return names.find(n => /^medi[cç][aã]o resumo$/i.test(n.trim())) || names.find(n => /medi[cç][aã]o resumo/i.test(n) && !/consolid/i.test(n));
}

export async function memoria(X, tab) {
  const nm = X.names.find(n => n.trim().toLowerCase() === tab.trim().toLowerCase()); if (!nm) return [];
  const ws = await X.sheet(nm); if (!ws) return [];
  let hr = null;
  for (let r = 1; r <= 25 && !hr; r++) for (let c = 1; c <= ws.maxCol; c++) if (['CÓDIGO', 'CODIGO'].includes(U(ws.get(r, c)))) { hr = r; break; }
  if (!hr) return [];
  const col = {};
  for (let c = 1; c <= ws.maxCol; c++) for (const rr of [hr - 1, hr]) {
    const u = U(ws.get(rr, c));
    if (u === 'CÓDIGO' || u === 'CODIGO') col.cod ??= c;
    else if (u === 'LADO' || u === 'DESIG.') col.lado ??= c;
    else if (u === 'ESTACAS') col.est ??= c;
    else if (u === 'TOTAL') col.tot = c;
    else if (u.startsWith('OBSERVA')) col.obs ??= c;
  }
  if (!col.est || !col.cod) return [];
  const out = [];
  for (let r = hr + 2; r <= ws.maxRow; r++) {
    const a = U(ws.get(r, 1)); if (a.startsWith('TOTAL') || a.startsWith('ACUMULADO')) break;
    const cod = ws.get(r, col.cod); const tot = col.tot ? fl(ws.get(r, col.tot)) : null;
    if (cod === null || cod === '' || tot === null) continue;
    const e = col.est; const [ei, mi, ef, mf] = [0, 1, 2, 3].map(k => ws.get(r, e + k));
    const est = (x, y) => { x = fl(x); y = fl(y) || 0; return x === null ? null : x + y / 20; };
    out.push({ cod: String(cod).trim(), lado: col.lado ? String(ws.get(r, col.lado) ?? '').trim() : '', ei: est(ei, mi), ef: est(ef, mf), tot });
  }
  return out;
}

export async function parseMedicao(buf, fileName = '') {
  const X = await readXlsx(buf);
  const rs = findResumo(X.names); if (!rs) throw new Error('não encontrei a aba "Medição Resumo"');
  const ws = await X.sheet(rs);
  let hr = 0; for (let r = 1; r <= 40 && !hr; r++) if (U(ws.get(r, 1)) === 'CÓDIGO' || U(ws.get(r, 1)) === 'CODIGO') hr = r;
  if (!hr) throw new Error('cabeçalho "Código" não encontrado na Medição Resumo');
  // colunas pelo cabeçalho (com valores padrão do layout do DER/PR)
  const C = {};
  for (let c = 1; c <= ws.maxCol; c++) for (const rr of [hr, hr + 1]) {
    const u = U(ws.get(rr, c)).replace(/\s+/g, '');
    if (u === 'ACUM.ANT' || u === 'ACUMULADOANTERIOR') C.ant ??= c; else if (u.startsWith('LÍQ') || u.startsWith('LIQ')) C.liq ??= c; else if (u === 'ACUM.ATUAL' || u === 'ACUMULADOATUAL') C.acum ??= c; else if (u === 'UNITÁRIO' || u === 'UNITARIO') C.p ??= c;
  }
  C.q = 4; C.ant ??= 6; C.liq ??= 7; C.acum ??= 8; C.p ??= 9;
  const itens = []; let grupo = '';
  for (let r = hr + 2; r <= ws.maxRow; r++) {
    const a = ws.get(r, 1), b = ws.get(r, 2);
    if (U(b).startsWith('TOTAL')) break;
    if (a === null || a === '') continue;
    const q = fl(ws.get(r, C.q));
    if (q === null) { if (typeof a === 'number' && a < 100) grupo = String(b ?? '').trim(); continue; }
    const code = String(a).trim(); if (!code) continue;
    const gf = ws.cell(r, C.liq)?.f || '';
    const tabs = [...new Set([...gf.matchAll(/'((?:[^']|'')+)'!|([A-Za-z0-9_.À-ú]+)!/g)].map(m => (m[1] || m[2]).replace(/''/g, "'")))];
    const ant = fl(ws.get(r, C.ant)) || 0, liq = fl(ws.get(r, C.liq)) || 0; let acum = fl(ws.get(r, C.acum)); if (acum === null) acum = ant + liq;
    itens.push({ l: r, c: code, s: String(b ?? '').trim(), u: String(ws.get(r, 3) ?? '').trim(), g: grupo, q: q || 0, p: fl(ws.get(r, C.p)) || 0, ant, liq, acum, tabs });
  }
  // memórias por estaca
  const memo = new Map();
  for (const it of itens) {
    let recs = [];
    for (const t of it.tabs) { if (!memo.has(t)) memo.set(t, await memoria(X, t)); recs = recs.concat(memo.get(t)); }
    const own = recs.filter(x => x.cod === it.c || x.cod.replace(/\D/g, '') === it.c.replace(/\D/g, ''));
    if (own.length) recs = own;
    it.r = recs.filter(x => x.ei !== null).map(x => [r4(x.ei), x.ef === null ? null : r4(x.ef), x.lado, Math.round(x.tot * 1e4) / 1e4]);
    it.rsem = Math.round(recs.filter(x => x.ei === null).reduce((s, x) => s + x.tot, 0) * 1e4) / 1e4;
    delete it.tabs;
  }
  const mm = /(\d{1,3})\s*[ªaº°]?\s*[_\s-]*medi/i.exec(fileName.replace(/_/g, ' '));
  const nome = mm ? `${mm[1]}ª medição` : (fileName.replace(/\.xlsx$/i, '') || 'medição');
  return { nome, arquivo: fileName, lida: new Date().toISOString().slice(0, 10), itens };
}
