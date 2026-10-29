import { Workbook, isErr } from './engine.js';
import { initObra } from './obra.js?v=__BUILD__';

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [0, 1, 2, 3, 4].map(nf);
const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'boolean' ? +v : 0);
const fQ = (v, d = 2) => { if (isErr(v)) return v.code; v = num(v); return Math.abs(v) < 5e-7 ? '–' : NF[d].format(v); };
const fR = v => { if (isErr(v)) return v.code; v = num(v); return Math.abs(v) < 0.005 ? '–' : (v < 0 ? '−R$ ' : 'R$ ') + NF[2].format(Math.abs(v)); };
const fRs = v => { v = num(v); if (Math.abs(v) < 0.005) return '–'; return (v > 0 ? '+' : '−') + 'R$ ' + NF[2].format(Math.abs(v)); };
const fP = v => (v === null || v === undefined || !Number.isFinite(v)) ? '' : (v > 0 ? '+' : '') + NF[1].format(v * 100) + '%';
const estStr = dec => { const e = Math.floor(dec + 1e-9); return e + '+' + NF[2].format((dec - e) * 20); };
const parseEst = s => { const m = /^(\d+)\+([\d.,]+)$/.exec(String(s).trim()); return m ? +m[1] + parseFloat(m[2].replace(',', '.')) / 20 : null; };
// ---------------------------------------------------------------- versão mestra × versão individual
// A versão mestra (data/mestre.json) é publicada pelo dono (com a senha e um token do GitHub). Cada aparelho lê a mestra
// e guarda por cima as próprias alterações, por área; quando a mestra muda numa área alterada, o app pergunta o que fazer.
const MAREAS = { simulacao: { n: 'Simulação', k: ['simSel', 'simMeses', 'simPar'] }, britagem: { n: 'Britagem', k: ['britPar', 'britSt'] }, reajuste: { n: 'Reajuste (Painel)', k: ['reajR'] }, apresentacao: { n: 'Apresentação – demais serviços', k: ['aprFin'] } };
const K2A = {}; for (const [a, o] of Object.entries(MAREAS)) for (const k of o.k) K2A[k] = a;
let MST = null;
const rawGet = k => { try { return localStorage.getItem('pr990:' + k); } catch { return null; } };
const rawSet = (k, v) => { try { v === null ? localStorage.removeItem('pr990:' + k) : localStorage.setItem('pr990:' + k, v); } catch { } };
const mVal = k => { const a = K2A[k]; const v = MST && MST.areas && MST.areas[a] ? MST.areas[a][k] : undefined; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
const hashStr = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const mHash = a => hashStr(JSON.stringify(MAREAS[a].k.map(k => (MST && MST.areas && MST.areas[a] || {})[k] ?? null)));
const areaLocal = a => MAREAS[a].k.some(k => rawGet(k) !== null);
const store = {
  get(k, d) { try { const v = rawGet(k); if (v !== null) return JSON.parse(v); if (K2A[k] && !areaLocal(K2A[k])) { const m = mVal(k); if (m !== undefined) return m; } return d; } catch { return d; } },
  set(k, v) { const a = K2A[k]; if (a && !areaLocal(a)) { for (const kk of MAREAS[a].k) if (kk !== k) { const m = mVal(kk); if (m !== undefined) rawSet(kk, JSON.stringify(m)); } rawSet('mb:' + a, mHash(a)); }
    rawSet(k, JSON.stringify(v));
    if (a && MAREAS[a].k.every(kk => JSON.stringify(mVal(kk) ?? null) === (rawGet(kk) ?? 'null'))) areaReset(a);   // igual à mestra: volta a acompanhar a mestra
    if (a) setTimeout(verUI, 0); },
};
function fmtNF(v, f) {
  if (isErr(v)) return v.code;
  if (typeof v === 'string') return v;
  if (!f) return fQ(v);
  if (f.includes('%')) return NF[2].format(num(v) * 100) + '%';
  const d = (/\.(0+)/.exec(f) || [, ''])[1].length; const u = (/"\s?([^"]+)"/.exec(f) || [, ''])[1];
  return NF[d].format(num(v)) + (u ? ' ' + u.trim() : '');
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const b = new Blob(['﻿' + text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => { if (typeof v === 'number') return NF[4].format(v).replace(/\./g, ''); const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

// ---------------------------------------------------------------- dados
let M, BASE, wb, END;
const S = { ei: 0, mi: 0, ef: 642, mf: 15.817, cap: 0.048, eai: 1.2, rr: 0.5 };

async function loadData() {
  if (window.__PR990__) return window.__PR990__;
  const get = f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  const [model, base, painel, insumos, protegido, avanco, eixo, pranchas, britagem, reajuste] = await Promise.all(['model', 'base', 'painel', 'insumos', 'protegido', 'avanco', 'eixo', 'pranchas', 'britagem', 'reajuste'].map(f => get(f + '.json')));
  const mestre = await fetch('data/mestre.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  return { model, base, painel, insumos, protegido, avanco, eixo, pranchas, britagem, reajuste, mestre };
}

// ---------------------------------------------------------------- cálculo
function applyInputs() {
  const I = M.meta.inputs;
  wb.set(I.ei, S.ei); wb.set(I.mi, S.mi); wb.set(I.ef, S.ef); wb.set(I.mf, S.mf);
  wb.set(I.cap, S.cap); wb.set(I.eai, S.eai); wb.set(I.rr, S.rr);
  store.set('trecho', { ei: S.ei, mi: S.mi, ef: S.ef, mf: S.mf }); store.set('prem', { cap: S.cap, eai: S.eai, rr: S.rr });
}
const C = a => wb.cell(a);

// ---------------------------------------------------------------- seletor
function renderSelector() {
  const segs = BASE.sheets['Resumo por segmento'].slice(1).filter(r => r[0] && /^S\d/.test(r[0]));
  const strip = $('#strip');
  const pct = x => (x / END * 100).toFixed(3) + '%';
  let h = '<div class="lane"></div>';
  for (const s of segs) { const a = parseEst(s[3]), b = parseEst(s[4]); if (a === null || b === null) continue; h += `<div class="seg" style="left:${pct(a)};width:${pct(b - a)}" title="${esc(s[0] + ' · ' + s[1] + ' · ' + s[2])}">${(b - a) / END > 0.035 ? `<span>${esc(s[0])}</span>` : ''}</div>`; }
  h += `<div class="mark" style="left:${pct(235.3)}"><span>OAE</span></div><div class="mark" style="left:${pct(326)}"><span>IN-01</span></div>`;
  h += '<div class="sel" id="selbox"></div>';
  strip.innerHTML = h;
  const ticks = $('#ticks'); let t = '';
  for (let e = 0; e <= 642; e += 50) t += `<span class="${e % 100 ? 'odd' : ''}" style="left:${pct(e)}">${e}</span>`;
  ticks.innerHTML = t;
  let drag = null;
  const pos = ev => { const r = strip.getBoundingClientRect(); return Math.max(0, Math.min(END, (ev.clientX - r.left) / r.width * END)); };
  strip.addEventListener('pointerdown', ev => { strip.setPointerCapture(ev.pointerId); drag = pos(ev); });
  strip.addEventListener('pointermove', ev => { if (drag === null) return; const x = pos(ev); setSel(Math.min(drag, x), Math.max(drag, x), false); });
  strip.addEventListener('pointerup', ev => { if (drag === null) return; const x = pos(ev); const a = Math.min(drag, x), b = Math.max(drag, x); drag = null; if (b - a > 0.05) setSel(a, b, true); });
  for (const [id, k] of [['ei', 'ei'], ['mi', 'mi'], ['ef', 'ef'], ['mf', 'mf'], ['p-cap', 'cap'], ['p-eai', 'eai'], ['p-rr', 'rr']]) {
    $('#' + id).addEventListener('input', ev => { const v = parseFloat(String(ev.target.value).replace(',', '.')); if (Number.isFinite(v)) { S[k] = k === 'cap' ? v / 100 : v; schedule(); } });
  }
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.preset;
    if (p === 'all') setSel(0, END, true);
    else { const s = segs.find(x => x[0] === p); if (s) setSel(parseEst(s[3]), parseEst(s[4]), true); }
  }));
}
function setSel(a, b, commit) {
  const ra = Math.round(a * 20) / 20, rb = Math.min(END, Math.round(b * 20) / 20);
  S.ei = Math.floor(ra + 1e-9); S.mi = +((ra - S.ei) * 20).toFixed(3); S.ef = Math.floor(rb + 1e-9); S.mf = +((rb - S.ef) * 20).toFixed(3);
  if (rb >= END - 1e-6) { S.ef = 642; S.mf = 15.817; }
  syncInputs(); drawSel(); if (commit) schedule(0);
}
function syncInputs() {
  $('#ei').value = S.ei; $('#mi').value = NF[2].format(S.mi).replace('.', ''); $('#ef').value = S.ef; $('#mf').value = String(S.mf).replace('.', ',');
  $('#p-cap').value = NF[1].format(S.cap * 100); $('#p-eai').value = NF[2].format(S.eai); $('#p-rr').value = NF[2].format(S.rr);
}
function drawSel() {
  const a = S.ei + S.mi / 20, b = S.ef + S.mf / 20, box = $('#selbox');
  if (!box) return; box.style.left = (a / END * 100) + '%'; box.style.width = Math.max(0, (b - a) / END * 100) + '%';
}
let timer = null;
function schedule(ms = 250) { clearTimeout(timer); timer = setTimeout(() => { drawSel(); recalc(); }, ms); }

// ---------------------------------------------------------------- painel
function recalc() {
  applyInputs();
  const err = C(M.meta.err);
  $('#sel-err').textContent = err ? '⚠ ' + err : '';
  $('#sel-big').textContent = `${C('G7')}  →  ${C('G8')}`;
  $('#sel-small').textContent = err ? '' : `${NF[2].format(num(C(M.meta.sel)))} m · ${NF[1].format(num(C(M.meta.frac)) * 100)}% da obra`;
  renderKPIs(); renderSummary(); renderReaj(); renderInfo(); renderDetail(); renderInsMain();
  if (current === 'insumos') renderIns();
  if (current === 'drenagem') renderDrenagem();
  if (UNL && current === 'discrepancias') renderDisc();
  if (UNL && current === 'contrato') renderCmp();
  if (UNL && current === 'medicao') OB.renderMed();
  if (current === 'pranchas') OB.renderPr();
  OB.renderCmpT();
}
function renderKPIs() {
  const unit = { m: ' m', t: ' t', m3: ' m³' };
  $('#kpis').innerHTML = M.kpi.map(k => {
    const v = C(k.cel); const cap = C(k.cap);
    const val = k.fmt === 'R$' ? fR(v) : NF[k.fmt === 'm' ? 2 : 0].format(num(v)) + unit[k.fmt];
    const cls = k.label.startsWith('CONSUMO') ? 'real' : k.label.startsWith('AJUSTADO') ? 'contr' : '';
    return `<div class="kpi ${cls}"><span class="label">${esc(k.label)}</span><span class="v num">${esc(val)}</span><span class="c">${esc(cap)}</span></div>`;
  }).join('');
}
function renderSummary() {
  const rows = M.disciplinas.map((d, i) => ({ i, d, real: num(C('J' + d.subtotal)), adj: num(C('P' + d.subtotal)) }));
  const max = Math.max(1, ...rows.map(r => Math.max(r.real, r.adj)));
  const totR = rows.reduce((s, r) => s + r.real, 0), totA = rows.reduce((s, r) => s + r.adj, 0);
  $('#summary').innerHTML = `<table class="sumtbl"><thead><tr><th>Disciplina</th><th class="n">Consumo real</th><th class="n">Ajustado ao contrato</th><th class="n">Real − ajustado</th><th style="width:22%">Real <span class="real">■</span> × contrato <span class="contr">|</span></th></tr></thead><tbody>` +
    rows.map(r => `<tr><td><a href="#painel" data-goto="disc-${r.i}">${esc(r.d.curto)}</a></td><td class="n" data-l="Real">${fR(r.real)}</td><td class="n contr" data-l="Ajustado">${fR(r.adj)}</td><td class="n ${r.real - r.adj < -0.005 ? 'neg' : ''}" data-l="Real − ajustado">${fRs(r.real - r.adj)}</td>
      <td><div class="bar"><i class="r" style="width:${r.real / max * 100}%"></i><i class="c" style="width:${r.adj / max * 100}%"></i></div></td></tr>`).join('') +
    `<tr class="tot"><td>Total do trecho</td><td class="n real">${fR(totR)}</td><td class="n contr">${fR(totA)}</td><td class="n ${totR - totA < 0 ? 'neg' : ''}">${fRs(totR - totA)}</td><td class="n">${totA ? fP(totR / totA - 1) : ''}</td></tr></tbody></table>`;
  $('#summary').querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); const el = document.getElementById(a.dataset.goto); el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}
function renderInfo() {
  let h = '<dl class="kv">';
  for (const r of M.info) { h += `<dt>${esc(r.l1)}</dt><dd>${esc(fmtNF(C('E' + r.r), r.nf1))}</dd><dt>${esc(r.l2)}</dt><dd>${esc(fmtNF(C('I' + r.r), r.nf2))}</dd>`; }
  h += '</dl>';
  $('#info').innerHTML = h;
  let g = '<dl class="kv">';
  for (const r of M.geometria) { const v = C('G' + r.r); g += `<dt title="${esc(r.obs)}">${esc(r.label)}</dt><dd>${esc(typeof v === 'number' ? (r.un === 'un' ? NF[0].format(v) : NF[2].format(v)) + (r.un && r.un !== 'un' ? ' ' + r.un : '') : (v ?? '–'))}</dd>`; }
  $('#geo').innerHTML = g + '</dl>';
}
const detOpen = new Set(store.get('detOpen', []));
function renderDetail() {
  const q = ($('#det-q').value || '').toLowerCase().trim(); const hideZero = $('#det-zero').checked;
  const host = $('#detail'); const frag = [];
  M.disciplinas.forEach((d, i) => {
    let rows = '', shown = 0;
    for (const l of d.linhas) {
      if (l.t === 'sub') { rows += `<tr class="sub"><td></td><td colspan="12">${esc(l.n)}</td></tr>`; continue; }
      const r = l.r;
      const G = l.proj ? C('G' + r) : null, H = l.ct ? C('H' + r) : null;
      const zero = Math.abs(num(G)) < 1e-9 && Math.abs(num(H)) < 1e-9;
      if (hideZero && zero) continue;
      if (q && !(l.n.toLowerCase().includes(q) || l.c.toLowerCase().includes(q) || (l.fonte || '').toLowerCase().includes(q))) continue;
      shown++;
      const base = l.ct ? (l.memq ? '<span class="pill m">MEMÓRIA</span>' : l.base === 'PROJETO' ? '<span class="pill p">PROJETO</span>' : '<span class="pill c">CONTRATO</span>') : '';
      const fonte = (l.fonte || '').replace(/^(Projeto \(memória, total\)|Projeto|Contrato) · /, '');
      const cls = ['it', l.ct ? 'ct' : '', l.rateio ? 'rateio' : '', zero ? 'zero' : ''].join(' ');
      rows += `<tr class="${cls}" id="row-${r}"><td class="code">${esc(l.c)}</td><td class="svc">${esc(l.n)}</td><td class="un" data-l="Un">${esc(l.u)}</td>` +
        (l.proj ? `<td class="n" data-l="LE">${l.le ? fQ(C('E' + r)) : ''}</td><td class="n" data-l="LD">${l.ld ? fQ(C('F' + r)) : ''}</td><td class="n" data-l="Projeto"><b>${fQ(G)}</b></td>` : '<td></td><td></td><td></td>') +
        (l.ct ? `<td class="n ${l.base === 'PROJETO' ? 'real' : 'contr'}" data-l="Qtd. real"><b>${fQ(H)}</b></td><td class="n" data-l="Preço">${NF[2].format(num(C('I' + r)))}</td><td class="n" data-l="Valor real">${fR(C('J' + r))}</td><td class="n contr" data-l="Qtd. ajustada">${fQ(C('K' + r))}</td><td class="n contr" data-l="Valor ajustado">${fR(C('P' + r))}</td><td class="n ${num(C('Q' + r)) < -0.005 ? 'neg' : ''}" data-l="Real − ajustado">${fRs(C('Q' + r))}</td>` : '<td></td><td></td><td></td><td></td><td></td><td></td>') +
        `<td class="src">${base} ${esc(fonte)}</td></tr>`;
    }
    if (q && !shown) return;
    const real = num(C('J' + d.subtotal)), adj = num(C('P' + d.subtotal));
    const open = q || detOpen.has(i) ? ' open' : '';
    frag.push(`<details class="disc" id="disc-${i}" data-i="${i}"${open}><summary><span class="no">${esc(d.num)}</span><span class="t">${esc(d.titulo)}</span><span class="v">real <b class="real">${fR(real)}</b></span><span class="v">ajustado <b class="contr">${fR(adj)}</b></span></summary>
      <div class="tbl-wrap"><table class="det"><thead><tr><th colspan="3"></th><th class="grp g-proj" colspan="3">Quantidades do projeto</th><th class="grp g-real" colspan="3">Consumo real</th><th class="grp g-contr" colspan="3">Ajustado ao contrato</th><th></th></tr>
      <tr><th>Código</th><th>Serviço</th><th>Un</th><th class="n">LE</th><th class="n">LD</th><th class="n">Projeto</th><th class="n">Qtd. real</th><th class="n">Preço</th><th class="n">Valor real</th><th class="n">Qtd. ajust.</th><th class="n">Valor ajust.</th><th class="n">Real − ajust.</th><th>Base · fonte</th></tr></thead><tbody>${rows}</tbody></table></div></details>`);
  });
  host.innerHTML = frag.join('') || '<p class="note">Nenhum serviço encontrado para a busca.</p>';
  host.querySelectorAll('details.disc').forEach(el => el.addEventListener('toggle', () => { const i = +el.dataset.i; el.open ? detOpen.add(i) : detOpen.delete(i); store.set('detOpen', [...detOpen]); }));
}
// reajuste por grupo de serviço do contrato: PI (preço inicial, valores do Painel) × coeficiente R do grupo
let REAJ = null; let RJO = store.get('reajR', {}); let RJB = store.get('reajBase', 'P');
const rjR = i => RJO[i] ?? REAJ.grupos[i].R;
function reajCalc(col) {
  const g = REAJ.grupos.map((x, i) => ({ i, n: x.n, R: rjR(i), pi: 0 }));
  for (const d of M.disciplinas) for (const l of d.linhas) { if (l.t !== 'it' || !l.ct) continue; const gi = REAJ.row[l.r]; if (gi === undefined) continue; g[gi].pi += num(C(col + l.r)); }
  g.forEach(x => { x.r = x.pi * x.R; x.tot = x.pi + x.r; });
  return g;
}
function renderReaj() {
  if (!REAJ) return;
  const G = reajCalc(RJB); const pi = G.reduce((a, x) => a + x.pi, 0), r = G.reduce((a, x) => a + x.r, 0);
  document.querySelectorAll('#rj-base button').forEach(b => b.classList.toggle('on', b.dataset.b === RJB));
  const vis = G.filter(x => Math.abs(x.pi) >= 0.005); const hid = G.length - vis.length;
  const chg = Object.keys(RJO).length;
  $('#rj-tab').innerHTML = `<table class="itbl stab rjtab"><thead><tr><th>Grupo de serviço</th><th class="n">R</th><th class="n">PI</th><th class="n">Reajuste (R)</th><th class="n">PI + R</th></tr></thead><tbody>${vis.map(x => `<tr><td>${esc(x.n)}</td><td class="n" data-l="Coef. R"><input class="rj-in${RJO[x.i] !== undefined ? ' chg' : ''}" data-i="${x.i}" inputmode="decimal" value="${NF[4].format(x.R)}" aria-label="Coeficiente R de ${esc(x.n)}"></td><td class="n" data-l="PI">${fR(x.pi)}</td><td class="n" data-l="Reajuste (R)">${fR(x.r)}</td><td class="n" data-l="PI + R"><b>${fR(x.tot)}</b></td></tr>`).join('')}
    <tr class="tot"><td>Total do trecho</td><td class="n" data-l="R médio">${pi ? (r / pi).toFixed(4).replace('.', ',') : '–'}</td><td class="n" data-l="PI">${fR(pi)}</td><td class="n" data-l="Reajuste (R)">${fR(r)}</td><td class="n" data-l="PI + R">${fR(pi + r)}</td></tr></tbody></table>`;
  $('#rj-note').innerHTML = `${esc(REAJ.fonte)}. PI = ${RJB === 'P' ? 'valor ajustado ao contrato' : 'valor do consumo real'} no trecho, a preço inicial do contrato.${hid ? ` ${hid} grupo${hid > 1 ? 's' : ''} sem valor no trecho não aparece${hid > 1 ? 'm' : ''}.` : ''}${chg ? ` <button type="button" class="lnk" id="rj-reset">Voltar aos coeficientes da medição</button>` : ''}`;
}
function reajInit() {
  $('#rj-base').addEventListener('click', ev => { const b = ev.target.closest('[data-b]'); if (!b) return; RJB = b.dataset.b; store.set('reajBase', RJB); renderReaj(); });
  $('#rj-tab').addEventListener('change', ev => { const t = ev.target.closest('.rj-in'); if (!t) return; const v = parseFloat(t.value.replace(',', '.')); const i = +t.dataset.i;
    if (Number.isFinite(v) && v >= 0 && v < 5 && Math.abs(v - REAJ.grupos[i].R) > 1e-9) RJO[i] = v; else delete RJO[i]; store.set('reajR', RJO); renderReaj(); });
  $('#rj-note').addEventListener('click', ev => { if (ev.target.id === 'rj-reset') { RJO = {}; store.set('reajR', RJO); renderReaj(); } });
}
function exportPanel() {
  const L = [['Disciplina', 'Código', 'Serviço', 'Un', 'LE', 'LD', 'Projeto no trecho', 'Qtd. real', 'Preço (R$)', 'Valor real (R$)', 'Qtd. ajustada', 'Valor ajustado (R$)', 'Real − ajustado (R$)', 'Base · fonte', 'Grupo do contrato', 'Coef. R', 'Ajustado PI + R (R$)', 'Real PI + R (R$)']];
  for (const d of M.disciplinas) for (const l of d.linhas) {
    if (l.t !== 'it') continue; const r = l.r; const n = a => num(C(a + r));
    L.push([d.titulo, l.c, l.n, l.u, l.le ? n('E') : '', l.ld ? n('F') : '', l.proj ? n('G') : '', l.ct ? n('H') : '', l.ct ? n('I') : '', l.ct ? n('J') : '', l.ct ? n('K') : '', l.ct ? n('P') : '', l.ct ? n('Q') : '', l.fonte, ...(l.ct && REAJ && REAJ.row[l.r] !== undefined ? [REAJ.grupos[REAJ.row[l.r]].n, rjR(REAJ.row[l.r]), n('P') * (1 + rjR(REAJ.row[l.r])), n('J') * (1 + rjR(REAJ.row[l.r]))] : [])]);
  }
  L.push([], ['Trecho', `${C('G7')} a ${C('G8')}`], ['Consumo real (R$)', num(C('J' + M.meta.TOTR))], ['Ajustado ao contrato (R$)', num(C('P' + M.meta.TOTR))]);
  if (REAJ) { L.push([], ['Reajuste por grupo', 'Coef. R', 'PI ajustado (R$)', 'R ajustado (R$)', 'PI + R ajustado (R$)', 'PI real (R$)', 'R real (R$)', 'PI + R real (R$)']); const A = reajCalc('P'), B = reajCalc('J'); A.forEach((x, i) => L.push([x.n, x.R, x.pi, x.r, x.tot, B[i].pi, B[i].r, B[i].tot])); }
  download(`painel_PR-990_${C('G7')}_a_${C('G8')}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n'));
}

// ---------------------------------------------------------------- contrato × projeto (trecho inteiro)
function cmpRows() {
  return M.contrato.map(it => {
    let real = null;
    if (it.fq) { const v = wb.evalFormula(it.fq); real = isErr(v) ? null : num(v); }
    const p2 = Math.round(it.preco * 100) / 100; const vreal = (real === null ? it.qtd : real) * p2;
    const dif = vreal - it.valor;
    let sit, cls;
    if (real === null) { sit = it.tipo === 'full' ? 'Medição mensal' : it.tipo === 'end' ? 'Mobilização' : 'Não encontrado'; cls = 'na'; }
    else if (!it.qtd) { sit = 'Sem qtd. no contrato'; cls = 'na'; }
    else if (Math.abs(real / it.qtd - 1) <= 0.02) { sit = 'Confere (±2%)'; cls = 'ok'; }
    else if (real > it.qtd) { sit = 'Projeto maior'; cls = 'up'; } else { sit = 'Projeto menor'; cls = 'dn'; }
    return { ...it, real, vreal, dif, pct: real === null || !it.qtd ? null : real / it.qtd - 1, sit, cls };
  });
}
function renderCmp() {
  const rows = cmpRows();
  const grp = $('#c-grp'), sit = $('#c-sit');
  if (!grp.options.length) {
    grp.innerHTML = '<option value="">Todos os grupos</option>' + [...new Set(rows.map(r => r.grupo))].map(g => `<option>${esc(g)}</option>`).join('');
    sit.innerHTML = ['', 'Confere (±2%)', 'Projeto maior', 'Projeto menor', 'Não encontrado', 'Medição mensal', 'Mobilização'].map(s => `<option value="${esc(s)}">${s || 'Todas as situações'}</option>`).join('');
  }
  const tv = rows.reduce((s, r) => s + r.valor, 0), tr = rows.reduce((s, r) => s + r.vreal, 0);
  const cnt = k => rows.filter(r => r.sit.startsWith(k)).length;
  $('#c-kpis').innerHTML = [['VALOR DO CONTRATO', fR(tv), `${rows.length} itens da planilha contratual`, 'contr'], ['CONSUMO REAL', fR(tr), 'projeto onde encontrado; contrato onde não', 'real'],
    ['REAL − CONTRATO', fRs(tr - tv), fP(tr / tv - 1) + ' do contrato', ''], ['CONFEREM (±2%)', String(cnt('Confere')), `${cnt('Projeto maior')} maiores · ${cnt('Projeto menor')} menores`, ''],
    ['NÃO ENCONTRADOS', String(cnt('Não encontrado')), `+ ${cnt('Medição mensal') + cnt('Mobilização')} de medição mensal / mobilização`, '']]
    .map(([l, v, c, k]) => `<div class="kpi ${k}"><span class="label">${l}</span><span class="v num">${esc(v)}</span><span class="c">${esc(c)}</span></div>`).join('');
  const q = $('#c-q').value.toLowerCase().trim(), g = grp.value, s = sit.value, ord = $('#c-ord').value;
  let list = rows.filter(r => (!g || r.grupo === g) && (!s || r.sit === s) && (!q || (r.servico + ' ' + r.codigo + ' ' + r.obs + ' ' + r.apurado).toLowerCase().includes(q)));
  if (ord === 'dif') list = [...list].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  if (ord === 'pct') list = [...list].sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
  let h = '', lastG = null;
  for (const r of list) {
    if (ord === 'planilha' && r.grupo !== lastG) { h += `<tr class="grp"><td colspan="14">${esc(r.grupo)}</td></tr>`; lastG = r.grupo; }
    const memDiff = r.memoria !== null && Math.abs(r.memoria - r.qtd) > 0.005 * Math.max(1, Math.abs(r.qtd));
    h += `<tr class="it"><td class="code lin">${r.linha}</td><td class="code">${esc(r.codigo)}</td><td class="svc">${esc(r.servico)}</td><td class="un" data-l="Un">${esc(r.un)}</td>
      <td class="n contr" data-l="Contrato">${fQ(r.qtd)}</td><td class="n" data-l="Memória" ${r.memoria_ref ? `title="${esc(r.memoria_ref)}"` : ''}>${r.memoria === null ? '' : (memDiff ? '<b>' + fQ(r.memoria) + '</b>' : fQ(r.memoria))}</td>
      <td class="n real" data-l="Consumo real"><b>${r.real === null ? '' : fQ(r.real)}</b></td><td class="n" data-l="Dif. %">${fP(r.pct)}</td><td class="n" data-l="Preço">${NF[2].format(r.preco)}</td>
      <td class="n" data-l="Valor contrato">${fR(r.valor)}</td><td class="n" data-l="Valor real">${fR(r.vreal)}</td><td class="n ${r.dif < -0.005 ? 'neg' : ''}" data-l="Real − contrato">${fRs(r.dif)}</td>
      <td class="sit"><span class="pill ${r.cls}">${esc(r.sit)}</span></td><td class="obs">${esc(r.obs || r.apurado)} <a href="#painel" data-row="${r.painel}" title="Abrir a linha no painel">→ painel</a></td></tr>`;
  }
  $('#c-body').innerHTML = h || '<tr><td colspan="14" class="note">Nenhum item para os filtros escolhidos.</td></tr>';
  $('#c-count').textContent = `${list.length} de ${rows.length} itens · consumo real dos itens listados ${fR(list.reduce((s, r) => s + r.vreal, 0))}`;
  $('#c-body').querySelectorAll('[data-row]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); gotoRow(+a.dataset.row); }));
}
function gotoRow(r) {
  show('painel'); $('#det-q').value = ''; $('#det-zero').checked = false;
  const d = M.disciplinas.findIndex(x => x.linhas.some(l => l.r === r)); if (d >= 0) detOpen.add(d);
  renderDetail();
  const el = document.getElementById('row-' + r); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200);
}
function exportCmp() {
  const L = [['Linha med.', 'Código', 'Serviço', 'Un', 'Grupo', 'Qtd. contrato', 'Quadro da memória', 'Consumo real', 'Dif. %', 'Preço (R$)', 'Valor contrato (R$)', 'Valor consumo real (R$)', 'Real − contrato (R$)', 'Situação', 'Como foi apurado', 'Observação']];
  for (const r of cmpRows()) L.push([r.linha, r.codigo, r.servico, r.un, r.grupo, r.qtd, r.memoria ?? '', r.real ?? '', r.pct === null ? '' : r.pct, r.preco, r.valor, r.vreal, r.dif, r.sit, r.apurado, r.obs]);
  download('contrato_x_projeto_PR-990.csv', L.map(r => r.map(csvCell).join(';')).join('\n'));
}

// ---------------------------------------------------------------- discrepâncias
function renderDisc() {
  const rows = cmpRows(); const by = new Map(rows.map(r => [r.linha, r]));
  const D = M.discrepancias;
  let tot1 = 0;
  $('#d1').innerHTML = D.d1.map((d, i) => {
    const imp = d.linhas.reduce((s, l) => s + (by.get(l)?.dif || 0), 0); tot1 += imp;
    const one = d.linhas.length === 1 ? by.get(d.linhas[0]) : null;
    const qs = one ? `<span class="note">contrato <b class="contr">${fQ(one.qtd)}</b>${d.memoria !== null ? ` · memória <b>${fQ(d.memoria)}</b>` : ''} · projeto <b class="real">${one.real === null ? '–' : fQ(one.real)}</b> ${esc(one.un)}</span>` : '';
    return `<div class="disc-card"><div class="hd"><span class="code">${i + 1}</span><span class="t">${esc(d.serv)}</span><span class="label">${esc(d.disc)} · ${esc(d.cod)}</span>${qs}<span class="imp ${imp < 0 ? 'neg' : ''}">${fRs(imp)}</span></div><p>${esc(d.desc)}</p><p class="tr">${esc(d.trat)}</p></div>`;
  }).join('') + `<p class="note">Soma das divergências listadas: <b>${fRs(tot1)}</b> · diferença total real − contrato (todos os itens): <b>${fRs(rows.reduce((s, r) => s + r.dif, 0))}</b></p>`;
  let tot2 = 0;
  $('#d2').innerHTML = `<table><thead><tr><th>Disciplina</th><th>Fonte</th><th>Serviço</th><th>Un</th><th class="n">Qtd. projeto</th><th class="n">Estimativa</th><th>Observação</th><th>Preço de referência</th></tr></thead><tbody>` +
    D.d2.map(d => { const q = d.qf ? num(wb.evalFormula(d.qf)) : num(d.q); const e = d.preco ? q * d.preco : null; if (e) tot2 += e;
      return `<tr><td>${esc(d.disc)}</td><td class="src">${esc(d.fonte)}</td><td>${esc(d.serv)}</td><td>${esc(d.un)}</td><td class="n real"><b>${fQ(q)}</b></td><td class="n">${e === null ? '–' : fR(e)}</td><td class="src">${esc(d.obs)}</td><td class="src">${esc(d.ref)}${d.preco ? ' · R$ ' + NF[2].format(d.preco) : ''}</td></tr>`; }).join('') +
    `<tr><td colspan="5" class="n"><b>Soma (estimativa, fora do total do painel)</b></td><td class="n"><b>${fR(tot2)}</b></td><td colspan="2"></td></tr></tbody></table>`;
  $('#d3').innerHTML = `<table><thead><tr><th>Disciplina</th><th>Documento</th><th>Assunto</th><th>Descrição</th><th>Efeito no painel</th></tr></thead><tbody>` +
    D.d3.map(d => `<tr><td>${esc(d.disc)}</td><td class="src">${esc(d.doc)}</td><td><b>${esc(d.assunto)}</b></td><td>${esc(d.desc)}</td><td class="src">${esc(d.efeito)}</td></tr>`).join('') + '</tbody></table>';
  // verificações vivas
  let errs = 0, n = 0; for (const [a, raw] of Object.entries(wb.cells)) if (typeof raw === 'string' && raw.startsWith('=')) { n++; if (isErr(C(a))) errs++; }
  const tv = rows.reduce((s, r) => s + r.valor, 0);
  const checks = [['Fórmulas do painel avaliadas sem erro', `${n - errs} de ${n}`, errs === 0], ['Soma da planilha contratual (269 itens)', fR(tv), Math.abs(tv - 87300000.04) < 0.05],
    ['Itens do contrato com linha no painel', `${rows.filter(r => r.painel).length} de ${rows.length}`, rows.every(r => r.painel)],
    ['Estaca final dentro do trecho e maior que a inicial', C(M.meta.err) || 'ok', !C(M.meta.err)]];
  $('#checks').innerHTML = '<table class="checks"><tbody>' + checks.map(([a, b, ok]) => `<tr><td>${esc(a)}</td><td class="n">${esc(b)}</td><td><span class="pill ${ok ? 'ok' : 'up'}">${ok ? 'OK' : 'VERIFICAR'}</span></td></tr>`).join('') + '</tbody></table>';
}

// ---------------------------------------------------------------- base de dados
let bpage = 0;
function renderBase() {
  const sel = $('#b-sheet');
  if (!sel.options.length) { sel.innerHTML = '<option value="__contrato">Planilha contratual (269 itens)</option>' + BASE.ordem.map(s => `<option>${esc(s)}</option>`).join(''); }
  const name = sel.value; const q = $('#b-q').value.toLowerCase().trim();
  let head, rows;
  if (name === '__contrato') { head = ['Linha', 'Código', 'Serviço', 'Un', 'Grupo', 'Quantidade', 'Preço (R$)', 'Valor (R$)']; rows = M.contrato.map(c => [c.linha, c.codigo, c.servico, c.un, c.grupo, c.qtd, c.preco, c.valor]); }
  else { const d = BASE.sheets[name]; let hi = d.findIndex(r => r.filter(v => v !== null && v !== '').length >= 2); if (hi < 0) hi = 0; head = d[hi]; rows = d.slice(hi + 1).filter(r => r.some(v => v !== null && v !== '')); }
  if (q) rows = rows.filter(r => r.some(v => String(v ?? '').toLowerCase().includes(q)));
  const per = 100, pages = Math.max(1, Math.ceil(rows.length / per)); bpage = Math.min(bpage, pages - 1);
  const slice = rows.slice(bpage * per, bpage * per + per);
  const fv = v => typeof v === 'number' ? `<td class="n">${Number.isInteger(v) ? NF[0].format(v) : NF[Math.min(4, Math.max(2, 0))].format(v)}</td>` : `<td>${esc(v ?? '')}</td>`;
  $('#b-table').innerHTML = `<table><thead><tr>${head.map(h => `<th>${esc(h ?? '')}</th>`).join('')}</tr></thead><tbody>${slice.map(r => `<tr>${head.map((_, i) => fv(r[i])).join('')}</tr>`).join('')}</tbody></table>`;
  $('#b-info').textContent = `${rows.length} linhas · página ${bpage + 1} de ${pages}`;
  $('#b-dl').onclick = () => download(`${name === '__contrato' ? 'planilha_contratual' : name}.csv`, [head, ...rows].map(r => head.map((_, i) => csvCell(r[i] ?? '')).join(';')).join('\n'));
}

// ---------------------------------------------------------------- navegação

// ---------------------------------------------------------------- insumos (CPUs)
let INS;
const splitLab = lb => { const m = /^(.*) \((.*)\)$/.exec(lb); return m ? [m[1], m[2]] : [lb, '']; };
const fU = (v, un, d = 0) => { v = num(v); return Math.abs(v) < 5e-7 ? '–' : NF[d].format(v) + ' ' + un; };
function insCalc() {
  const lines = M.disciplinas.flatMap(d => d.linhas.filter(l => l.t === 'it' && l.ct).map(l => ({ ...l, disc: d.curto, num: d.num, titulo: d.titulo })));
  const lab = {}, all = {}, serv = [];
  for (const l of lines) {
    const q = num(C('H' + l.r)); const cons = INS.consumos[l.c] || [];
    const row = { l, q, dl: 0, by: {} };
    for (const [g, k, n, u, v, lb] of cons) {
      const t = v * q;
      if (lb) { lab[lb] = (lab[lb] || 0) + t; row.by[lb] = (row.by[lb] || 0) + t; }
      if (g === 'Diesel') row.dl += v;
      const key = g + '|' + k; if (!all[key]) all[key] = { g, k, n, u, t: 0 }; all[key].t += t;
    }
    serv.push(row);
  }
  const dss = num(C('G' + INS.dss04.row)); lab[INS.dss04.label] = (lab[INS.dss04.label] || 0) + dss;
  return { lab, all, serv, dss };
}
function renderInsMain() {
  if (!INS) return;
  const R = insCalc();
  $('#ins-main').innerHTML = INS.labels.map(lb => { const [n, u] = splitLab(lb); const t = R.lab[lb] || 0, o = INS.obra[lb] || 0;
    return `<div class="ins-it"><span class="n">${esc(n)}</span><span class="v num">${fU(t, u)}</span><span class="o num">obra ${fU(o, u)}</span><i style="width:${o ? Math.min(100, t / o * 100).toFixed(1) : 0}%"></i></div>`; }).join('');
}
function renderIns() {
  if (!INS) return;
  const R = insCalc();
  $('#i-trecho').textContent = `${C('G7')} → ${C('G8')}`;
  $('#i-kpis').innerHTML = INS.kpis.map(lb => { const [n, u] = splitLab(lb); return `<div class="kpi"><span class="label">${esc(n)}</span><span class="v num">${fU(R.lab[lb], u)}</span><span class="c">obra: ${fU(INS.obra[lb], u)}</span></div>`; }).join('');
  $('#i-main').innerHTML = '<table class="itbl"><thead><tr><th>Insumo</th><th class="n">No trecho</th><th class="n">Obra inteira</th><th class="n">%</th></tr></thead><tbody>' +
    INS.labels.map(lb => { const [n, u] = splitLab(lb); const t = R.lab[lb] || 0, o = INS.obra[lb] || 0;
      return `<tr><td>${esc(n)}</td><td class="n" data-l="No trecho"><b>${fU(t, u)}</b></td><td class="n" data-l="Obra">${fU(o, u)}</td><td class="n" data-l="%">${o ? NF[1].format(t / o * 100) + '%' : ''}</td></tr>`; }).join('') + '</tbody></table>';
  const q = ($('#i-q').value || '').toLowerCase().trim(); const cols = INS.servicoCols;
  let h = '', last = null, shown = 0;
  for (const s of R.serv) {
    if (Math.abs(s.q) < 1e-9 && !q) continue;
    if (q && !(s.l.n.toLowerCase().includes(q) || s.l.c.toLowerCase().includes(q))) continue;
    if (s.l.disc !== last) { h += `<tr class="grp"><td colspan="${5 + cols.length}">${esc(s.l.num + ' · ' + s.l.titulo)}</td></tr>`; last = s.l.disc; }
    shown++;
    h += `<tr class="it"><td class="code">${esc(s.l.c)}</td><td class="svc">${esc(s.l.n)}</td><td class="n" data-l="Qtd. no trecho">${fQ(s.q)} ${esc(s.l.u)}</td><td class="n" data-l="Diesel por un.">${s.dl ? NF[3].format(s.dl) + ' L' : '–'}</td>` +
      cols.map(lb => { const [n, u] = splitLab(lb); const z = Math.abs(num(s.by[lb])) < 5e-7; return `<td class="n${z ? ' z' : ''}" data-l="${esc(n)}">${fU(s.by[lb], u, 1)}</td>`; }).join('') + '</tr>';
  }
  if (Math.abs(R.dss) > 1e-9) h += `<tr class="it"><td class="code">DSS 04</td><td class="svc">Dreno sub-superficial DSS 04 (sem item no contrato) – tubo PEAD Ø 100</td><td class="n" data-l="Qtd. no trecho">${fQ(R.dss)} m</td><td></td>${cols.map(() => '<td></td>').join('')}</tr>`;
  $('#i-serv').innerHTML = `<div class="tbl-wrap"><table class="cmp itbl2"><thead><tr><th>Código</th><th>Serviço</th><th class="n">Qtd. no trecho</th><th class="n">Diesel / un.</th>${cols.map(lb => `<th class="n">${esc(lb)}</th>`).join('')}</tr></thead><tbody>${h || `<tr><td colspan="${4 + cols.length}" class="note">Nenhum serviço no trecho.</td></tr>`}</tbody></table></div>`;
  const g = $('#i-grp').value, q2 = ($('#i-q2').value || '').toLowerCase().trim();
  const ord = { Material: 0, Diesel: 1, Equipamento: 2, 'Mão de obra': 3, Transporte: 4 };
  const all = Object.values(R.all).filter(x => (!g || x.g === g) && (!q2 || (x.n + ' ' + x.k).toLowerCase().includes(q2)) && (x.t > 1e-9 || INS.obraInsumo[x.g + '|' + x.k] > 1e-9))
    .sort((a, b) => ord[a.g] - ord[b.g] || (INS.obraInsumo[b.g + '|' + b.k] || 0) - (INS.obraInsumo[a.g + '|' + a.k] || 0));
  $('#i-all').innerHTML = '<table class="itbl"><thead><tr><th>Grupo</th><th>Código</th><th>Insumo</th><th class="n">No trecho</th><th class="n">Obra inteira</th></tr></thead><tbody>' +
    all.map(x => `<tr><td>${esc(x.g)}</td><td class="code">${esc(x.k)}</td><td>${esc(x.n)}</td><td class="n" data-l="No trecho"><b>${fU(x.t, x.u, 2)}</b></td><td class="n" data-l="Obra">${fU(INS.obraInsumo[x.g + '|' + x.k], x.u, 2)}</td></tr>`).join('') + '</tbody></table>';
}
function exportIns() {
  const R = insCalc(); const L = [['Disciplina', 'Código', 'Serviço', 'Un', 'Qtd. no trecho', 'Grupo', 'Código insumo', 'Insumo', 'Un insumo', 'Consumo por un.', 'Consumo no trecho']];
  for (const s of R.serv) { if (Math.abs(s.q) < 1e-9) continue; for (const [g, k, n, u, v] of INS.consumos[s.l.c] || []) L.push([s.l.titulo, s.l.c, s.l.n, s.l.u, s.q, g, k, n, u, v, v * s.q]); }
  if (R.dss) L.push(['DRENAGEM', 'DSS 04', 'Dreno sub-superficial DSS 04 (sem item no contrato)', 'm', R.dss, 'Material', 'PEAD100', 'Tubo PEAD Ø 100 mm', 'm', 1, R.dss]);
  download(`insumos_PR-990_${C('G7')}_a_${C('G8')}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n'));
}

// ---------------------------------------------------------------- drenagem: catálogo dos dispositivos
const SHEETS = {
  '0001': 'Valetas de proteção de aterro', '0002': 'Valetas de proteção de corte', '0003': 'Sarjetas triangulares', '0004': 'Sarjetas trapezoidais',
  '0005': 'Entradas d\'água – tipo 1 (greide contínuo)', '0006': 'Entradas d\'água – tipo 2 (ponto baixo)', '0007': 'Descidas d\'água de aterro – rápida',
  '0008': 'Descidas d\'água de aterro em degraus (DAD)', '0009': 'Descidas d\'água de corte em degraus', '0010': 'Dissipadores de energia – bueiros e descidas',
  '0011': 'Dissipadores de energia – sarjetas e valetas', '0012': 'Caixa coletora com grelha', '0013': 'Drenos profundos em solo', '0014': 'Drenos profundos em rocha',
  '0015': 'Bocas de saída de drenos profundos', '0016': 'Drenos sub-superficiais (DSS) e BSD 03', '0017': 'Caixa de ligação', '0018': 'Poço de queda – formas',
  '0019': 'Poço de queda – armaduras', '0020': 'Poço de queda – tabelas', '0021': 'Boca de lobo simples', '0022': 'Boca de lobo dupla',
  '0023': 'Berços e dentes de bueiros', '0024': 'Bueiros tubulares – bocas normais e esconsas', '0025': 'Bueiros tubulares – dimensões e consumos (1)',
  '0026': 'Bueiros tubulares – dimensões e consumos (2)', '0027': 'Bueiros duplos tubulares', '0028': 'Bueiros triplos tubulares', '0029': 'Valeta em degraus revestida',
  '0030': 'Bacia de captação de bueiros', '0031': 'STB – sarjeta de borda de aterro e dreno de talvegue', '0032': 'Meios-fios e envelopamento',
  '0033': 'Transposição de segmentos de sarjeta', '0034': 'Valas de captação e descarga', '0035': 'Muro de testa e assentamento de bueiros celulares',
  '0036': 'Assentamento dos coletores tubulares', '0037': 'Assentamento dos bueiros tubulares', '0038': 'Descida e caixa coletora (banqueta)',
  '0039': 'Galerias 1,5×1,5 e 2,0×2,0 – dimensões e materiais', '0040': 'Galerias 2,5×2,5 e 3,0×3,0 – dimensões e materiais', '0041': 'Armaduras BSCC 2,0×2,0',
  '0042': 'Armaduras BSCC 2,5×2,5', '0043': 'Armaduras BSCC 3,0×3,0', '0044': 'Armaduras BTCC 3,0×3,0', '0045': 'Bueiros celulares – notas e detalhes',
  '0046': 'Bocas de bueiros simples celulares', '0047': 'Bocas de bueiros triplos celulares', '0048': 'Vigas de topo – bueiros simples',
  '0049': 'Vigas de topo (2)', '0050': 'Vigas de topo (3)', '0051': 'Armaduras das cabeceiras (1)', '0052': 'Armaduras das cabeceiras (2)',
  '0053': 'Armaduras das cabeceiras (3)', '0054': 'Resumo das cabeceiras', '0055': 'Galeria – detalhe complementar', '0056': 'Armaduras por metro de galeria',
  '0057': 'Galeria – seção transversal', '0058': 'Galeria – tabela de armadura', '0059': 'Bueiro 1 – lastro sob a calçada', '0060': 'Bueiro – armaduras',
  '0061': 'Bueiro – resumo de armaduras', '0062': 'Bueiro – detalhe complementar'
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(4, '0'));
const DRF = [
  { id: 'vpa', g: 'Superficial', n: 'Valetas de proteção de aterro (VPA)', re: /^VPA/, sh: ['0001'], ct: ['660100', '660300', '660500'] },
  { id: 'vpc', g: 'Superficial', n: 'Valetas de proteção de corte (VPC)', re: /^VPC/, sh: ['0002'], ct: ['661100', '661300', '661500'] },
  { id: 'stc', g: 'Superficial', n: 'Sarjetas triangulares de concreto (STC)', re: /^STC/, sh: ['0003'], ct: ['650000'] },
  { id: 'szc', g: 'Superficial', n: 'Sarjetas trapezoidais de concreto (SZC)', re: /^SZC/, sh: ['0004'], ct: ['653400', '653600'] },
  { id: 'stb', g: 'Superficial', n: 'Sarjeta de borda de aterro (STB)', re: /^STB/, sh: ['0031'], ct: [] },
  { id: 'mfc', g: 'Superficial', n: 'Meios-fios de concreto (MFC)', re: /^MFC/, sh: ['0032'], ct: ['810200', '810700'] },
  { id: 'tss', g: 'Superficial', n: 'Transposição de segmento de sarjeta (TSS)', re: /^TSS/, sh: ['0033'], ct: ['655500'] },
  { id: 'eda', g: 'Dispositivos', n: 'Entradas d\'água (EDA)', re: /^EDA/, sh: ['0005', '0006'], ct: [] },
  { id: 'desc', g: 'Dispositivos', n: 'Descidas d\'água (DAR, DAD, DCD)', re: /^(DAR|DAD|DCD)/, sh: ['0007', '0008', '0009', '0038'], ct: [] },
  { id: 'diss', g: 'Dispositivos', n: 'Dissipadores de energia (DES, DEB)', re: /^(DES|DEB)/, sh: ['0010', '0011'], ct: [] },
  { id: 'caixas', g: 'Dispositivos', n: 'Caixas, poços e bocas de lobo (CCS, CLP, PV, BLS, BLD)', re: /^(CCS|CLP|PV|BLS|BLD)\b/, sh: ['0012', '0017', '0018', '0019', '0020', '0021', '0022'], ct: ['691104'] },
  { id: 'bacias', g: 'Dispositivos', n: 'Bacias e valas de captação e descarga', re: /^(Bacia|Vala)/, sh: ['0030', '0034', '0029'], ct: [] },
  { id: 'dps', g: 'Profunda', n: 'Drenos profundos em solo (DPS)', re: /^DPS/, sh: ['0013'], ct: ['641800'] },
  { id: 'dpr', g: 'Profunda', n: 'Drenos profundos em rocha (DPR)', re: /^DPR/, sh: ['0014'], ct: ['643100'] },
  { id: 'bsd', g: 'Profunda', n: 'Bocas de saída de drenos (BSD)', re: /^BSD/, sh: ['0015'], ct: ['622100'] },
  { id: 'dss', g: 'Profunda', n: 'Drenos sub-superficiais (DSS)', re: /^DSS/, sh: ['0016'], ct: ['644200', '622200'] },
  { id: 'bueiros', g: 'Bueiros e galerias', n: 'Bueiros tubulares de concreto (BSTC, BDTC, BTTC)', re: /^(BSTC|BDTC|BTTC) Ø [\d,]+$/, sh: ['0024', '0023', '0025', '0026', '0027', '0028', '0037', '0035'], ct: ['610500', '610700', '610900', '611100', '611300', '611500', '612000', '620100', '620200', '620300', '620400', '620500', '620900', '621300'] },
  { id: 'rede', g: 'Bueiros e galerias', n: 'Rede pluvial – coletores tubulares', re: /^Rede pluvial/, sh: ['0036', '0032'], ct: [] },
  { id: 'galerias', g: 'Bueiros e galerias', n: 'Galerias celulares de concreto (BSCC, BTCC)', re: /^(BSCC|BTCC)/, sh: range(39, 62), ct: ['798072', '798082', '798091'] },
  { id: 'remov', g: 'Remoções', n: 'Bueiros e pontilhão existentes a remover', re: /REMOVER/, sh: [], ct: ['630400', '630600'] },
  { id: 'outros', g: 'Dispositivos', n: 'Outros dispositivos', re: /^DR 13/, sh: [], ct: [] },
];
let DRD = null, drOpen = store.get('drOpen', null), drG = '';
function drData() {
  if (DRD) return DRD;
  const tab = name => { const t = BASE.sheets[name]; const h = t[0]; return t.slice(1).filter(r => r && r.some(x => x !== null && x !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const items = [];
  for (const r of tab('Drenagem linear')) if (r['Dispositivo']) items.push({ d: r['Dispositivo'], desc: r['Descrição'], lado: r['Lado'], ei: num(r['Est. inicial (dec.)']), ef: num(r['Est. final (dec.)']), L: num(r['L (m)']), q: num(r['L (m)']), un: 'm', lin: true, fonte: r['Fonte (nota de serviço)'] });
  for (const r of tab('Drenagem pontual')) if (r['Dispositivo']) items.push({ d: r['Dispositivo'], desc: r['Descrição'], lado: r['Lado'], ei: num(r['Estaca (dec.)']), ef: num(r['Estaca (dec.)']), L: num(r['L (m)']), q: num(r['Quantidade (un)']) || 1, un: 'un', lin: false, fonte: r['Fonte'] });
  DRD = DRF.map(f => ({ ...f, items: items.filter(x => f.re.test(String(x.d).trim())) }));
  return DRD;
}
function drTrecho() { const a = S.ei + S.mi / 20, b = S.ef + S.mf / 20; return [a, b]; }
function drIn(x, a, b) {   // fração do item dentro do trecho
  if (x.lin && x.ef > x.ei) return Math.max(0, Math.min(b, x.ef) - Math.max(a, x.ei)) / (x.ef - x.ei);
  return (x.ei >= a - 1e-9 && (x.ei < b - 1e-9 || b >= END - 1e-6)) ? 1 : 0;
}
function drTypes(f, a, b) {
  const m = new Map();
  for (const x of f.items) {
    const k = String(x.d).trim(); if (!m.has(k)) m.set(k, { d: k, desc: x.desc, un: x.un, n: 0, q: 0, qt: 0, L: 0, Lt: 0 });
    const t = m.get(k), fr = drIn(x, a, b); t.n++; t.q += x.q; t.qt += x.q * fr; t.L += x.L || 0; t.Lt += (x.L || 0) * fr;
  }
  return [...m.values()].sort((p, q) => p.d.localeCompare(q.d, 'pt', { numeric: true }));
}
const fmtTot = (t, inT) => t.un === 'm' ? fQ(inT ? t.qt : t.q) + ' m' : NF[0].format(inT ? t.qt : t.q) + ' un' + ((inT ? t.Lt : t.L) ? ' · ' + fQ(inT ? t.Lt : t.L) + ' m' : '');
function renderDrenagem() {
  const D = drData(); const [a, b] = drTrecho();
  $('#d-trecho').textContent = `${estStr(a)} → ${estStr(b)}`;
  const groups = ['', ...new Set(DRF.map(f => f.g))];
  $('#dr-grp').innerHTML = groups.map(g => `<button type="button" class="chip${g === drG ? ' on' : ''}" data-g="${esc(g)}">${g || 'Todos'}</button>`).join('');
  $('#dr-grp').querySelectorAll('[data-g]').forEach(bt => bt.onclick = () => { drG = bt.dataset.g; renderDrenagem(); });
  const q = ($('#dr-q').value || '').toLowerCase().trim(), onlyT = $('#dr-tr').checked;
  const cards = D.filter(f => f.items.length || f.sh.length).filter(f => !drG || f.g === drG)
    .map(f => ({ f, ty: drTypes(f, a, b) }))
    .filter(({ f, ty }) => (!q || (f.n + ' ' + ty.map(t => t.d).join(' ')).toLowerCase().includes(q)) && (!onlyT || ty.some(t => t.qt > 1e-9)));
  $('#dr-grid').innerHTML = cards.map(({ f, ty }) => {
    const img = f.sh[0] ? `<img loading="lazy" src="drenagem/thumb/DR-4-${f.sh[0]}.webp" alt="Detalhe tipo – ${esc(f.n)}">` : '<div class="noimg">sem prancha de detalhe (remoção – pranchas DR-3)</div>';
    const chips = ty.slice(0, 8).map(t => `<span class="tchip"><b>${esc(t.d)}</b> ${fmtTot(t, false)}${Math.abs(t.qt - t.q) > 1e-6 ? ` <i>· trecho ${fmtTot(t, true)}</i>` : ''}</span>`).join('') + (ty.length > 8 ? `<span class="tchip">+${ty.length - 8} tipos</span>` : '');
    return `<article class="dr-card${drOpen === f.id ? ' sel' : ''}" data-id="${f.id}"><button type="button" class="dr-img" data-sh="${f.sh[0] || ''}" data-t="${esc(f.n)}">${img}</button>
      <div class="dr-body"><span class="label">${esc(f.g)}</span><h3>${esc(f.n)}</h3><div class="tchips">${chips || '<span class="note">não aparece nas notas de serviço do projeto</span>'}</div>
      <button type="button" class="btn dr-more" data-id="${f.id}">Detalhes, pranchas e localização</button></div></article>`;
  }).join('') || '<p class="note">Nenhum dispositivo para o filtro.</p>';
  $('#dr-grid').querySelectorAll('.dr-img').forEach(bt => bt.onclick = () => bt.dataset.sh && lbOpen(bt.dataset.sh));
  $('#dr-grid').querySelectorAll('.dr-more').forEach(bt => bt.onclick = () => { drOpen = drOpen === bt.dataset.id ? null : bt.dataset.id; store.set('drOpen', drOpen); renderDrenagem(); if (drOpen) $('#dr-det').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  renderDrDet();
}
function renderDrDet() {
  const host = $('#dr-det'); const f = drOpen && drData().find(x => x.id === drOpen);
  if (!f) { host.hidden = true; return; }
  host.hidden = false; const [a, b] = drTrecho(); const ty = drTypes(f, a, b);
  const sheets = f.sh.map(s => `<button type="button" class="sh" data-sh="${s}"><img loading="lazy" src="drenagem/thumb/DR-4-${s}.webp" alt=""><span><b>DR-4-${s}</b> ${esc(SHEETS[s] || '')}</span></button>`).join('');
  const ct = UNL ? f.ct.map(c => M.contrato.filter(x => x.codigo === c)).flat() : [];
  const onlyT = $('#dr-tr').checked;
  const locs = f.items.map(x => ({ x, fr: drIn(x, a, b) })).filter(o => !onlyT || o.fr > 0).sort((p, q) => p.x.ei - q.x.ei);
  host.innerHTML = `<div class="ins-head"><h2>${esc(f.n)}</h2><button type="button" class="btn" id="dr-close">Fechar</button></div>
    ${sheets ? `<h3>Pranchas de detalhe (toque para abrir)</h3><div class="sheets">${sheets}</div>` : '<p class="note">Sem prancha de detalhe tipo: os bueiros a remover estão nas pranchas DR-3.</p>'}
    <h3>Tipos no projeto</h3><div class="tbl-wrap"><table class="itbl"><thead><tr><th>Tipo</th><th>Descrição</th><th class="n">Registros</th><th class="n">Obra inteira</th><th class="n">No trecho</th></tr></thead><tbody>
    ${ty.map(t => `<tr><td><b>${esc(t.d)}</b></td><td>${esc(t.desc || '')}</td><td class="n" data-l="Registros">${t.n}</td><td class="n" data-l="Obra">${fmtTot(t, false)}</td><td class="n" data-l="No trecho"><b>${fmtTot(t, true)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="note">Sem registros nas notas de serviço.</td></tr>'}</tbody></table></div>
    ${ct.length ? `<h3>Itens do contrato</h3><div class="tbl-wrap"><table class="itbl"><thead><tr><th>Código</th><th>Serviço</th><th class="n">Qtd. contrato</th><th class="n">Preço</th></tr></thead><tbody>${ct.map(c => `<tr><td class="code">${esc(c.codigo)}</td><td>${esc(c.servico)}</td><td class="n" data-l="Contrato">${fQ(c.qtd)} ${esc(c.un)}</td><td class="n" data-l="Preço">R$ ${NF[2].format(c.preco)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3>Localização (${locs.length} registros${onlyT ? ' no trecho' : ''})</h3><div class="tbl-wrap loc"><table class="itbl"><thead><tr><th>Tipo</th><th>Estaca inicial</th><th>Estaca final</th><th>Lado</th><th class="n">Quantidade</th><th>Fonte</th></tr></thead><tbody>
    ${locs.map(({ x, fr }) => `<tr class="${fr > 0 ? 'intr' : ''}"><td><b>${esc(x.d)}</b></td><td data-l="Inicial">${estStr(x.ei)}</td><td data-l="Final">${x.lin ? estStr(x.ef) : '–'}</td><td data-l="Lado">${esc(x.lado || '')}</td><td class="n" data-l="Qtd.">${x.lin ? fQ(x.q) + ' m' : NF[0].format(x.q) + ' un' + (x.L ? ' · ' + fQ(x.L) + ' m' : '')}</td><td class="src">${esc(x.fonte || '')}</td></tr>`).join('')}</tbody></table></div>`;
  host.querySelectorAll('.sh').forEach(bt => bt.onclick = () => lbOpen(bt.dataset.sh));
  $('#dr-close').onclick = () => { drOpen = null; store.set('drOpen', null); renderDrenagem(); };
}
let lbZ = 1;
function lbOpen(s) { lbShow(`drenagem/DR-4-${s}.webp`, `DR-4-${s} · ${SHEETS[s] || ''}`); }
function lbShow(src, title) {
  $('#lb-img').src = src; $('#lb-o').href = src;
  $('#lb-t').textContent = title; lbZ = 1; $('#lb-img').style.width = '100%'; $('#lb').hidden = false; document.body.style.overflow = 'hidden';
}
function lbInit() {
  const z = d => { lbZ = Math.min(6, Math.max(1, lbZ * d)); $('#lb-img').style.width = (lbZ * 100) + '%'; };
  $('#lb-p').onclick = () => z(1.5); $('#lb-m').onclick = () => z(1 / 1.5);
  $('#lb-img').ondblclick = () => z(lbZ > 1 ? 1 / lbZ : 2.5);
  const close = () => { $('#lb').hidden = true; document.body.style.overflow = ''; };
  $('#lb-x').onclick = close; document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#lb').hidden) close(); });
  $('#dr-q').addEventListener('input', renderDrenagem); $('#dr-tr').addEventListener('change', renderDrenagem);
}

const VIEWS = ['painel', 'medicao', 'avanco', 'campo', 'simulacao', 'apresentacao', 'britagem', 'insumos', 'drenagem', 'pranchas', 'contrato', 'discrepancias', 'base', 'sobre'];
let current = 'painel';
// ---------------------------------------------------------------- abas protegidas por senha (dados cifrados em data/protegido.json)
const LOCKED = ['medicao', 'contrato', 'discrepancias', 'base'];
let UNL = false, PROT = null, lockTarget = null;
const b64u = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64u(PROT.salt), iterations: PROT.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt', 'encrypt']);
}
async function openWith(key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u(PROT.iv) }, key, b64u(PROT.ct));
  const d = JSON.parse(new TextDecoder().decode(plain));
  M.contrato = d.contrato; M.discrepancias = d.discrepancias;
  UNL = true; UKEY = key; OB.unlock(d.medicao, d.medref); lockUI(); verUI();
}
async function unlock(pass, remember) {
  if (!window.crypto || !crypto.subtle) throw new Error('este navegador não permite abrir os dados protegidos aqui (abra pelo endereço https do app)');
  const key = await deriveKey(pass);
  try { await openWith(key); } catch { throw new Error('senha incorreta'); }
  try { if (remember) { const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key)); localStorage.setItem('pr990:chave', btoa(String.fromCharCode(...raw)) + '|' + PROT.salt); } } catch { }
}
async function autoUnlock() {
  try { const v = localStorage.getItem('pr990:chave'); if (!v) return; const [k, salt] = v.split('|'); if (salt !== PROT.salt) { localStorage.removeItem('pr990:chave'); return; }
    const key = await crypto.subtle.importKey('raw', b64u(k), 'AES-GCM', false, ['decrypt', 'encrypt']); await openWith(key); } catch { }
}
function lockOut() {
  try { localStorage.removeItem('pr990:chave'); } catch { }
  location.hash = '#painel'; location.reload();
}
function lockUI() {
  document.documentElement.classList.toggle('unl', UNL);
  $('#lock-btn').textContent = UNL ? 'Sair' : 'Entrar';
  $('#lock-btn').title = UNL ? 'Bloquear de novo as abas protegidas' : 'Entrar com a senha para ver as abas protegidas';
}
function lockInit() {
  lockUI();
  $('#lock-btn').onclick = () => { if (UNL) { if (confirm('Bloquear de novo as abas protegidas e esquecer a senha neste aparelho?')) lockOut(); } else askPass(current); };
  $('#lk-form').onsubmit = async ev => {
    ev.preventDefault(); const msg = $('#lk-msg'); msg.textContent = 'Verificando…'; $('#lk-go').disabled = true;
    try { await unlock($('#lk-pass').value, $('#lk-rem').checked); msg.textContent = ''; $('#lk-pass').value = ''; $('#lock').hidden = true; document.body.style.overflow = '';
      const t = lockTarget || current; lockTarget = null; history.replaceState(null, '', '#' + t); show(t); }
    catch (e) { msg.textContent = e.message; } finally { $('#lk-go').disabled = false; }
  };
  $('#lk-x').onclick = () => { $('#lock').hidden = true; document.body.style.overflow = ''; if (LOCKED.includes(current) && !UNL) location.hash = '#painel'; };
}
function askPass(target, why) {
  lockTarget = target; $('#lk-why').textContent = why || 'Esta área é restrita. Digite a senha para continuar.';
  $('#lock').hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => $('#lk-pass').focus(), 30);
}
window.__pr990ask = askPass;
function show(v) {
  if (!VIEWS.includes(v)) v = 'painel';
  if (LOCKED.includes(v) && !UNL) { askPass(v, 'A aba ' + ({ medicao: 'Medição', contrato: 'Contrato × projeto', discrepancias: 'Discrepâncias', base: 'Base de dados' })[v] + ' é restrita. Digite a senha para abrir.'); if (current === v || LOCKED.includes(current)) v = 'painel'; else { history.replaceState(null, '', '#' + current); return; } history.replaceState(null, '', '#' + v); }
  current = v;
  VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; document.querySelectorAll(`a[href="#${x}"].nl`).forEach(a => a.setAttribute('aria-current', x === v ? 'page' : 'false')); });
  const more = $('#nav-more'); if (more) { more.classList.toggle('cur', !['painel', 'medicao', 'avanco', 'campo'].includes(v)); $('#more-sheet').hidden = true; }
  if (v === 'medicao') OB.renderMed(); if (v === 'avanco') OB.renderAv(); if (v === 'simulacao') OB.renderSim(); if (v === 'britagem') OB.renderBrit(); if (v === 'apresentacao') OB.renderApr(); if (v === 'campo') OB.renderCampo(); if (v === 'pranchas') OB.renderPr();
  if (v === 'insumos') renderIns(); if (v === 'drenagem') renderDrenagem(); if (v === 'contrato') renderCmp(); if (v === 'discrepancias') renderDisc(); if (v === 'base') renderBase();
  store.set('tab', v);
  if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0 });
}
function navInit() {
  const more = $('#nav-more'), sh = $('#more-sheet');
  more.addEventListener('click', ev => { ev.preventDefault(); sh.hidden = !sh.hidden; });
  sh.addEventListener('click', ev => { if (ev.target === sh || ev.target.closest('a')) sh.hidden = true; });
}
function theme() {
  const order = ['', 'light', 'dark']; let t = store.get('theme', '');
  const apply = () => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); $('#theme').textContent = t === 'dark' ? 'Escuro' : t === 'light' ? 'Claro' : 'Tema do sistema'; };
  apply(); $('#theme').addEventListener('click', () => { t = order[(order.indexOf(t) + 1) % 3]; store.set('theme', t); apply(); });
}


// ---------------------------------------------------------------- app instalável (PWA)
function pwa() {
  if (window.__PR990__) return;          // versão de arquivo único: sem instalação
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.documentElement.classList.toggle('standalone', standalone);
  const btn = $('#install'); let deferred = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); deferred = ev; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !standalone) btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; btn.hidden = true; return; }
    $('#ios-tip').hidden = false;
  });
  $('#ios-tip-x').addEventListener('click', () => { $('#ios-tip').hidden = true; });
  { const v = $('#app-ver'); if (v && /_{2}BUILD/.test(v.textContent)) v.hidden = true; }
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  // atualização do app instalado: procura versão nova ao abrir, ao voltar para o app e a cada 30 min;
  // achou logo na abertura ou com o app em segundo plano, aplica sozinho; com o app em uso, mostra a barra "Atualizar"
  let reloading = false, want = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (want && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    let pend = null, used = false;
    const mark = () => { used = true; }; addEventListener('pointerdown', mark, { once: true }); addEventListener('keydown', mark, { once: true });
    const apply = () => { if (!pend) return; want = true; pend.postMessage('skipWaiting'); };
    const ask = w => {
      if (!w || !navigator.serviceWorker.controller) return;
      pend = w;
      if (document.hidden || !used) return apply();       // ninguém mexeu ainda: atualiza direto
      $('#update-bar').hidden = false; $('#update-go').onclick = apply;
    };
    const check = () => reg.update().catch(() => { });
    if (reg.waiting) ask(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') ask(w); }); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) apply(); else check(); });
    window.addEventListener('focus', check); window.addEventListener('online', check);
    setInterval(check, 30 * 60e3);
  }).catch(() => { });
}

// ---------------------------------------------------------------- módulos de obra
const OB = initObra({ $, esc, NF, num, fQ, fR, fRs, fP, estStr, parseEst, store, download, csvCell, S, C,
  END: () => END, M: () => M, BASE: () => BASE, INS: () => INS, wb: () => wb, applyInputs, setSel, show: v => show(v), current: () => current,
  gotoRow: r => { location.hash = '#painel'; gotoRow(r); }, unlocked: () => UNL, reajR: r => REAJ && REAJ.row[r] !== undefined ? rjR(REAJ.row[r]) : 0, reajG: () => REAJ ? REAJ.grupos.map((g, i) => ({ n: g.n, R: rjR(i) })) : [], ask: (t, w) => askPass(t, w), renderCmp: () => renderCmp(), renderDrenagem: () => renderDrenagem(), renderIns: () => renderIns(),
  lbOpen: s => lbOpen(s), lbShow: (s, t) => lbShow(s, t), DRF, SHEETS });

// ---------------------------------------------------------------- versão mestra: estado, aviso de atualização e publicação
let UKEY = null;
const REPO_API = 'https://api.github.com/repos/filipezanella1/PR990-Obra-completa/contents/data/mestre.json';
function mstLoad(fetched) {
  let loc = null; try { loc = JSON.parse(rawGet('mestreLocal') || 'null'); } catch { }
  MST = [fetched, loc].filter(Boolean).sort((a, b) => (b.ver || 0) - (a.ver || 0))[0] || { ver: 0, areas: {} };
  OB.data.mestre = MST;
}
const fDT = iso => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
function mstChanged() { return Object.keys(MAREAS).filter(a => areaLocal(a) && rawGet('mb:' + a) !== mHash(a) && MST.ver > 0); }
function verUI() {
  const pers = Object.keys(MAREAS).filter(areaLocal); const b = $('#ver-btn'); if (!b) return;
  const [l, sh] = UNL ? ['Mestra (editar)', 'Mestra'] : pers.length ? ['Minha versão', 'Minha'] : ['Versão mestra', 'Mestra']; b.innerHTML = `<span class="vl">${l}</span><span class="vs">${sh}</span>`; b.classList.toggle('pers', !UNL && pers.length > 0);
  const ch = mstChanged(); const bar = $('#mst-bar');
  if (ch.length && !UNL) { bar.hidden = false; $('#mst-txt').textContent = `A versão mestra foi atualizada${MST.em ? ' em ' + fDT(MST.em) : ''} em: ${ch.map(a => MAREAS[a].n).join(', ')}. Você tem alterações suas nessas áreas.`; } else bar.hidden = true;
}
function areaReset(a) { for (const k of MAREAS[a].k) rawSet(k, null); rawSet('mb:' + a, null); }
async function tokSave(t) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, UKEY, new TextEncoder().encode(t)));
  rawSet('ghtok', btoa(String.fromCharCode(...iv)) + '|' + btoa(String.fromCharCode(...ct))); }
async function tokGet() { const v = rawGet('ghtok'); if (!v || !UKEY) return null; const [iv, ct] = v.split('|'); try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u(iv) }, UKEY, b64u(ct))); } catch { return null; } }
async function mstPublish() {
  const tok = await tokGet(); if (!tok) throw new Error('cadastre o token do GitHub primeiro');
  const areas = {}; for (const [a, o] of Object.entries(MAREAS)) { areas[a] = {}; for (const k of o.k) { const v = store.get(k, undefined); if (v !== undefined) areas[a][k] = v; } }
  const body = { ver: (MST.ver || 0) + 1, em: new Date().toISOString(), areas, retigrafico: OB.avMaster() };
  const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
  let sha; const g = await fetch(REPO_API + '?ref=main', { headers: h, cache: 'no-store' });
  if (g.ok) sha = (await g.json()).sha; else if (g.status === 401 || g.status === 403) throw new Error('token sem permissão (precisa de Contents: read and write neste repositório)'); else if (g.status !== 404) throw new Error('GitHub respondeu ' + g.status);
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(body))));
  const r = await fetch(REPO_API, { method: 'PUT', headers: h, body: JSON.stringify({ message: `Versão mestra v${body.ver}`, content, sha, branch: 'main' }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('GitHub respondeu ' + r.status + (j.message ? ': ' + j.message : '')); }
  MST = body; OB.data.mestre = MST; rawSet('mestreLocal', JSON.stringify(body));
  for (const a of Object.keys(MAREAS)) areaReset(a);
  return body;
}
function verDlg() {
  const d = $('#ver-dlg'); const pers = Object.keys(MAREAS).filter(areaLocal);
  $('#ver-body').innerHTML = `<p><b>${MST.ver ? `Versão mestra v${MST.ver}` : 'Versão mestra inicial'}</b>${MST.em ? ` · publicada em ${fDT(MST.em)}` : ''}</p>
    ${UNL ? '<p class="note">Você entrou com a senha: o que você altera neste aparelho é o rascunho da versão mestra. Publique para que todos recebam.</p>' : '<p class="note">Você pode alterar à vontade: suas alterações ficam só neste aparelho e por cima da versão mestra. O que você não alterar continua acompanhando a mestra.</p>'}
    <table class="itbl"><tbody>${Object.entries(MAREAS).map(([a, o]) => `<tr><td>${esc(o.n)}</td><td>${areaLocal(a) ? `<span class="pill c">${UNL ? 'alterada (rascunho)' : 'sua versão'}</span>` : '<span class="pill p">mestra</span>'}</td><td>${areaLocal(a) ? `<button type="button" class="lnk" data-reset="${a}">voltar à mestra</button>` : ''}</td></tr>`).join('')}
    ${UNL ? `<tr><td>Retigráfico</td><td><span class="pill ${OB.avIsLocal() ? 'c' : 'p'}">${OB.avIsLocal() ? 'alterado (rascunho)' : 'mestra'}</span></td><td></td></tr>` : ''}</tbody></table>
    ${UNL ? `<div class="ver-pub"><h3>Publicar versão mestra</h3>
      <p class="note">Grava retigráfico, simulação, britagem, reajuste e lançamentos da apresentação deste aparelho como a nova versão mestra. Todos recebem em 1 a 2 minutos.</p>
      <label class="lbl">Token do GitHub <input id="ver-tok" type="password" autocomplete="off" placeholder="${rawGet('ghtok') ? 'cadastrado – cole outro para trocar' : 'github_pat_…'}"></label>
      <p class="note">Crie em GitHub → Settings → Developer settings → Fine-grained tokens, só para o repositório PR990-Obra-completa, com permissão <b>Contents: Read and write</b>. Fica guardado neste aparelho, criptografado com a sua senha.</p>
      <button class="btn primary" type="button" id="ver-pub">Publicar como versão mestra</button> <span class="note" id="ver-msg" role="status"></span></div>` : ''}`;
  d.hidden = false;
}
function verInit() {
  $('#ver-btn').onclick = verDlg; $('#ver-x').onclick = () => { $('#ver-dlg').hidden = true; };
  $('#ver-dlg').addEventListener('click', async ev => {
    const r = ev.target.closest('[data-reset]'); if (r) { if (!confirm(`Descartar suas alterações em ${MAREAS[r.dataset.reset].n} e voltar à versão mestra?`)) return; areaReset(r.dataset.reset); location.reload(); return; }
    if (ev.target.id === 'ver-pub') { const msg = $('#ver-msg'); const b = ev.target; b.disabled = true;
      try { const t = $('#ver-tok').value.trim(); if (t) { await tokSave(t); $('#ver-tok').value = ''; }
        if (!confirm('Publicar o estado deste aparelho como a nova versão mestra para todos?')) { b.disabled = false; return; }
        msg.textContent = 'Publicando…'; const v = await mstPublish(); msg.textContent = `Publicada a v${v.ver}. Os outros aparelhos recebem em 1 a 2 minutos.`; verUI(); }
      catch (e) { msg.textContent = 'Não publicou: ' + e.message; } finally { b.disabled = false; } }
  });
  $('#mst-go').onclick = () => { for (const a of mstChanged()) areaReset(a); location.reload(); };
  $('#mst-keep').onclick = () => { for (const a of mstChanged()) rawSet('mb:' + a, mHash(a)); verUI(); };
}

// ---------------------------------------------------------------- início
(async function main() {
  theme(); pwa();
  let data;
  try { data = await loadData(); } catch (e) { $('#boot').innerHTML = `Não foi possível carregar a base de dados (${esc(e.message)}). Abra o app por um servidor (GitHub Pages ou <code>python3 -m http.server</code>), não pelo arquivo local.`; return; }
  M = data.model; BASE = data.base; INS = data.insumos; wb = new Workbook(BASE, data.painel.cells);
  Object.assign(OB.data, { avanco: data.avanco, eixo: data.eixo, pranchas: data.pranchas, britagem: data.britagem });
  mstLoad(data.mestre); RJO = store.get('reajR', {}); OB.reloadState();
  REAJ = data.reajuste; reajInit(); PROT = data.protegido; M.contrato = []; M.discrepancias = { d1: [], d2: [], d3: [] };
  END = num(BASE.sheets['Estacas'][M.meta.LE - 1][1]);
  Object.assign(S, store.get('trecho', {}), store.get('prem', {}));
  $('#boot').hidden = true; $('#app').hidden = false;
  renderSelector(); syncInputs(); drawSel();
  $('#det-q').addEventListener('input', () => renderDetail()); $('#det-zero').addEventListener('change', () => renderDetail());
  $('#det-csv').addEventListener('click', exportPanel); $('#c-csv').addEventListener('click', exportCmp);
  ['#c-q', '#c-grp', '#c-sit', '#c-ord'].forEach(s => $(s).addEventListener('input', renderCmp));
  ['#b-sheet', '#b-q'].forEach(s => $(s).addEventListener('input', () => { bpage = 0; renderBase(); }));
  $('#b-prev').addEventListener('click', () => { bpage = Math.max(0, bpage - 1); renderBase(); }); $('#b-next').addEventListener('click', () => { bpage++; renderBase(); });
  $('#b-json').addEventListener('click', () => download('base_PR-990.json', JSON.stringify({ contrato: M.contrato, abas: BASE.sheets }), 'application/json'));
  ['#i-q', '#i-grp', '#i-q2'].forEach(s => $(s).addEventListener('input', renderIns)); $('#i-csv').addEventListener('click', exportIns);
  lbInit(); OB.init(); navInit(); lockInit(); verInit();
  await autoUnlock(); verUI();
  recalc();
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || store.get('tab', 'painel'));
})();
