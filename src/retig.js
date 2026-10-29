// Lê a planilha do retigráfico da obra (RETIGRAFICO OBRA 515 – PR 990 REBOUÇAS – dd.mm.aa.xlsx) no navegador.
// Mesma lógica de tools/retigrafico.py: avanço por estaca = cor das células das linhas Atacado/Concluído de cada frente;
// bueiros e galerias (OAC) = ícones do desenho (cor = situação) com o rótulo "TIPO Estaca X" e o comprimento mais próximos.
import { readXlsx } from './xlsx.js?v=__BUILD__';

const RT_FR = [['p0', 'Corte – aterro', 'Corte - Aterro', true, '#fcd5b5', '#e46c0a'], ['p1', 'Regularização', 'Regula', true, '#b7dee8', '#31859c'],
  ['p2', '1ª camada de reforço', '1ª C Reforço', true, '#ccc1da', '#604a7b'], ['p3', '2ª camada de reforço', '2ª C Reforço', true, '#d7e4bd', '#77933c'],
  ['p4', 'Sub-base', 'Sub - Base', true, '#e6b9b8', '#953735'], ['p5', 'Base – BGS', 'Base - BGS', true, '#948a54', '#4a452a'],
  ['p6', 'Imprimação', 'Imprimação', false, null, '#808080'], ['p7', 'CBUQ', 'CBUQ', false, null, '#0d0d0d']];
const rtNorm = s => s.toLowerCase().replace(/[\s\-ªº°]/g, '').replace('1c', '1').replace('2c', '2');
const rtS = v => v === null || v === undefined ? '' : String(v);
const rtIsNum = v => typeof v === 'number' && Number.isFinite(v);
const RT_BRX = /^(BSTC|BDTC|BTTC|BSCC|BTCC|BDCC)/;

