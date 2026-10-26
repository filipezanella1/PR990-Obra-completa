import { Workbook, isErr } from './engine.js';

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
const store = { get(k, d) { try { const v = localStorage.getItem('pr990:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('pr990:' + k, JSON.stringify(v)); } catch { } } };
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
  const [model, base, painel, insumos] = await Promise.all([get('model.json'), get('base.json'), get('painel.json'), get('insumos.json')]);
  return { model, base, painel, insumos };
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
  renderKPIs(); renderSummary(); renderInfo(); renderDetail(); renderInsMain();
  if (current === 'insumos') renderIns();
  if (current === 'discrepancias') renderDisc();
  if (current === 'contrato') renderCmp();
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
function exportPanel() {
  const L = [['Disciplina', 'Código', 'Serviço', 'Un', 'LE', 'LD', 'Projeto no trecho', 'Qtd. real', 'Preço (R$)', 'Valor real (R$)', 'Qtd. ajustada', 'Valor ajustado (R$)', 'Real − ajustado (R$)', 'Base · fonte']];
  for (const d of M.disciplinas) for (const l of d.linhas) {
    if (l.t !== 'it') continue; const r = l.r; const n = a => num(C(a + r));
    L.push([d.titulo, l.c, l.n, l.u, l.le ? n('E') : '', l.ld ? n('F') : '', l.proj ? n('G') : '', l.ct ? n('H') : '', l.ct ? n('I') : '', l.ct ? n('J') : '', l.ct ? n('K') : '', l.ct ? n('P') : '', l.ct ? n('Q') : '', l.fonte]);
  }
  L.push([], ['Trecho', `${C('G7')} a ${C('G8')}`], ['Consumo real (R$)', num(C('J' + M.meta.TOTR))], ['Ajustado ao contrato (R$)', num(C('P' + M.meta.TOTR))]);
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

const VIEWS = ['painel', 'insumos', 'contrato', 'discrepancias', 'base', 'sobre'];
let current = 'painel';
function show(v) {
  if (!VIEWS.includes(v)) v = 'painel'; current = v;
  VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; const a = $(`nav.tabs a[href="#${x}"]`); if (a) a.setAttribute('aria-current', x === v ? 'page' : 'false'); });
  if (v === 'insumos') renderIns(); if (v === 'contrato') renderCmp(); if (v === 'discrepancias') renderDisc(); if (v === 'base') renderBase();
  store.set('tab', v);
  if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0 });
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
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const ask = w => { if (!w || !navigator.serviceWorker.controller) return; $('#update-bar').hidden = false; $('#update-go').onclick = () => w.postMessage('skipWaiting'); };
    if (reg.waiting) ask(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') ask(w); }); });
  }).catch(() => { });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && !$('#update-bar').hidden) { reloading = true; location.reload(); } });
}

// ---------------------------------------------------------------- início
(async function main() {
  theme(); pwa();
  let data;
  try { data = await loadData(); } catch (e) { $('#boot').innerHTML = `Não foi possível carregar a base de dados (${esc(e.message)}). Abra o app por um servidor (GitHub Pages ou <code>python3 -m http.server</code>), não pelo arquivo local.`; return; }
  M = data.model; BASE = data.base; INS = data.insumos; wb = new Workbook(BASE, data.painel.cells);
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
  recalc();
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || store.get('tab', 'painel'));
})();