export async function parseRetigrafico(buf, { drenagem = [], travas = [], oacFix = [], oae = [] } = {}) {
  const X = await readXlsx(buf);
  const ws = await X.sheet(X.names[0]);
  const estRows = []; for (let r = 1; r <= ws.maxRow; r++) if (rtS(ws.get(r, 2)).trim().toUpperCase() === 'ESTACA') estRows.push(r);
  if (!estRows.length) throw new Error('não encontrei as linhas "ESTACA" – é a planilha do retigráfico?');
  // data da atualização: última data nas 12 primeiras linhas
  let upd = null;
  for (let r = 1; r <= 12; r++) for (let c = 1; c <= ws.maxCol; c++) if (ws.isDate(r, c)) upd = ws.get(r, c);
  const ymd = upd !== null ? new Date(Math.round((upd - 25569) * 86400000)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  // frentes: preenchimento das células
  const filled = (r, c) => { const f = ws.fill(r, c); return !!(f && f.type && f.type !== 'none' && !(f.rgb && ['00FFFFFF', 'FFFFFFFF'].includes(f.rgb.toUpperCase()))); };
  const cells = new Map(); let prev = 0;
  for (const er of estRows) {
    const rows = []; let cur = null;
    for (let r = prev + 1; r < er; r++) { if (ws.hidden.has(r)) continue; const a = rtS(ws.get(r, 2)).trim(), b = rtS(ws.get(r, 3)).trim(); if (a) cur = a; if (b && cur) rows.push([r, cur, b.toLowerCase().startsWith('atac') ? 'a' : 'c']); }
    for (let c = 4; c <= ws.maxCol; c++) { const e = ws.get(er, c); if (!rtIsNum(e)) continue; for (const [r, fr, st] of rows) if (filled(r, c)) { const k = Math.trunc(e); if (!cells.has(k)) cells.set(k, []); cells.get(k).push([fr, st]); } }
    prev = er;
  }
  const frentes = RT_FR.map(([id, n, key, hasA, ca, cc]) => { let s = '';
    for (let k = 0; k < 643; k++) { const d = cells.get(Math.max(1, k)) || []; const conc = d.some(([f, st]) => rtNorm(f) === rtNorm(key) && st === 'c'); const at = hasA && d.some(([f, st]) => rtNorm(f) === rtNorm(key) && st === 'a'); s += conc ? '2' : at ? '1' : '0'; }
    return { id, n, a: hasA, ca, cc, c: s }; });
  // OAC: ícones do desenho
  const dname = X.files.find(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
  const x = dname ? await X.raw(dname) : '';
  const pos = (a, t) => { const m = new RegExp(`<xdr:${t}><xdr:col>(\\d+)</xdr:col><xdr:colOff>(-?\\d+)</xdr:colOff><xdr:row>(\\d+)</xdr:row>`).exec(a); return m ? [+m[3] + 1, +m[1] + 1] : null; };
  const estAt = (r, c) => { const er = estRows.find(e => e >= r); const v = er ? ws.get(er, c) : null; return rtIsNum(v) ? v : null; };
  const icons = [], boxes = [];
  for (const m of x.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:\1>/g)) {
    const a = m[2]; const txt = [...a.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('');
    const bm = /^\s*([\d,]+)\s*m/.exec(txt);
    if (bm && !txt.includes('Rede')) { const p = pos(a, 'from'); if (p) boxes.push([p[0], p[1], bm[1]]); continue; }
    if (!a.includes('<xdr:grpSp>')) continue;
    const p0 = pos(a, 'from'); if (!p0) continue; const [r0, c0] = p0; if (r0 < 12) continue;
    const fl = [...a.matchAll(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/g)].map(f => { const v = /val="(\w+)"/.exec(f[1]); const lm = /lumMod val="(\d+)"/.exec(f[1]); return (v ? v[1] : '') + (f[1].includes('lumMod') && lm ? '/' + lm[1] : ''); });
    const main = fl.filter(f => f !== 'bg1' && f !== 'lt1'); const col = main[0] || 'bg1';
    const st = /^(tx2\/75000|002060|accent1\/75000|0070C0|1F3864)/.test(col) ? 'c' : /^(00B0F0|accent1$|accent1\/60000|tx2\/60000|accent5)/.test(col) ? 'a' : 'n';
    const e = estAt(r0, c0); if (e !== null) icons.push({ r: r0, c: c0, e, st });
  }
  const pe = t => { const m = /Estaca\s*(\d+)(?:\s*\+\s*([\d,]+))?/.exec(t); if (!m) return null; const e = +m[1]; if (e > 700) return null; let fv = 0;
    if (m[2]) { fv = parseFloat(m[2].replace(',', '.')); if (fv >= 20 && !m[2].includes(',')) fv /= 100; } return e + fv / 20; };
  const labs = [];
  for (let r = 1; r <= ws.maxRow; r++) for (let c = 3; c <= ws.maxCol; c++) { const v = ws.get(r, c); if (typeof v === 'string' && /Estaca\s*\d/i.test(v)) labs.push([v.trim(), pe(v)]); }
  const B = drenagem.slice(1);
  const BUE = B.filter(r => r && rtIsNum(r[1]) && RT_BRX.test(rtS(r[2])) && !rtS(r[2]).includes('REMOVER')).map(r => [r[1], r[2]]);
  const used = new Set(), ub = new Set(), oac = [];
  const bkey = b => b.join('|');
  for (const ic of [...icons].sort((a, b) => a.e - b.e || a.c - b.c)) {
    const e = ic.e + 0.5; let t, est;
    const cand = labs.map(([, v], k) => [v, k]).filter(([v, k]) => v !== null && !used.has(k) && Math.abs(v - e) <= 2.6).map(([v, k]) => [Math.abs(v - e), k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (cand.length) { const k = cand[0][1]; used.add(k); t = labs[k][0].replace(/\s*Estaca.*/, ''); est = labs[k][1]; }
    else { const bb = [...BUE].sort((a, b) => Math.abs(a[0] - e) - Math.abs(b[0] - e)); if (bb.length && Math.abs(bb[0][0] - e) <= 1.5) { t = rtS(bb[0][1]).replace(/\s*\(.*/, ''); est = bb[0][0]; } else { t = 'OAC'; est = e; } }
    const bc = boxes.filter(b => !ub.has(bkey(b)) && Math.abs(b[0] - ic.r) <= 9 && Math.abs(b[1] - ic.c) <= 3).sort((a, b) => (Math.abs(a[1] - ic.c) + Math.abs(a[0] - ic.r) / 10) - (Math.abs(b[1] - ic.c) + Math.abs(b[0] - ic.r) / 10));
    const L = bc.length ? bc[0][2] : null; if (bc.length) ub.add(bkey(bc[0]));
    oac.push({ e: +est.toFixed(3), t, L, st: ic.st });
  }
  oac.sort((a, b) => a.e - b.e);
  const BL = B.filter(r => r && rtIsNum(r[1]) && rtIsNum(r[6]) && RT_BRX.test(rtS(r[2])) && !rtS(r[2]).includes('REMOVER')).map(r => [r[1], r[6]]);
  const vals = boxes.map(b => b[2]); const orphan = [];
  for (const o of oac) for (const [e2, L2] of BL) { const sv = L2.toFixed(2).replace('.', ',');
    if (Math.abs(e2 - o.e) <= 1 && vals.includes(sv) && o.L !== sv) { const other = oac.find(q => q !== o && q.L === sv); if (other) other.L = o.L; else if (o.L) orphan.push(o.L); o.L = sv; } }
  for (const o of oac) {
    if (!o.L && orphan.length) o.L = orphan.shift();
    if (o.t === 'OAC') { const lab = labs.find(([t, v]) => v === null && /Estaca\s*\d{4}/.test(t)); if (lab) { o.t = lab[0].replace(/\s*Estaca.*/, ''); o.obs = `rótulo no retigráfico: "${lab[0]}"`; } }
    if (o.L === null) delete o.L;
  }
  for (const fx of oacFix) { const o = oac.find(q => Math.abs(q.e - fx.e) < 0.01); if (o) o.st = fx.st; }
  return { fonte: `Retigráfico da obra 515 – PR-990 Rebouças (TCE), atualização de ${ymd.split('-').reverse().join('/')}`, data: ymd, frentes, oac, oae, travas: travas.map(t => ({ ...t })) };
}

// Estudo de britagem (Planejamento Britagem … – dd.mm.aa.xlsx): mesma leitura de tools/britagem.py
export async function parseBritagem(buf, fileName = '') {
  const X = await readXlsx(buf);
  const B = await X.sheet('Britagem'), P = await X.sheet('Planejamento Britagem'), V = await X.sheet('Volumes Rebouças');
  if (!B || !P) throw new Error('não encontrei as abas "Britagem" e "Planejamento Britagem"');
  const v = (ws, a) => ws && ws.cells.get(a) ? ws.cells.get(a).v : null;
  const num = x => +x || 0;
  const PROD = [['mac', 'G'], ['bica', 'H'], ['b1', 'I'], ['ped', 'J'], ['po', 'K']];
  const comp = r => Object.fromEntries(PROD.filter(([, c]) => num(v(B, c + r))).map(([p, c]) => [p, num(v(B, c + r))]));
  const dt = (ws, a) => { const x = v(ws, a); return typeof x === 'number' && x > 20000 ? new Date(Math.round((x - 25569) * 86400000)).toISOString().slice(0, 10) : null; };
  const nm = fileName.split('/').pop().replace(/_/g, ' '); const tag = nm.includes(' - ') ? nm.split(' - ').pop().replace(/\.xlsx$/i, '') : (nm.replace(/\.xlsx$/i, '') || 'planilha');
  return {
    fonte: `Estudo de britagem – Pedreira Faxinal dos Francos, obra 515.02 – Rebouças (${tag})`,
    data: dt(P, 'D44') || dt(B, 'G45'),
    dens: { bica: num(v(B, 'E18')), bgs: num(v(B, 'E20')), dreno: num(v(B, 'E22')), conc: num(v(B, 'E24')) },
    comp: { bica: comp(18), bgs: comp(20), dreno: comp(22), conc: comp(24) },
    rate: Object.fromEntries(PROD.map(([p, c]) => [p, num(v(B, c + '40'))])),
    pri: { h: num(v(B, 'B40')), t: num(v(B, 'C40')), d: num(v(B, 'D40')) },
    reb: { h: num(v(B, 'B41')), t: num(v(B, 'C41')), d: num(v(B, 'D41')) },
    rend: num(v(B, 'E40')),
    rocha: { dens: num(v(P, 'K62')), m3m: num(v(P, 'K63')), hFuro: num(v(P, 'K64')), furCap: num(v(B, 'G56')), furos: num(v(P, 'K65')), hEst: num(v(P, 'K66')) },
    estoque: Object.fromEntries(PROD.map(([p, c]) => [p, num(v(B, c + '29'))])),
    reb515: { dreno: Math.round(num(v(B, 'D22')) * 1000) / 1000, conc: Math.round(num(v(B, 'D24')) * 1000) / 1000,
      estudo_t: { reforco: Math.round(num(v(V, 'G48')) * 10) / 10, subbase: Math.round(num(v(V, 'G49')) * 10) / 10, base: Math.round(num(v(V, 'G50')) * 10) / 10 } },
  };
}
