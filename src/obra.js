// Módulos de obra: medição, retigráfico de avanço, campo (GPS), planejamento, pranchas, busca global e comparação de trechos.
// Recebe o contexto do app (X) para usar o motor de cálculo, a base e os utilitários sem duplicá-los.
import { parseMedicao } from './medparse.js?v=__BUILD__';
import { parseRetigrafico, parseBritagem } from './retig.js?v=__BUILD__';

export function initObra(X) {
  const { $, esc, NF, num, fQ, fR, fRs, fP, estStr, parseEst, store, download, csvCell, S, C } = X;
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const END = () => X.END();
  const M = () => X.M(), BASE = () => X.BASE(), INS = () => X.INS();
  const tab = name => { const t = BASE().sheets[name]; if (!t) return []; const h = t[0]; return t.slice(1).filter(r => r && r.some(x => x !== null && x !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const trecho = () => [S.ei + S.mi / 20, S.ef + S.mf / 20];
  const pct = (a, b) => b ? a / b : 0;
  const fPc = v => Number.isFinite(v) ? NF[1].format(v * 100) + '%' : '–';
  const today = () => new Date().toISOString().slice(0, 10);
  const D = {};   // dados extras carregados (medição, avanço, eixo, pranchas)

  // ===================================================================== MEDIÇÃO
  let MED = null;                 // medição ativa
  const medKey = 'medicoes';
  function medList() { return store.get(medKey, []); }
  function medSetActive(m) { MED = m; store.set('medAtiva', m.nome); }
  async function medInit() {
    const saved = medList(); const want = store.get('medAtiva', null);
    const all = [D.medicao, ...saved.map(n => store.get('med:' + n, null)).filter(Boolean)];
    MED = all.find(m => m.nome === want) || all[all.length - 1] || D.medicao;
  }
  function medAll() { return [D.medicao, ...medList().map(n => store.get('med:' + n, null)).filter(Boolean)]; }
  // linhas do painel que alimentam cada linha da Medição Resumo (campo ct do modelo)
  let CT = null;
  function ctMap() {
    if (CT) return CT; CT = new Map();
    for (const d of M().disciplinas) for (const l of d.linhas) if (l.t === 'it' && l.ct) { if (!CT.has(l.ct)) CT.set(l.ct, []); CT.get(l.ct).push(l); }
    return CT;
  }
  function recIn(r, a, b) {   // quantidade do registro da memória dentro do trecho [a, b]
    const [ei, ef, , tot] = r;
    if (ef !== null && ef > ei + 1e-9) return tot * Math.max(0, Math.min(b, ef) - Math.max(a, ei)) / (ef - ei);
    return (ei >= a - 1e-9 && (ei < b - 1e-9 || b >= END() - 1e-6)) ? tot : 0;
  }
  function medRows() {
    const [a, b] = trecho(); const full = a <= 1e-6 && b >= END() - 1e-6;
    const ref = D.medref || {};
    return MED.itens.map(it => {
      const rf = ref[it.c] || {}; const lines = ctMap().get(it.l) || [];
      const prevT = lines.length ? lines.reduce((s, l) => s + num(C('H' + l.r)), 0) : null;
      const proj = rf.proj ?? null;
      const recSum = it.r.reduce((s, r) => s + r[3], 0);
      let medT = full ? it.acum : it.r.reduce((s, r) => s + recIn(r, a, b), 0);
      const liqT = full ? it.liq : it.r.reduce((s, r) => s + (r[4] === MED.n ? recIn(r, a, b) : 0), 0);
      const semEst = !full && it.acum > 1e-9 && it.r.length === 0;
      const prev = proj === null ? it.q : Math.max(proj, it.acum);
      let sit, cls;
      if (!it.q && it.acum > 1e-9) { sit = 'Sem quantidade no contrato'; cls = 'up'; }
      else if (it.acum > it.q * 1.0001 + 1e-9) { sit = 'Estourado'; cls = 'bad'; }
      else if (proj !== null && proj > it.q * 1.0001 + 1e-9) { sit = 'Vai estourar'; cls = 'up'; }
      else if (it.q && it.acum >= it.q * 0.9999) { sit = 'Concluído'; cls = 'ok'; }
      else if (it.acum <= 1e-9) { sit = 'Sem medição'; cls = 'na'; }
      else { sit = 'Com saldo'; cls = 'dn'; }
      const exc = Math.max(0, prev - it.q);
      return { ...it, rf, lines, proj, prev, prevT, medT, liqT, nesta: it.liq > 1e-9, semEst, recSum, saldo: it.q - it.acum, aExecT: prevT === null ? null : Math.max(0, prevT - medT), exc, sit, cls, pctMed: it.q ? it.acum / it.q : null };
    });
  }
  let medFilt = store.get('medFilt', ''), medOpen = null;
  function renderMed() {
    if (!MED) return; renderMedCurva();
    const rows = medRows(); const [a, b] = trecho();
    $('#m-trecho').textContent = `${estStr(a)} → ${estStr(b)}`;
    const sel = $('#m-sel'); const all = medAll();
    sel.innerHTML = all.map(m => `<option ${m.nome === MED.nome ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
    $('#m-del').hidden = MED === D.medicao;
    const O = MED.oficial;
    $('#m-info').innerHTML = `${esc(MED.arquivo || MED.nome)} · ${MED.itens.length} itens · ${MED.itens.reduce((s, i) => s + i.r.length, 0)} lançamentos com estaca nas memórias` +
      (O ? `<br><b>Quantidades oficiais:</b> ${esc(O.fonte)} · período ${esc(O.periodo)}${O.difs.length ? ` · ${O.difs.length} itens em que a planilha difere do relatório (marcados “≠ relatório”)` : ''}` : '');
    const vC = rows.reduce((s, r) => s + r.q * r.p, 0), vM = rows.reduce((s, r) => s + r.acum * r.p, 0);
    const est = rows.filter(r => r.sit === 'Estourado'), vai = rows.filter(r => r.sit === 'Vai estourar');
    const nes = rows.filter(r => r.nesta), vL = nes.reduce((s, r) => s + r.liq * r.p, 0);
    const vT = rows.reduce((s, r) => s + r.medT * r.p, 0), vPT = rows.reduce((s, r) => s + (r.prevT ?? 0) * r.p, 0);
    $('#m-kpis').innerHTML = [
      ['VALOR CONTRATADO', fR(vC), `${rows.length} itens`, 'contr'],
      [`NESTA MEDIÇÃO (${MED.n || ''}ª)`, fR(O ? O.presente : vL), `${nes.length} serviços medidos${O ? ` · + reajuste ${fR(O.reajuste)} = ${fR(O.liquido)}` : ''}`, 'now'],
      ['MEDIDO ACUMULADO', fR(O ? O.acumulado : vM), fPc(pct(O ? O.acumulado : vM, vC)) + ' do contrato' + (O ? ` · c/ reajustes ${fR(O.acumulado + O.reajAcum)}` : ''), 'real'],
      ['SALDO CONTRATUAL', fR(O ? O.saldo : vC - vM), 'contrato − medido', ''],
      ['ITENS ESTOURADOS', String(est.length), `excesso ${fR(est.reduce((s, r) => s + (r.acum - r.q) * r.p, 0))}`, 'bad'],
      ['VÃO ESTOURAR', String(vai.length), `projeto acima do contrato: ${fR(vai.reduce((s, r) => s + r.exc * r.p, 0))}`, 'warn'],
      ['MEDIDO NO TRECHO', fR(vT), `previsto no trecho ${fR(vPT)} · ${fPc(pct(vT, vPT))}`, ''],
    ].map(([l, v, c, k]) => `<div class="kpi ${k}"><span class="label">${l}</span><span class="v num">${esc(v)}</span><span class="c">${esc(c)}</span></div>`).join('');
    const grp = $('#m-grp'); if (!grp.options.length || grp.dataset.med !== MED.nome) { const g = grp.value; grp.innerHTML = '<option value="">Todos os grupos</option>' + [...new Set(rows.map(r => r.g))].map(x => `<option ${x === g ? 'selected' : ''}>${esc(x)}</option>`).join(''); grp.dataset.med = MED.nome; }
    const SIT = ['', 'Medidos nesta medição', 'Estourado', 'Vai estourar', 'Com saldo', 'Concluído', 'Sem medição'];
    const cnt = s => !s ? rows.length : s === SIT[1] ? nes.length : rows.filter(r => r.sit === s).length;
    $('#m-sit').innerHTML = SIT.map(s => `<button type="button" class="chip${s === medFilt ? ' on' : ''}${s === SIT[1] ? ' now' : ''}" data-s="${s}">${s === SIT[1] ? `Medidos na ${MED.n || ''}ª` : s || 'Todos'} <b>${cnt(s)}</b></button>`).join('');
    $$('#m-sit .chip').forEach(bt => bt.onclick = () => { medFilt = bt.dataset.s; store.set('medFilt', medFilt); renderMed(); });
    const q = ($('#m-q').value || '').toLowerCase().trim(), g = grp.value, onlyT = $('#m-tr').checked;
    const list = rows.filter(r => (!medFilt || (medFilt === SIT[1] ? r.nesta : r.sit === medFilt)) && (!g || r.g === g) && (!q || (r.c + ' ' + r.s).toLowerCase().includes(q)) && (!onlyT || (r.prevT ?? 0) > 1e-9 || r.medT > 1e-9));
    let h = '', lg = null;
    for (const r of list) {
      if (r.g !== lg) { h += `<tr class="grp"><td colspan="12">${esc(r.g)}</td></tr>`; lg = r.g; }
      const w = Math.min(100, (r.pctMed ?? 0) * 100), wp = r.q ? Math.min(100, r.prev / r.q * 100) : 0;
      h += `<tr class="it${medOpen === r.l ? ' open' : ''}" data-l="${r.l}"><td class="code">${esc(r.c)}</td><td class="svc"><button type="button" class="lnk" data-open="${r.l}">${esc(r.s)}</button></td><td class="un" data-l="Un">${esc(r.u)}</td>
        <td class="n contr" data-l="Contrato">${fQ(r.q)}</td><td class="n real" data-l="Medido acum."><b>${fQ(r.acum)}</b><div class="mbar" title="medido ${fPc(r.pctMed)} · previsto ${fPc(wp / 100)}"><i style="width:${w}%"></i><u style="left:${Math.min(100, wp)}%"></u></div></td>
        <td class="n${r.nesta ? ' nowv' : ''}" data-l="Nesta medição">${r.nesta ? `<b>${fQ(r.liq)}</b><br><span class="note">${fR(r.liq * r.p)}</span>` : '–'}</td>
        <td class="n ${r.saldo < -1e-6 ? 'neg' : ''}" data-l="Saldo contrato">${fQ(r.saldo)}</td><td class="n" data-l="Previsto (projeto)">${r.proj === null ? '<span class="note">–</span>' : fQ(r.proj)}</td>
        <td class="sit"><span class="pill ${r.cls}">${esc(r.sit)}</span>${r.pl ? ` <span class="pill na" title="Planilha da medição: acumulado ${fQ(r.pl.acum)} · nesta ${fQ(r.pl.liq)}. Vale o relatório do SMO.">≠ relatório</span>` : ''}${r.exc > 1e-6 && r.sit !== 'Concluído' ? `<span class="note"> +${fQ(r.exc)} ${esc(r.u)} · ${fR(r.exc * r.p)}</span>` : ''}</td>
        <td class="n" data-l="Previsto no trecho">${r.prevT === null ? '–' : fQ(r.prevT)}</td><td class="n" data-l="Medido no trecho">${r.semEst ? '<span class="note" title="Memória sem estacas">s/ estaca</span>' : fQ(r.medT)}</td><td class="n" data-l="A executar no trecho"><b>${r.aExecT === null ? '–' : fQ(r.aExecT)}</b></td></tr>`;
      if (medOpen === r.l) h += `<tr class="mdet"><td colspan="12">${medDetail(r)}</td></tr>`;
    }
    $('#m-body').innerHTML = h || '<tr><td colspan="12" class="note">Nenhum item para os filtros escolhidos.</td></tr>';
    $('#m-count').textContent = `${list.length} de ${rows.length} itens · medido nos itens listados ${fR(list.reduce((s, r) => s + r.acum * r.p, 0))} · nesta medição ${fR(list.reduce((s, r) => s + r.liq * r.p, 0))}`;
    $$('#m-body [data-open]').forEach(bt => bt.onclick = () => { const l = +bt.dataset.open; medOpen = medOpen === l ? null : l; renderMed(); });
    $$('#m-body [data-row]').forEach(bt => bt.onclick = () => X.gotoRow(+bt.dataset.row));
  }
  function medDetail(r) {
    const [a, b] = trecho();
    const recs = r.r.map(x => ({ x, q: recIn(x, a, b) })).filter(o => o.q !== 0).sort((p, q) => (q.x[4] === MED.n) - (p.x[4] === MED.n) || p.x[0] - q.x[0]);
    const lin = r.lines.map(l => `<a href="#painel" data-row="${l.r}">${esc(l.c)} – ${esc(l.n)}</a>`).join(' · ');
    return `<div class="mdet-in"><p class="note">${r.rf.ap ? 'Previsto pelo projeto: ' + esc(r.rf.ap) + '. ' : ''}${lin ? 'No painel: ' + lin + '.' : ''} Soma dos lançamentos com estaca: ${fQ(r.recSum)} ${esc(r.u)}${r.rsem ? ` · sem estaca: ${fQ(r.rsem)}` : ''}.${r.nesta ? ` <b>Nesta medição: ${fQ(r.liq)} ${esc(r.u)}</b> (lançamentos da ${MED.n}ª em destaque, primeiro).` : ''}</p>
      ${recs.length ? `<div class="tbl-wrap loc"><table class="itbl"><thead><tr><th>Estaca inicial</th><th>Estaca final</th><th>Lado</th><th>Medição</th><th class="n">Lançado</th><th class="n">No trecho</th></tr></thead><tbody>${recs.slice(0, 400).map(({ x, q }) => `<tr class="${x[4] === MED.n ? 'intr' : ''}"><td data-l="Inicial">${estStr(x[0])}</td><td data-l="Final">${x[1] === null || x[1] <= x[0] ? '–' : estStr(x[1])}</td><td data-l="Lado">${esc(x[2])}</td><td data-l="Medição">${x[4] ? x[4] + 'ª' + (x[4] === MED.n ? ' (atual)' : '') : '–'}${r.tb && r.tb[x[5]] ? ' · ' + esc(r.tb[x[5]].replace(/^\d+\s*-\s*/, '')) : ''}</td><td class="n" data-l="Lançado">${fQ(x[3])}</td><td class="n" data-l="No trecho"><b>${fQ(q)}</b></td></tr>`).join('')}</tbody></table></div>${recs.length > 400 ? `<p class="note">+ ${recs.length - 400} lançamentos</p>` : ''}` : '<p class="note">Nenhum lançamento com estaca no trecho.</p>'}</div>`;
  }
  async function medUpload(file) {
    const st = $('#m-status'); st.textContent = 'Lendo ' + file.name + '…';
    try {
      const m = await parseMedicao(await file.arrayBuffer(), file.name);
      if (!m.itens.length) throw new Error('nenhum item encontrado');
      if (m.nome === D.medicao.nome) m.nome += ' (nova)';
      const list = medList().filter(n => n !== m.nome); list.push(m.nome); store.set(medKey, list); store.set('med:' + m.nome, m);
      medSetActive(m); st.textContent = `${m.nome}: ${m.itens.length} itens, ${m.itens.reduce((s, i) => s + i.r.length, 0)} lançamentos com estaca.`;
      renderMed();
    } catch (e) { st.textContent = 'Não foi possível ler a planilha: ' + e.message; }
  }
  function exportMed() {
    const rows = medRows(); const [a, b] = trecho();
    const L = [['Linha', 'Código', 'Serviço', 'Un', 'Grupo', 'Contrato', 'Medido acumulado', 'Saldo contratual', 'Previsto pelo projeto (obra)', 'Situação', 'Excesso previsto', 'Preço (R$)', 'Previsto no trecho', 'Medido no trecho', 'A executar no trecho', 'Nesta medição', 'Nesta medição (R$)', 'Medido acumulado (R$)']];
    for (const r of rows) L.push([r.l, r.c, r.s, r.u, r.g, r.q, r.acum, r.saldo, r.proj ?? '', r.sit, r.exc, r.p, r.prevT ?? '', r.medT, r.aExecT ?? '', r.liq, r.liq * r.p, r.acum * r.p]);
    download(`medicao_${MED.nome.replace(/\W+/g, '_')}_${estStr(a)}_a_${estStr(b)}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n'));
  }

  // ===================================================================== AVANÇO (retigráfico no modelo da obra: atacado × concluído por frente)
  const NC = 643;   // células: estaca 0 … 642 (a célula k vai da estaca k à k+1)
  const ST = { '2': 'Concluído', '1': 'Atacado (em execução)', '0': 'A executar' };
  const PAL = [['#fcd5b5', '#e46c0a'], ['#b7dee8', '#31859c'], ['#ccc1da', '#604a7b'], ['#d7e4bd', '#77933c'], ['#e6b9b8', '#953735'], ['#948a54', '#4a452a'], ['#c6d9f1', '#1f497d'], ['#fde9d9', '#c0504d']];
  // serviços da medição que alimentam cada frente (para destacar o medido na medição atual)
  const FRM = {
    p0: it => it.g === 'TERRAPLENAGEM', p1: it => it.c === '511200',
    p2: (it, tb) => it.c === '530200' && !/sub/i.test(tb || ''), p3: (it, tb) => it.c === '530200' && !/sub/i.test(tb || ''),
    p4: (it, tb) => it.c === '530200' && /sub/i.test(tb || ''), p5: it => it.c === '531100',
    p6: it => ['560100', '589190'].includes(it.c), p7: it => ['570400', '589000'].includes(it.c),
  };
  const OACC = /^(6(05|06|07|08|10|11|12|20|21)\d{3}|79(80|81|82|83|84|85)\d{2}|600300|601200|602000|603000|605300)$/;
  let MCELL = null, MCELLn = null;
  function medCells() {   // frente → Map(célula → serviços medidos na medição atual)
    if (!MED) return {};
    if (MCELL && MCELLn === MED) return MCELL; MCELL = {}; MCELLn = MED;
    const all = { ...FRM, oac: it => OACC.test(it.c) };
    for (const [id, f] of Object.entries(all)) {
      const m = new Map();
      for (const it of MED.itens) for (const r of it.r) {
        if (r[4] !== MED.n || !f(it, it.tb && it.tb[r[5]])) continue;
        const k0 = Math.max(0, Math.floor(r[0])), k1 = r[1] !== null && r[1] > r[0] ? Math.min(NC - 1, Math.ceil(r[1]) - 1) : k0;
        for (let k = k0; k <= Math.max(k0, k1); k++) { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(it.c); }
      }
      MCELL[id] = m;
    }
    return MCELL;
  }
  let avHl = store.get('avHl', true);
  let AV = null, paintOn = false;
  const AVKEY = 'avanco2';
  function avDefault() {
    const m = D.mestre && D.mestre.retigrafico; if (m && m.frentes && (m.data || '') >= D.avanco.data) { const c = JSON.parse(JSON.stringify(m)); c.v = 2; return c; }
    const b = D.avanco;
    return { v: 2, fonte: b.fonte, data: b.data, frentes: b.frentes.map(f => ({ ...f })), oac: b.oac.map(o => ({ ...o })), oae: b.oae, travas: (b.travas || []).map(t => ({ ...t })), atualizado: b.data };
  }
  function avLoad() { AV = X.unlocked() ? store.get(AVKEY, null) : null; const mts = (D.mestre && D.mestre.retigrafico && D.mestre.retigrafico.ts) || 0;
    if (!AV || AV.v !== 2 || !AV.frentes || (AV.data || '') < D.avanco.data || (AV.ts || 0) < mts) AV = avDefault(); if (!AV.travas) AV.travas = (D.avanco.travas || []).map(t => ({ ...t }));
    if ((AV.fixRev || 0) < (D.avanco.fixRev || 0)) { for (const fx of D.avanco.oacFix || []) { const o = AV.oac.find(x => Math.abs(x.e - fx.e) < 0.01); if (o) o.st = fx.st; } AV.fixRev = D.avanco.fixRev; store.set(AVKEY, AV); }
    LK = null; }
  // ---------- travas: segmentos que não serão executados (não entram em "falta", nem na simulação)
  let LK = null;
  function lockSet() { if (LK) return LK; LK = new Uint8Array(NC); for (const t of AV.travas || []) for (let k = Math.max(0, Math.floor(t.e0 + 1e-9)); k < Math.min(NC, Math.ceil(t.e1 - 1e-9)); k++) LK[k] = 1; return LK; }
  const isLk = k => lockSet()[k] === 1;
  function lockLen() { let s = 0; for (let k = 0; k < NC; k++) if (isLk(k)) s += cellLen(k); return s; }
  const travaTxt = () => (AV.travas || []).map(t => `${estStr(t.e0)} a ${estStr(t.e1)}`).join(', ');
  function avSave() { AV.atualizado = today(); AV.ts = Date.now(); store.set(AVKEY, AV); }
  const stName = k => ST[k] || ST['0'];
  const cellLen = k => k >= 642 ? 15.817 : 20;
  function avStats(c) { const s = { '0': 0, '1': 0, '2': 0, L: 0 }; for (let k = 0; k < NC; k++) { if (isLk(k) && c[k] === '0') { s.L += cellLen(k); continue; } s[c[k]] = (s[c[k]] || 0) + cellLen(k); } return s; }
  const TOT = 642.79085 * 20;
  const oacName = st => st === 'c' ? 'concluído' : st === 'a' ? 'atacado' : 'não iniciado';
  function oacIcon(st) {
    const f = st === 'c' ? '#1f3864' : st === 'a' ? '#00b0f0' : '#fff';
    return `<svg viewBox="0 0 14 22" width="11" height="17" aria-hidden="true"><path d="M1 1h12l-3 5v10l3 5H1l3-5V6z" fill="${f}" stroke="#1f3864" stroke-width="1.4"/></svg>`;
  }
  // ---------- modo: situação da obra × simulação de materiais
  const SIMR = [   // linhas da simulação: frente do retigráfico, coluna de quantidade por estaca, como vira material
    { id: 'p2', n: '1ª camada de reforço', col: 'Reforço (m³)', f: 0.5, un: 'm³', mat: 'bica' },
    { id: 'p3', n: '2ª camada de reforço', col: 'Reforço (m³)', f: 0.5, un: 'm³', mat: 'bica' },
    { id: 'p4', n: 'Sub-base', col: 'Sub-base (m³)', f: 1, un: 'm³', mat: 'bica' },
    { id: 'p5', n: 'Base – BGS', col: 'BGS (m³)', f: 1, un: 'm³', mat: 'bgs' },
    { id: 'p6', n: 'Imprimação', col: 'Imprimação EAI (m²)', f: 1, un: 'm²', mat: 'eai' },
    { id: 'p7', n: 'CBUQ', col: 'CBUQ (t)', f: 1, un: 't', mat: 'cbuq' },
  ];
  const SP = Object.assign({ dBica: 2.022, dBgs: 2.421, eai: null, rr: null, cap: null, xisto: 8 }, store.get('simPar', {}));
  let SIM = store.get('simSel', {});   // id → string de 643 '0'/'1'
  const simSel = id => SIM[id] || (SIM[id] = '0'.repeat(NC));
  const simSave = () => store.set('simSel', SIM);
  let QC = null;
  function cellQ() {   // quantidade por célula (estaca k → k+1) de cada coluna de "Volumes por intervalo"
    if (QC) return QC; QC = {};
    const cols = [...new Set(SIMR.map(r => r.col)), 'Pintura RR-1C (m²)'];
    cols.forEach(c => QC[c] = new Float64Array(NC));
    for (const r of tab('Volumes por intervalo')) {
      const a = parseEst(String(r['Estaca inicial'])), b = parseEst(String(r['Estaca final'])); if (a === null || b === null || b <= a) continue;
      for (let k = Math.floor(a); k < Math.min(NC, Math.ceil(b)); k++) { const o = Math.min(b, k + 1) - Math.max(a, k); if (o <= 0) continue; for (const c of cols) QC[c][k] += num(r[c]) * o / (b - a); }
    }
    return QC;
  }
  const par = k => SP[k] ?? ({ cap: S.cap, eai: S.eai, rr: S.rr })[k];
  // ---------- meses da simulação: cada célula guarda o mês em que foi simulada ('0' = não simulada, '1'…'6' = mês 1…6)
  // uma cor por mês (paleta categórica validada: vizinhos distinguíveis, inclusive para daltonismo); o número do mês vai na célula
  const MCOL = ['#2a78d6', '#eb6834', '#6250d6', '#e34948', '#eda100', '#e87ba4'];
  const MTXT = ['#fff', '#fff', '#fff', '#fff', '#1d2226', '#1d2226'];
  const MMAX = 6;
  const ymNext = ym => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
  const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  let MESES = store.get('simMeses', null) || [ymNext(ymNow())];
  let MATV = Math.min(store.get('simMesAtv', 0), MESES.length - 1);
  const mesNomeS = ym => { const [y, m] = ym.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + y.slice(2); };
  const mesNum = ym => String(+ym.split('-')[1]);
  const mSave = () => { store.set('simMeses', MESES); store.set('simMesAtv', MATV); };
  function matOf(r, q, rr) {
    const m = {};
    if (r.mat === 'bica') m['Bica corrida'] = q * par('dBica');
    if (r.mat === 'bgs') m['Brita graduada (BGS)'] = q * par('dBgs');
    if (r.mat === 'eai') m['Emulsão EAI'] = q * par('eai') / 1000;
    if (r.mat === 'cbuq') { m['CBUQ'] = q; m['CAP 50/70'] = q * par('cap'); m['Emulsão RR-1C'] = rr * par('rr') / 1000; m['Xisto (L)'] = q * par('xisto'); }
    return m;
  }
  function simCalc() {
    const Q = cellQ(); const out = [];
    for (const r of SIMR) {
      const sel = simSel(r.id), f = AV.frentes.find(x => x.id === r.id); let cnt = 0, q = 0, ext = 0, ja = 0, rr = 0;
      const bm = MESES.map(() => ({ cnt: 0, q: 0, ext: 0, rr: 0 }));
      for (let k = 0; k < NC; k++) { const v = sel[k]; if (v === '0' || isLk(k)) continue; const mi = Math.min(MESES.length, +v) - 1; if (mi < 0) continue;
        const qq = Q[r.col][k] * r.f, rk = Q['Pintura RR-1C (m²)'][k];
        cnt++; ext += cellLen(k); q += qq; rr += rk; if (f && f.c[k] === '2') ja++;
        const o = bm[mi]; o.cnt++; o.ext += cellLen(k); o.q += qq; o.rr += rk; }
      bm.forEach(o => o.m = matOf(r, o.q, o.rr));
      out.push({ ...r, cnt, q, ext, ja, m: matOf(r, q, rr), rr, bm });
    }
    return out;
  }
  let BR = new Set(store.get('simBrush', ['p7'])), SMODE = 'add', SKIP = store.get('simSkip', true);
  const SCOL = { p2: '#604a7b', p3: '#77933c', p4: '#953735', p5: '#4a452a', p6: '#808080', p7: '#0d0d0d' };
  function renderSim() {
    if (!AV) avLoad();
    $('#s-fonte').textContent = `Executado conforme o ${AV.fonte.replace(/^Retigráfico/, 'retigráfico')}${AV.atualizado !== AV.data ? ' (com alterações feitas no app)' : ''} · simulação de ${new Date().toLocaleDateString('pt-BR')}`;
    $('#s-brush').innerHTML = SIMR.map(r => `<button type="button" class="bchip${BR.has(r.id) ? ' on' : ''}" data-b="${r.id}" aria-pressed="${BR.has(r.id)}"><i class="dot" style="background:${SCOL[r.id]}"></i>${esc(r.n)}</button>`).join('') +
      `<button type="button" class="lnk" data-b="all">todos</button><button type="button" class="lnk" data-b="none">nenhum</button>`;
    $$('#s-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === SMODE)); $('#s-skip').checked = SKIP;
    $('#s-meses').innerHTML = MESES.map((ym, i) => `<button type="button" class="mchip${i === MATV ? ' on' : ''}" data-mi="${i}" aria-pressed="${i === MATV}"><i class="msw" style="background:${MCOL[i]};color:${MTXT[i]}">${mesNum(ym)}</i>${mesNomeS(ym)}</button>`).join('') +
      (MESES.length < MMAX ? `<button type="button" class="btn sm" id="s-madd">+ ${mesNomeS(ymNext(MESES[MESES.length - 1]))}</button>` : '') + (MESES.length > 1 ? `<button type="button" class="lnk" id="s-mdel">remover ${mesNomeS(MESES[MESES.length - 1])}</button>` : '');
    $('#s-legend').innerHTML = `<span class="lg1"><i class="sw grn"></i>executado</span><span class="lg1"><i class="sw atk"></i>em execução (atacado)</span>${MESES.map((ym, i) => `<span class="lg1"><i class="sw msw" style="background:${MCOL[i]};color:${MTXT[i]}">${mesNum(ym)}</i>simulado em ${mesNomeS(ym)}</span>`).join('')}<span class="lg1"><i class="sw"></i>a executar</span>${lockLen() ? '<span class="lg1"><i class="sw lkb"></i>não será executado</span>' : ''}`;
    drawGrid(true);
    $('#v-simulacao .sim-row').classList.toggle('wide', MESES.length > 2);
    const R = simCalc();
    const pet = R.filter(r => r.mat === 'bica' || r.mat === 'bgs').reduce((s, r) => s + Object.values(r.m)[0], 0);
    const g = (id) => R.find(r => r.id === id);
    const c = g('p7'), im = g('p6');
    const T = (v, d = 1) => Math.abs(v) < 5e-7 ? '0' : NF[d].format(v);
    const extMax = Math.max(...R.map(r => r.ext));
    $('#s-mini').value = MESES[0];
    $('#s-hero').innerHTML = `<div><span>Período</span><b>${MESES.length > 1 ? mesNomeS(MESES[0]) + ' – ' + mesNomeS(MESES[MESES.length - 1]) : mesNomeS(MESES[0])}</b></div><div><span>Extensão simulada</span><b>${NF[2].format(extMax / 1000)} km</b></div><div><span>Material pétreo</span><b>${NF[0].format(pet)} t</b></div><div><span>CBUQ</span><b>${NF[0].format(c.m['CBUQ'])} t</b></div>`;
    const card = (ic, l, v, u, sub) => `<div class="skpi"><div class="sk-h">${ic}<span>${l}</span></div><div class="sk-v"><b>${v}</b><i>${u}</i></div><div class="sk-s">${sub}</div></div>`;
    const ico = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${d}"/></svg>`;
    $('#s-kpis').innerHTML = [
      card(ico('M3 20l5-9 4 6 3-4 6 7z'), 'Material pétreo', T(pet), 't', `bica corrida ${T(g('p2').m['Bica corrida'] + g('p3').m['Bica corrida'] + g('p4').m['Bica corrida'])} t · BGS ${T(g('p5').m['Brita graduada (BGS)'])} t`),
      card(ico('M3 17h18M5 13h14M7 9h10'), 'CBUQ', T(c.m['CBUQ']), 't', `${NF[2].format(c.ext / 1000)} km de pista`),
      card(ico('M12 3c3 4 6 7 6 10a6 6 0 1 1-12 0c0-3 3-6 6-10z'), 'CAP 50/70', T(c.m['CAP 50/70'], 2), 't', `teor de ${NF[1].format(par('cap') * 100)}% sobre o CBUQ`),
      card(ico('M4 18h16M6 14h12M12 3v8'), 'Emulsão RR-1C', T(c.m['Emulsão RR-1C'], 2), 't', `pintura de ligação · ${NF[0].format(c.rr)} m²`),
      card(ico('M4 18h16M8 14l4-8 4 8'), 'Emulsão EAI', T(im.m['Emulsão EAI'], 2), 't', `imprimação · ${NF[0].format(im.q)} m²`),
      card(ico('M7 3h10l-1 4H8zM6 7h12v14H6z'), 'Xisto', NF[0].format(c.m['Xisto (L)']), 'L', `${NF[1].format(par('xisto'))} L por tonelada de CBUQ`),
    ].join('');
    // barras: executado / simulado / restante por serviço (km)
    const TOTKM = TOT / 1000, LL = lockLen(), EXE = TOT - LL;
    $('#s-bars').innerHTML = `<div class="sbars">${R.map(r => { const f = AV.frentes.find(x => x.id === r.id); let ex = 0, lk = 0; const sl = simSel(r.id); let si = 0;
        const sm = MESES.map(() => 0);
        for (let k = 0; k < NC; k++) { if (f && f.c[k] === '2') ex += cellLen(k); else if (isLk(k)) lk += cellLen(k); else if (sl[k] !== '0' && +sl[k] <= MESES.length) { si += cellLen(k); sm[+sl[k] - 1] += cellLen(k); } }
        const rest = Math.max(0, TOT - ex - si - lk);
        return `<div class="sbar"><span class="sb-n">${esc(r.n)}</span><div class="sb-t" title="${esc(r.n)}: executado ${NF[2].format(ex / 1000)} km · simulado ${NF[2].format(si / 1000)} km · restante ${NF[2].format(rest / 1000)} km${lk ? ` · não será executado ${NF[2].format(lk / 1000)} km` : ''}">
          <i class="ex" style="width:${ex / TOT * 100}%"></i>${sm.map((v, i) => v ? `<i class="si" style="width:${v / TOT * 100}%;background:${MCOL[i]}" title="${mesNomeS(MESES[i])}: ${NF[2].format(v / 1000)} km"></i>` : '').join('')}<i class="lkb" style="width:${lk / TOT * 100}%"></i></div>
          <span class="sb-v"><b>${NF[1].format((ex + si) / (TOT - lk) * 100)}%</b> ${si ? `<em>+${NF[2].format(si / 1000)} km</em>` : ''}</span></div>`; }).join('')}
      <div class="sbar ax"><span></span><div class="sb-ax">${[0, 25, 50, 75, 100].map(v => `<i style="left:${v}%">${NF[1].format(TOTKM * v / 100)}</i>`).join('')}</div><span></span></div></div>
      <div class="legend av-legend"><span class="lg1"><i class="sw grn"></i>executado</span>${MESES.map((ym, i) => `<span class="lg1"><i class="sw" style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</span>`).join('')}<span class="lg1"><i class="sw rest"></i>restante</span>${LL ? `<span class="lg1"><i class="sw lkb"></i>não será executado (${esc(travaTxt())})</span>` : ''}<span class="note">% = executado + simulado sobre o trecho a executar (${NF[2].format(EXE / 1000)} km)</span></div>`;
    const FV = (k, v) => Math.abs(v) < 5e-7 ? '–' : k.includes('(L)') ? NF[0].format(v) + ' L' : NF[k === 'CBUQ' || k === 'Bica corrida' || k.startsWith('Brita') ? 1 : 2].format(v) + ' t';
    const petM = MESES.map((_, i) => R.filter(r => r.mat === 'bica' || r.mat === 'bgs').reduce((s, r) => s + (Object.values(r.bm[i].m)[0] || 0), 0));
    $('#s-tab').innerHTML = `<table class="itbl stab"><thead><tr><th>Serviço</th><th>Material</th>${MESES.map((ym, i) => `<th class="n"><i class="msw" style="background:${MCOL[i]};color:${MTXT[i]}">${mesNum(ym)}</i> ${mesNomeS(ym)}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>${R.map(r => { const ms = Object.keys(r.m);
        return ms.map((k, i) => `<tr class="${i ? 'cont' : ''}"><td>${i ? '' : `<i class="dot" style="background:${SCOL[r.id]}"></i> <b>${esc(r.n)}</b><div class="note">${r.cnt ? NF[2].format(r.ext / 1000) + ' km · ' + NF[1].format(r.q) + ' ' + r.un : 'nada simulado'}${r.ja ? ` · ${r.ja} estaca${r.ja > 1 ? 's' : ''} já executada${r.ja > 1 ? 's' : ''}` : ''}</div>`}</td>
          <td data-l="Material">${esc(k.replace(' (L)', ''))}</td>${MESES.map((ym, mi) => `<td class="n" data-l="${mesNomeS(ym)}">${FV(k, r.bm[mi].m[k] || 0)}</td>`).join('')}<td class="n" data-l="Total"><b>${FV(k, r.m[k])}</b></td></tr>`).join(''); }).join('')}
      <tr class="tot"><td colspan="2">Material pétreo (reforço + sub-base + base)</td>${petM.map((v, i) => `<td class="n" data-l="${mesNomeS(MESES[i])}">${FV('t', v)}</td>`).join('')}<td class="n">${T(pet)} t</td></tr></tbody></table>`;
    $('#s-prem-sum').textContent = `bica ${NF[3].format(par('dBica'))} t/m³ · BGS ${NF[3].format(par('dBgs'))} t/m³ · CAP ${NF[1].format(par('cap') * 100)}% · EAI ${NF[2].format(par('eai'))} kg/m² · RR-1C ${NF[2].format(par('rr'))} kg/m² · xisto ${NF[1].format(par('xisto'))} L/t`;
    simBrit(R);
    for (const [id, k] of [['s-dbica', 'dBica'], ['s-dbgs', 'dBgs'], ['s-cap', 'cap'], ['s-eai', 'eai'], ['s-rr', 'rr'], ['s-xisto', 'xisto']]) { const el = $('#' + id); if (document.activeElement !== el) el.value = NF[k === 'cap' ? 2 : 3].format(k === 'cap' ? par(k) * 100 : par(k)).replace(/\./g, ''); }
  }
  function renderAv() {
    if (!AV) avLoad();
    $('#a-fonte').textContent = `${AV.fonte} · alterado no app em ${AV.atualizado.split('-').reverse().join('/')}`;
    $('#a-hl').checked = avHl; $('#a-hl').closest('label').hidden = !MED; if (MED) $('#a-hln').textContent = `Destacar o medido na ${MED.n || ''}ª medição`;
    $('#a-paint').classList.toggle('on', paintOn); $('#a-paint').textContent = paintOn ? 'Concluir edição' : 'Editar';
    $('#v-avanco').classList.toggle('painting', paintOn);
    // cartões de avanço
    const oc = { c: 0, a: 0, n: 0 }; AV.oac.forEach(o => oc[o.st]++);
    const EXE = TOT - lockLen();
    $('#a-cards').innerHTML = AV.frentes.map(f => { const st = avStats(f.c); const base = TOT - st.L; const p2 = st['2'] / base, p1 = st['1'] / base; const mc = medCells()[f.id];
      return `<div class="avc"><div class="avc-h"><i class="dot" style="background:${f.cc}"></i><span>${esc(f.n)}</span></div><div class="avc-v"><b>${fPc(p2)}</b><span>${NF[2].format(st['2'] / 1000)} km</span></div>
        <div class="stk"><i style="width:${(p2 * 100).toFixed(2)}%;background:${f.cc}"></i><i style="width:${(p1 * 100).toFixed(2)}%;background:${f.ca || f.cc}"></i></div>
        <div class="avc-f">${f.a ? (st['1'] ? `atacado ${NF[2].format(st['1'] / 1000)} km · ` : '') : ''}falta ${NF[2].format(st['0'] / 1000)} km${st.L ? ` · <span title="Segmento travado: ${esc(travaTxt())}">⊘ ${NF[2].format(st.L / 1000)} km</span>` : ''}${mc && mc.size && avHl ? ` · <span title="Estacas com lançamento na ${MED.n}ª medição">● ${mc.size}</span>` : ''}</div></div>`; }).join('') +
      `<div class="avc"><div class="avc-h">${oacIcon('c')}<span>OAC – bueiros e galerias</span></div><div class="avc-v"><b>${oc.c}/${AV.oac.length}</b><span>concluídos</span></div>
        <div class="stk"><i style="width:${oc.c / AV.oac.length * 100}%;background:#1f3864"></i><i style="width:${oc.a / AV.oac.length * 100}%;background:#00b0f0"></i></div><div class="avc-f">${oc.a} atacados · ${oc.n} não iniciados</div></div>`;
    $('#a-legend').innerHTML = `<span class="lg1"><i class="sw2"><i style="background:#e6b9b8"></i><i style="background:#953735"></i></i>cor clara = atacado · cor forte = concluído</span><span class="lg1"><i class="sw"></i>a executar</span>${AV.travas && AV.travas.length ? `<span class="lg1"><i class="sw lkb"></i>não será executado</span>` : ''}
      <span class="lg1">${oacIcon('c')}${oacIcon('a')}${oacIcon('n')}&nbsp;OAC concluído · atacado · não iniciado</span>`;
    const sel = $('#a-lay'); const prev = [...sel.selectedOptions].map(o => o.value);
    sel.innerHTML = AV.frentes.map(f => `<option value="${f.id}" ${prev.includes(f.id) ? 'selected' : ''}>${esc(f.n)}</option>`).join('');
    $('#a-st').innerHTML = ['2', '1', '0'].map(k => `<option value="${k}">${esc(stName(k))}</option>`).join('');
    $('#a-trv-list').textContent = (AV.travas || []).length ? travaTxt() : 'nenhum';
    drawGrid(false);
  }
  // rótulos dos OAC em faixas, sem sobrepor (ícone na estaca; nome acima quando não cabe ao lado)
  function oacLayout(list, s0, cw) {
    const lanes = []; const out = [];
    for (const it of list.sort((a, b) => a.o.e - b.o.e)) {
      const x = (it.o.e - s0) * cw; const txt = it.o.t + (it.o.L ? ' · ' + it.o.L + ' m' : ''); const w = txt.length * 5.3 + 10;
      let lane = 0; while (lane < 8 && lanes[lane] !== undefined && lanes[lane] > x - 4) lane++;
      lanes[lane] = x + w; out.push({ ...it, x, txt, lane });
    }
    return { out, n: Math.max(1, lanes.length) };
  }
  function drawGrid(sim, forcedW) {
    const host = $(sim ? '#s-grid' : '#a-grid'); const w = forcedW || host.clientWidth || 1000;
    const labW = w < 700 ? 112 : 190, cw = w < 700 ? 15 : 17;
    const per = Math.max(10, Math.floor((w - labW - 4) / cw));
    const mc = avHl && !sim ? medCells() : {};
    let h = '';
    for (let s0 = 0; s0 < NC; s0 += per) {
      const s1 = Math.min(NC, s0 + per);
      const L = oacLayout(AV.oac.map((o, i) => ({ o, i })).filter(({ o }) => o.e >= s0 && o.e < s1), s0, cw);
      const oe = (AV.oae || []).filter(o => o.e1 >= s0 && o.e0 < s1);
      const tv = (AV.travas || []).filter(t => t.e1 > s0 && t.e0 < s1);
      h += `<div class="blk${sim ? ' sim' : ''}" style="--n:${s1 - s0};--cw:${cw}px;--lw:${labW}px"><div class="mrow" style="height:${L.out.length ? 22 + L.n * 13 : 22}px">` +
        tv.map(t => `<span class="trv" style="left:calc(var(--lw) + ${(Math.max(t.e0, s0) - s0) * cw}px);width:${(Math.min(t.e1, s1) - Math.max(t.e0, s0)) * cw}px" title="${esc(t.n)}: ${estStr(t.e0)} a ${estStr(t.e1)}">⊘ ${esc(t.n)}</span>`).join('') +
        oe.map(o => `<span class="oae" style="left:calc(var(--lw) + ${(Math.max(o.e0, s0) - s0) * cw}px);width:${Math.max(18, (Math.min(o.e1, s1) - Math.max(o.e0, s0)) * cw)}px" title="${esc(o.n)}">OAE</span>`).join('') +
        L.out.map(({ o, i, x, txt, lane }) => `<button type="button" class="oac ${o.st}${mc.oac && mc.oac.has(Math.floor(o.e)) ? ' m' : ''}" data-oac="${i}" style="left:calc(var(--lw) + ${x}px)" title="${esc(o.t)} · est. ${estStr(o.e)}${o.L ? ' · ' + o.L + ' m' : ''} · ${oacName(o.st)}">${oacIcon(o.st)}</button>` +
          `<i class="ldr" style="left:calc(var(--lw) + ${x}px);height:${4 + lane * 13}px"></i><span class="oacl" style="left:calc(var(--lw) + ${x}px);bottom:${20 + lane * 13}px">${esc(txt)}</span>`).join('') + '</div>';
      if (sim) {
        for (const r of SIMR) {
          const f = AV.frentes.find(x => x.id === r.id); const sl = simSel(r.id);
          h += `<div class="fgrp"><div class="lrow rs${BR.has(r.id) ? ' inb' : ''}" data-sim="${r.id}"><span class="ln"><span class="fn"><i class="dot" style="background:${SCOL[r.id]}"></i>${esc(r.n)}</span><button type="button" class="lnk sfill" data-fill="${r.id}" data-s0="${s0}" data-s1="${s1}" title="Preencher nesta faixa as estacas que ainda não foram executadas (toque de novo para desfazer)">preencher</button></span><div class="cells">`;
          for (let k = s0; k < s1; k++) { const st = f ? f.c[k] : '0'; const mv = +sl[k]; const ms = mv > 0 && mv <= MESES.length && !isLk(k);
            h += ms ? `<i class="c sel" data-k="${k}" style="background:${MCOL[mv - 1]};color:${MTXT[mv - 1]}">${mesNum(MESES[mv - 1])}</i>` : `<i class="c${st === '2' ? ' done' : isLk(k) ? ' lk' : st === '1' ? ' atk' : ''}" data-k="${k}"></i>`; }
          h += '</div></div></div>';
        }
      } else {
        for (const f of AV.frentes) {
          const m = mc[f.id];
          const row = (sub, val, col) => { let r = `<div class="lrow ${sub}" data-id="${f.id}" data-sub="${val}"><span class="ln"><span class="fn">${sub === 'ra' || !f.a ? `<i class="dot" style="background:${f.cc}"></i>${esc(f.n)}` : ''}</span><span class="sb">${val === '1' ? 'atacado' : 'concluído'}</span></span><div class="cells">`;
            for (let k = s0; k < s1; k++) r += `<i class="c${f.c[k] === val ? ' on' : ''}${isLk(k) && f.c[k] === '0' ? ' lk' : ''}${m && val === '2' && m.has(k) ? ' m' : ''}" data-k="${k}"${f.c[k] === val ? ` style="background:${col}"` : ''}></i>`;
            return r + '</div></div>'; };
          h += `<div class="fgrp">${f.a ? row('ra', '1', f.ca) : ''}${row('rc', '2', f.cc)}</div>`;
        }
      }
      h += `<div class="erow"><span class="ln">Estaca</span><div class="cells">${Array.from({ length: s1 - s0 }, (_, i) => `<b>${s0 + i}</b>`).join('')}</div></div></div>`;
    }
    host.innerHTML = h;
  }
  let avDirty = false, avDown = null;
  function avPaintAt(el, first) {
    const c = el && el.closest && el.closest('i.c'); if (!c) return;
    const row = c.closest('.lrow'); const k = +c.dataset.k;
    if (first && isLk(k) && !(row.dataset.sim ? false : AV.frentes.find(x => x.id === row.dataset.id)?.c[k] !== '0')) {
      const t = (AV.travas || []).find(t => k >= Math.floor(t.e0) && k < Math.ceil(t.e1));
      $(row.dataset.sim ? '#s-tip' : '#a-tip').textContent = `Estaca ${k}: ${t ? t.n + ' (' + estStr(t.e0) + ' a ' + estStr(t.e1) + ')' : 'segmento travado'}. Não entra no que falta nem na simulação.`;
      avDown = null; return;
    }
    if (row.dataset.sim) {   // simulação: pincel com um ou mais serviços, célula a célula
      const id = row.dataset.sim;
      if (first) { const ids = BR.size > 1 && BR.has(id) ? [...BR] : [id]; avDown = { sim: id, ids, to: SMODE === 'del' ? '0' : String(MATV + 1) }; }
      if (!avDown || (avDown.ids.length === 1 && avDown.sim !== id)) return;
      for (const t of avDown.ids) {
        const f = AV.frentes.find(x => x.id === t), sl = simSel(t);
        if (avDown.to !== '0' && (isLk(k) || (SKIP && f && f.c[k] === '2'))) continue;
        if (sl[k] === avDown.to) continue;
        SIM[t] = sl.slice(0, k) + avDown.to + sl.slice(k + 1); avDirty = true;
        const el = document.querySelector(`#s-grid .lrow[data-sim="${t}"] i.c[data-k="${k}"]`);
        if (el) { const on = avDown.to !== '0'; el.classList.toggle('sel', on); el.style.background = on ? MCOL[MATV] : ''; el.style.color = on ? MTXT[MATV] : ''; el.textContent = on ? mesNum(MESES[MATV]) : ''; }
      }
      return;
    }
    const f = AV.frentes.find(x => x.id === row.dataset.id); const val = row.dataset.sub;
    if (first) avDown = { id: f.id, val, to: f.c[k] === val ? '0' : val };
    if (!avDown || avDown.id !== f.id || avDown.val !== val) return;
    if (f.c[k] === avDown.to) return;
    if (isLk(k) && avDown.to !== '0') return;
    f.c = f.c.slice(0, k) + avDown.to + f.c.slice(k + 1); avDirty = true;
    const grp = row.parentElement; grp.querySelectorAll(`i.c[data-k="${k}"]`).forEach(x => { const sv = x.closest('.lrow').dataset.sub; const on = f.c[k] === sv; x.classList.toggle('on', on); x.style.background = on ? (sv === '1' ? f.ca : f.cc) : ''; });
  }
  function bindGrid(g, sim) {
    const tip = sim ? '#s-tip' : '#a-tip';
    const can = () => sim || paintOn;
    g.addEventListener('pointerdown', ev => { if (!can() || !ev.target.closest('i.c')) return; g.setPointerCapture(ev.pointerId); avPaintAt(ev.target, true); ev.preventDefault(); });
    g.addEventListener('pointermove', ev => { if (!can() || !avDown) return; avPaintAt(document.elementFromPoint(ev.clientX, ev.clientY)); });
    const up = () => { if (!avDown) return; const wasSim = avDown.sim; avDown = null; if (avDirty) { avDirty = false; if (wasSim) { simSave(); renderSim(); } else { avSave(); renderAv(); } } };
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    g.addEventListener('click', ev => {
      const fb = ev.target.closest('[data-fill]');
      if (fb) { const id0 = fb.dataset.fill, a = +fb.dataset.s0, b = +fb.dataset.s1; const ids = BR.size > 1 && BR.has(id0) ? [...BR] : [id0];
        const f0 = AV.frentes.find(x => x.id === id0); const cur = String(MATV + 1); const all = simSel(id0).slice(a, b).split('').every((v, i) => v === cur || isLk(a + i) || (f0 && f0.c[a + i] === '2'));
        for (const id of ids) { const f = AV.frentes.find(x => x.id === id); const sl = simSel(id).split(''); for (let k = a; k < b; k++) if ((!f || f.c[k] !== '2') && !isLk(k)) { if (all) { if (sl[k] === cur) sl[k] = '0'; } else if (sl[k] === '0' || sl[k] === cur) sl[k] = cur; } SIM[id] = sl.join(''); }
        simSave(); renderSim(); return; }
      const ob = ev.target.closest('[data-oac]');
      if (ob) { const o = AV.oac[+ob.dataset.oac];
        if (!sim && paintOn) { o.st = { n: 'a', a: 'c', c: 'n' }[o.st]; avSave(); renderAv(); $(tip).textContent = `${o.t} (est. ${estStr(o.e)}): ${oacName(o.st)}.`; }
        else $(tip).textContent = `${o.t} · estaca ${estStr(o.e)}${o.L ? ' · ' + o.L + ' m' : ''}: ${oacName(o.st)}.${o.obs ? ' ' + o.obs + '.' : ''}${sim ? '' : ' Em “Editar”, toque no ícone para trocar a situação.'}`; return; }
      const tc = ev.target.closest('i.c.lk'); if (tc) { const t = (AV.travas || []).find(t => +tc.dataset.k >= Math.floor(t.e0) && +tc.dataset.k < Math.ceil(t.e1)); $(tip).textContent = `Estaca ${tc.dataset.k}: ${t ? t.n + ' (' + estStr(t.e0) + ' a ' + estStr(t.e1) + ')' : 'segmento travado'}. Não entra no que falta nem na simulação.`; if (can()) return; }
      if (can()) return; const c = ev.target.closest('i.c'); if (!c) return; const f = AV.frentes.find(x => x.id === c.closest('.lrow').dataset.id); const k = +c.dataset.k;
      const m = medCells()[f.id]?.get(k);
      $(tip).textContent = `${f.n} · estaca ${k} a ${k + 1}: ${stName(f.c[k])}.${m ? ` Medido na ${MED.n}ª medição: ${[...m].join(', ')}.` : ''} Em “Editar”, toque na linha atacado ou concluído para marcar ou desmarcar.`; });
  }
  function avInitEvents() {
    bindGrid($('#a-grid'), false); bindGrid($('#s-grid'), true);
    $('#a-hl').onchange = () => { avHl = $('#a-hl').checked; store.set('avHl', avHl); renderAv(); };
    const need = (fn) => (...a) => { if (!X.unlocked()) { X.ask(X.current(), 'Editar o retigráfico é restrito. Digite a senha para liberar a edição.'); return; } return fn(...a); };
    $('#a-paint').onclick = need(() => { paintOn = !paintOn; renderAv(); });
    for (const [id, k] of [['s-dbica', 'dBica'], ['s-dbgs', 'dBgs'], ['s-cap', 'cap'], ['s-eai', 'eai'], ['s-rr', 'rr'], ['s-xisto', 'xisto']]) $('#' + id).onchange = ev => { const v = parseFloat(ev.target.value.replace(/\./g, '').replace(',', '.')); if (Number.isFinite(v) && v >= 0) SP[k] = k === 'cap' ? v / 100 : v; else SP[k] = null; store.set('simPar', SP); renderSim(); };
    $('#s-clear').onclick = () => { if (!confirm('Limpar todas as células simuladas?')) return; SIM = {}; simSave(); renderSim(); };
    $('#s-brush').addEventListener('click', ev => { const b = ev.target.closest('[data-b]'); if (!b) return; const v = b.dataset.b;
      if (v === 'all') BR = new Set(SIMR.map(r => r.id)); else if (v === 'none') BR = new Set(); else BR.has(v) ? BR.delete(v) : BR.add(v);
      store.set('simBrush', [...BR]); renderSim(); });
    $$('#s-mode button').forEach(b => b.onclick = () => { SMODE = b.dataset.m; renderSim(); });
    $('#s-meses').addEventListener('click', ev => {
      const c = ev.target.closest('[data-mi]'); if (c) { MATV = +c.dataset.mi; SMODE = 'add'; mSave(); renderSim(); return; }
      if (ev.target.closest('#s-madd')) { if (MESES.length >= MMAX) return; MESES.push(ymNext(MESES[MESES.length - 1])); MATV = MESES.length - 1; SMODE = 'add'; mSave(); renderSim(); return; }
      if (ev.target.closest('#s-mdel')) { const n = MESES.length, ch = String(n); const usado = Object.values(SIM).some(t => t.includes(ch));
        if (usado && !confirm(`Remover ${mesNomeS(MESES[n - 1])} e apagar o que foi simulado nele?`)) return;
        for (const id of Object.keys(SIM)) SIM[id] = SIM[id].split(ch).join('0'); MESES.pop(); MATV = Math.min(MATV, MESES.length - 1); mSave(); simSave(); renderSim(); }
    });
    $('#s-mini').onchange = () => { const v = $('#s-mini').value; if (!/^\d{4}-\d{2}$/.test(v)) return; const out = [v]; while (out.length < MESES.length) out.push(ymNext(out[out.length - 1])); MESES = out; mSave(); renderSim(); };
    $('#s-skip').onchange = () => { SKIP = $('#s-skip').checked; store.set('simSkip', SKIP); };
    $('#s-rest').onclick = () => { const ids = BR.size ? [...BR] : SIMR.map(r => r.id);
      for (const id of ids) { const f = AV.frentes.find(x => x.id === id); let t = ''; const sl = simSel(id); for (let k = 0; k < NC; k++) t += isLk(k) ? '0' : f && f.c[k] === '2' ? sl[k] : sl[k] !== '0' && +sl[k] <= MESES.length ? sl[k] : String(MATV + 1); SIM[id] = t; }
      simSave(); renderSim(); $('#s-tip').textContent = `Marcado em ${mesNomeS(MESES[MATV])} todo o restante (ainda não simulado) de: ${ids.map(i => SIMR.find(r => r.id === i).n).join(', ')}.`; };
    $('#s-csv').onclick = () => { const R = simCalc(); const L = [['Mês', 'Serviço', 'Estacas', 'Extensão (m)', 'Quantidade', 'Un', 'Material', 'Quantidade do material', 'Un']];
      for (const [mi, ym] of MESES.entries()) for (const r of R) { const o = r.bm[mi]; if (!o.cnt) continue; const sl = simSel(r.id); const est = []; for (let i = 0; i < NC; i++) if (sl[i] === String(mi + 1) && !isLk(i)) est.push(i);
        for (const [k, v] of Object.entries(o.m)) L.push([mesNomeS(ym), r.n, est.join(' '), o.ext, o.q, r.un, k.replace(' (L)', ''), v, k.includes('(L)') ? 'L' : 't']); }
      L.push([], ['Demanda de britagem (sem CBUQ)', 'Mês', 'Volume (m³)', 'A britar (t)', ...PRD.map(p => p.n + ' (t)')]);
      for (const r of R.filter(r => r.mat === 'bica' || r.mat === 'bgs')) for (const [mi, ym] of MESES.entries()) { const o = r.bm[mi]; if (!o.cnt) continue; const sp = bSplit(r.mat, o.q); L.push([r.n, mesNomeS(ym), o.q, sp.t, ...PRD.map(p => sp[p.id])]); }
      L.push([`Britagem: densidade bica ${NF[2].format(bDens('bica'))} t/m³ · BGS ${NF[2].format(bDens('bgs'))} t/m³ (estudo de britagem)`]);
      L.push([], ['Premissas', `bica ${par('dBica')} t/m³`, `BGS ${par('dBgs')} t/m³`, `CAP ${par('cap') * 100}%`, `EAI ${par('eai')} kg/m²`, `RR-1C ${par('rr')} kg/m²`, `xisto ${par('xisto')} L/t`]);
      download(`simulacao_materiais_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n')); };
    $('#a-trv').onclick = need(() => { const a = parseEstIn($('#a-tei').value), b = parseEstIn($('#a-tef').value);
      if (a === null || b === null || b <= a) { $('#a-tip').textContent = 'Informe a estaca inicial e a final do segmento a travar.'; return; }
      AV.travas = [...(AV.travas || []), { e0: a, e1: Math.min(b, 642.79085), n: 'Não será executado' }]; LK = null; avSave(); renderAv(); $('#a-tip').textContent = `Segmento ${estStr(a)} a ${estStr(b)} travado: não entra no que falta nem na simulação.`; });
    $('#a-trv-x').onclick = need(() => { if (!(AV.travas || []).length || !confirm('Remover todas as travas (' + travaTxt() + ')?')) return; AV.travas = []; LK = null; avSave(); renderAv(); });
    $('#a-apply').onclick = need(() => {
      const a = parseEstIn($('#a-ei').value), b = parseEstIn($('#a-ef').value), k = $('#a-st').value; const ids = [...$('#a-lay').selectedOptions].map(o => o.value);
      if (a === null || b === null || !ids.length) { $('#a-tip').textContent = 'Informe estaca inicial, final e ao menos uma frente.'; return; }
      const i0 = Math.max(0, Math.floor(Math.min(a, b))), i1 = Math.min(NC - 1, Math.ceil(Math.max(a, b)) - 1);
      for (const f of AV.frentes) if (ids.includes(f.id)) { const kk = k === '1' && !f.a ? '2' : k; const c = f.c.split(''); for (let i = i0; i <= Math.max(i0, i1); i++) c[i] = kk; f.c = c.join(''); }
      avSave(); renderAv(); $('#a-tip').textContent = `Aplicado: ${stName(k)} da estaca ${i0} a ${Math.max(i0, i1) + 1} em ${ids.length} frente(s).`;
    });
    $('#a-add').onclick = need(() => { const n = prompt('Nome da nova frente (ex.: Sarjetas, Drenos, Sinalização horizontal):'); if (!n) return; const pc = PAL[AV.frentes.length % PAL.length]; AV.frentes.push({ id: 'u' + Date.now(), n: n.trim(), a: true, ca: pc[0], cc: pc[1], c: '0'.repeat(NC) }); avSave(); renderAv(); });
    $('#a-ren').onclick = need(() => { const ids = [...$('#a-lay').selectedOptions].map(o => o.value); if (ids.length !== 1) { $('#a-tip').textContent = 'Selecione uma frente na lista para renomear ou remover.'; return; } const f = AV.frentes.find(x => x.id === ids[0]); const n = prompt('Novo nome (deixe vazio para remover a frente):', f.n); if (n === null) return; if (!n.trim()) { if (confirm('Remover a frente “' + f.n + '”?')) AV.frentes = AV.frentes.filter(x => x !== f); } else f.n = n.trim(); avSave(); renderAv(); });
    $('#a-reset').onclick = need(() => { if (!confirm('Voltar ao retigráfico de ' + D.avanco.data.split('-').reverse().join('/') + '? As alterações feitas no app serão perdidas (exporte antes, se quiser guardar).')) return; AV = avDefault(); LK = null; avSave(); renderAv(); });
    $('#a-exp').onclick = () => download(`retigrafico_PR-990_${today()}.json`, JSON.stringify(AV), 'application/json');
    $('#a-csv').onclick = () => { const L = [['Estaca inicial', 'Estaca final', ...AV.frentes.map(f => f.n)]]; for (let k = 0; k < NC; k++) L.push([k, Math.min(k + 1, 642.79085), ...AV.frentes.map(f => stName(f.c[k]))]); L.push([], ['OAC', 'Estaca', 'Comprimento (m)', 'Situação']); for (const o of AV.oac) L.push([o.t, estStr(o.e), o.L || '', oacName(o.st)]); download(`retigrafico_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n')); };
    $('#a-imp').onclick = ev => { if (!X.unlocked()) { ev.preventDefault(); X.ask(X.current(), 'Importar um retigráfico é restrito. Digite a senha.'); } };
    $('#a-xlsx').onclick = ev => { if (!X.unlocked()) { ev.preventDefault(); X.ask(X.current(), 'Atualizar o retigráfico é restrito. Digite a senha.'); } };
    $('#a-xlsx').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) impRetig(f); };
    $('#b-xlsx').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) impBrit(f); };
    if ($('#m-curva')) curvaBind($('#m-curva'));
    $('#a-imp').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.frentes) throw new Error('arquivo de outro modelo de retigráfico'); AV = { ...avDefault(), ...j, v: 2 }; LK = null; avSave(); renderAv(); $('#a-tip').textContent = 'Retigráfico importado.'; } catch (e) { $('#a-tip').textContent = 'Arquivo inválido: ' + e.message; } ev.target.value = ''; };
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (X.current() === 'avanco') drawGrid(false); if (X.current() === 'simulacao') drawGrid(true); }, 200); });
  }
  const parseEstIn = s => { s = String(s || '').trim().replace(/\s/g, ''); if (!s) return null; if (s.includes('+')) { const [e, m] = s.split('+'); const v = +e + (parseFloat(m.replace(',', '.')) || 0) / 20; return Number.isFinite(v) ? v : null; } const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : null; };
  function avAt(k) { if (!AV) avLoad(); k = Math.max(0, Math.min(NC - 1, Math.floor(k))); return AV.frentes.map(f => ({ n: f.n, k: f.c[k], col: f.c[k] === '2' ? f.cc : f.c[k] === '1' ? f.ca : '#fff' })); }
  function oacNear(est, r) { if (!AV) avLoad(); return AV.oac.filter(o => Math.abs(o.e - est) * 20 <= r); }

  // ===================================================================== BRITAGEM
  // Premissas do estudo de britagem (data/britagem.json) com ajustes do usuário (britPar: caminho → valor);
  // demanda restante = retigráfico (o que não está concluído até a estaca final) × volumes por estaca × densidade × composição
  const PRD = [   // produtos da britagem; cores: paleta categórica (slots 1–5) da biblioteca de gráficos
    { id: 'bica', n: 'Bica corrida', fx: '1 1/4" ao fundo', c: '#eb6834' },
    { id: 'b1', n: 'Brita 01', fx: '7/8" a 3/8"', c: '#1baf7a' },
    { id: 'ped', n: 'Pedrisco', fx: '3/8" a 3/16"', c: '#eda100' },
    { id: 'po', n: 'Pó de pedra', fx: '3/16" ao fundo', c: '#e87ba4' },
  ];
  const BROWS = [   // demandas de Rebouças
    { id: 'ref1', n: '1ª camada de reforço', fr: 'p2', col: 'Reforço (m³)', f: 0.5, mat: 'bica', d0: 0, d1: 1 },
    { id: 'ref2', n: '2ª camada de reforço', fr: 'p3', col: 'Reforço (m³)', f: 0.5, mat: 'bica', d0: 0, d1: 1 },
    { id: 'sub', n: 'Sub-base', fr: 'p4', col: 'Sub-base (m³)', f: 1, mat: 'bica', d0: 0, d1: 1 },
    { id: 'base', n: 'Base – BGS', fr: 'p5', col: 'BGS (m³)', f: 1, mat: 'bgs', d0: 1, d1: 2 },
    { id: 'dreno', n: 'Brita para drenos', mat: 'dreno', d0: 0, d1: 1, xo: true },
    { id: 'conc', n: 'Concreto (fck diversos)', mat: 'conc', d0: 0, d1: 2, xo: true },
  ];
  const MATN = { bica: 'bica corrida', bgs: 'BGS', dreno: 'brita p/ dreno', conc: 'concreto' };
  let BPO = store.get('britPar', {}); let BBASE = store.get('britBase', null);
  const BB = () => BBASE || D.britagem;
  const bpDef = path => path.split('.').reduce((o, k) => o == null ? o : o[k], BB());
  const bp = path => { const v = BPO[path]; return v !== undefined && v !== null ? v : bpDef(path); };
  const bComp = mat => { const c = { ...(BB().comp[mat] || {}) }; for (const p of PRD) { const o = BPO[`comp.${mat}.${p.id}`]; if (o !== undefined && o !== null) c[p.id] = o; } if (mat === 'bgs' && BPO['comp.bgs.bica'] != null) c.po = Math.max(0, 1 - c.bica); return c; };
  const bDens = mat => bp(`dens.${mat}`);
  const bCap = p => p.pri ? bp('rate.' + p.id) * bp('pri.h') * bp('pri.t') * bp('pri.d') * bp('rend') : bp('rate.' + p.id) * bp('reb.h') * bp('reb.t') * bp('reb.d') * bp('rend');
  function bSplit(mat, vol) { const t = vol * bDens(mat); const c = bComp(mat); const o = { t }; for (const p of PRD) o[p.id] = t * (c[p.id] || 0); return o; }
  const ymAdd = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
  const ymCmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  let BST = store.get('britSt', {});
  const bSave = () => store.set('britSt', BST);
  const bStart = () => BST.ini || ymNext(ymNow());
  const bLim = () => BST.lim ?? 624;
  const bMode = () => BST.mode || 'prazo';
  const bSch = r => { const s = (BST.sch || {})[r.id]; return s || { i: ymAdd(bStart(), r.d0), f: ymAdd(bStart(), r.d1) }; };
  // o que falta de cada serviço do pavimento (não concluído no retigráfico, antes da estaca final e fora das travas)
  function bRest() {
    if (!AV) avLoad(); const Q = cellQ(); const lim = bLim(); const out = {};
    for (const r of BROWS.filter(r => !r.xo)) {
      const f = AV.frentes.find(x => x.id === r.fr); const sl = simSel(r.fr); const o = { vol: 0, ext: 0, cells: [], semSim: 0, semSimV: 0, byM: {} };
      for (let k = 0; k < NC; k++) { if (k >= lim || isLk(k) || (f && f.c[k] === '2')) continue; const v = Q[r.col][k] * r.f; o.vol += v; o.ext += cellLen(k);
        const mv = +sl[k]; if (mv > 0 && mv <= MESES.length) o.byM[MESES[mv - 1]] = (o.byM[MESES[mv - 1]] || 0) + v; else { o.semSim += cellLen(k); o.semSimV += v; } }
      out[r.id] = o;
    }
    out.dreno = { vol: bp('reb515.dreno'), ext: 0 }; out.conc = { vol: bp('reb515.conc'), ext: 0 };
    return out;
  }
  // demanda mensal (t por produto) e programa de britagem limitado pela capacidade e pela furação
  function bPlan() {
    const R = bRest(), S0 = bStart(), mode = bMode(); const dem = {}; const rows = [];
    const add = (ym, mat, vol, src) => { if (!vol) return; if (ymCmp(ym, S0) < 0) ym = S0; const s = bSplit(mat, vol); (dem[ym] ||= { reb: {} }); for (const p of PRD) dem[ym][src][p.id] = (dem[ym][src][p.id] || 0) + s[p.id]; };
    for (const r of BROWS) {
      const o = R[r.id]; const sp = bSplit(r.mat, o.vol); const sch = bSch(r); const bym = {};
      if (mode === 'sim' && !r.xo) { for (const [ym, v] of Object.entries(o.byM)) { add(ym, r.mat, v, 'reb'); bym[ym] = (bym[ym] || 0) + v; } }
      else { const i = ymCmp(sch.i, sch.f) <= 0 ? sch.i : sch.f, f = ymCmp(sch.i, sch.f) <= 0 ? sch.f : sch.i; const ms = []; for (let m = i; ymCmp(m, f) <= 0 && ms.length < 36; m = ymNext(m)) ms.push(m); for (const m of ms) { add(m, r.mat, o.vol / ms.length, 'reb'); bym[m] = o.vol / ms.length; } }
      rows.push({ ...r, ...o, sp, sch, bym });
    }
    const last = Object.keys(dem).sort().pop() || S0; const M = []; for (let m = S0; ymCmp(m, last) <= 0; m = ymNext(m)) M.push(m);
    const s = Object.fromEntries(PRD.map(p => [p.id, bp('estoque.' + p.id)]));
    let fStock = bp('rocha.furos') * bp('rocha.hEst'); const rD = bp('rocha.dens'), m3m = bp('rocha.m3m'), fCap = bp('rocha.furCap');
    const out = [];
    // meta de produção: o que passa da capacidade de um mês é britado antes (estoque); o estoque inicial abate as primeiras demandas
    const tgt = {}, Ct = {}, Pc = {};
    for (const p of PRD) { let st = Math.max(0, s[p.id]); const net = M.map(ym => { const dm = (dem[ym] && dem[ym].reb[p.id]) || 0; const u = Math.min(st, dm); st -= u; return dm - u; });
      const cap = bCap(p); const t = new Array(M.length).fill(0); let carry = 0; for (let i = M.length - 1; i >= 0; i--) { const req = net[i] + carry; t[i] = Math.min(cap, req); carry = req - t[i]; }
      if (carry > 0) t[0] += carry;   // não cabe nem antecipando: fica para o primeiro mês e vira falta
      tgt[p.id] = t; Ct[p.id] = 0; Pc[p.id] = 0; }
    for (let i = 0; i < M.length || (i < M.length + 12 && PRD.some(p => s[p.id] < -0.5)); i++) {
      const ym = M[i] || ymAdd(S0, i); const d = dem[ym] || { reb: {} };
      const row = { ym, p: {}, rocha: 0, fNeed: 0, drill: 0, fUse: 0, fac: 1 };
      for (const p of PRD) { const dm = d.reb[p.id] || 0; const cap = bCap(p); Ct[p.id] += (tgt[p.id][i] || 0); const need = Math.max(0, Ct[p.id] - Pc[p.id]); row.p[p.id] = { reb: dm, dem: dm, cap, pre: Math.min(cap, need) }; }
      const tot = PRD.reduce((a, p) => a + row.p[p.id].pre, 0); const fNeed = tot / rD / m3m;
      const drill = Math.min(fCap, Math.max(0, fNeed - fStock)); const av = fStock + drill; const use = Math.min(fNeed, av); fStock = av - use; const fac = fNeed > 1e-9 ? use / fNeed : 1;
      Object.assign(row, { fNeed, drill, fUse: use, fStock, fac, fCap });
      for (const p of PRD) { const o = row.p[p.id]; o.prod = o.pre * fac; Pc[p.id] += o.prod; s[p.id] += o.prod - o.dem; o.s = s[p.id]; o.util = o.cap ? o.prod / o.cap : 0; }
      row.tot = PRD.reduce((a, p) => a + row.p[p.id].prod, 0); row.rocha = row.tot; row.m3 = row.tot / rD; row.furos = row.fUse / bp('rocha.hFuro');
      out.push(row);
    }
    const fim = [...out].reverse().find(r => r.tot > 0.5);
    const falta = PRD.map(p => ({ p, v: -Math.min(0, s[p.id]) })).filter(x => x.v > 0.5);
    return { rows, R, M: out, fim: fim ? fim.ym : null, falta, S0 };
  }
  const bT = v => Math.abs(v) < 0.5 ? '–' : NF[0].format(v);
  function renderBrit() {
    if (!AV) avLoad();
    const P = bPlan(); const B = BB(); const lim = bLim();
    $('#b-fonte').textContent = `${B.fonte} · demanda de Rebouças pelo retigráfico de ${AV.data.split('-').reverse().join('/')}${AV.atualizado !== AV.data ? ' (com alterações feitas no app)' : ''}, até a estaca ${lim}`;
    $$('#b-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === bMode()));
    $('#b-ini').value = P.S0; if (document.activeElement !== $('#b-lim')) $('#b-lim').value = String(lim).replace('.', ',');
    const used = PRD.filter(p => P.M.some(r => r.p[p.id].dem > 0.5) || P.rows.some(r => r.sp[p.id] > 0.5));
    const sum = (f) => P.M.reduce((a, r) => a + f(r), 0);
    const totReb = P.rows.reduce((a, r) => a + r.sp.t, 0);
    const totProd = sum(r => r.tot), fur = sum(r => r.fUse), furos = fur / bp('rocha.hFuro');
    const per = P.M.length ? (P.M.length > 1 ? mesNomeS(P.M[0].ym) + ' – ' + mesNomeS(P.M[P.M.length - 1].ym) : mesNomeS(P.M[0].ym)) : '–';
    $('#b-hero').innerHTML = `<div><span>Período</span><b>${per}</b></div><div><span>A britar</span><b>${NF[0].format(totReb)} t</b></div><div><span>Rocha a desmontar</span><b>${NF[0].format(totProd / bp('rocha.dens'))} m³</b></div><div><span>Fim da britagem</span><b>${P.falta.length ? 'além de ' + mesNomeS(P.M[P.M.length - 1].ym) : P.fim ? mesNomeS(P.fim) : '–'}</b></div>`;
    const card = (l, v, u, sub, c) => `<div class="skpi"${c ? ` style="border-top-color:${c}"` : ''}><div class="sk-h"><span>${l}</span></div><div class="sk-v"><b>${v}</b><i>${u}</i></div><div class="sk-s">${sub}</div></div>`;
    const pt = id => sum(r => r.p[id].dem), pk = id => Math.max(0, ...P.M.map(r => r.p[id].util));
    $('#b-kpis').innerHTML = [
      card('A britar – restante', NF[0].format(totReb), 't', `${NF[0].format(P.rows.filter(r => !r.xo).reduce((a, r) => a + r.vol, 0))} m³ de pavimento + drenos e concreto`),
      ...['bica', 'po', 'b1', 'ped'].map(id => { const p = PRD.find(x => x.id === id); return card(p.n, NF[0].format(pt(id)), 't', `pico de ${NF[0].format(pk(id) * 100)}% da capacidade (${NF[0].format(bCap(p))} t/mês)`, p.c); }),
      card('Furação', NF[0].format(fur), 'm', `${NF[0].format(Math.ceil(furos))} furos de ${NF[0].format(bp('rocha.hFuro'))} m · estoque inicial ${NF[0].format(bp('rocha.furos'))} furos`),
    ].join('');
    // demanda restante
    const sim = bMode() === 'sim';
    const semSim = P.rows.filter(r => !r.xo && r.semSim > 0);
    $('#b-note').innerHTML = sim ? (semSim.length ? `<b>Atenção:</b> parte do restante ainda não foi pintada na Simulação e fica fora da demanda: ${semSim.map(r => `${esc(r.n)} ${NF[2].format(r.semSim / 1000)} km`).join(' · ')}. <a href="#simulacao">Abrir a simulação →</a>` : 'Todo o restante do pavimento está distribuído pelos meses pintados na Simulação.') :
      'Cada serviço é distribuído por igual entre o mês de início e o de término. Para seguir a pintura mês a mês, use “Meses da simulação”.';
    const mi = (id, k, v) => `<input type="month" class="bmi" data-r="${id}" data-k="${k}" value="${v}">`;
    $('#b-dem').innerHTML = `<table class="itbl stab btab"><thead><tr><th>Serviço</th><th class="n">Restante</th><th class="n">Volume</th><th class="n">Dens.</th><th class="n">A britar</th>${used.map(p => `<th class="n"><i class="dot" style="background:${p.c}"></i> ${esc(p.n)}</th>`).join('')}<th>Execução</th></tr></thead><tbody>
      ${P.rows.map(r => `<tr><td><b>${esc(r.n)}</b><div class="note">${esc(MATN[r.mat])}${r.mat === 'bgs' ? ` = ${NF[0].format(bComp('bgs').bica * 100)}% bica + ${NF[0].format((bComp('bgs').po || 0) * 100)}% pó` : r.mat === 'conc' ? ` = ${['b1', 'ped', 'po'].map(k => NF[0].format((bComp('conc')[k] || 0) * 100) + '% ' + PRD.find(p => p.id === k).n.toLowerCase()).join(' + ')}` : ''}</div></td>
        <td class="n" data-l="Restante">${r.xo ? 'saldo' : NF[2].format(r.ext / 1000) + ' km'}</td><td class="n" data-l="Volume">${r.xo ? `<input class="bvi" data-p="reb515.${r.id}" inputmode="decimal" value="${NF[1].format(r.vol).replace(/\./g, '')}">` : NF[0].format(r.vol)} m³</td><td class="n" data-l="Densidade">${NF[2].format(bDens(r.mat))}</td><td class="n" data-l="A britar"><b>${NF[0].format(r.sp.t)} t</b></td>
        ${used.map(p => `<td class="n" data-l="${esc(p.n)}">${bT(r.sp[p.id])}</td>`).join('')}
        <td data-l="Execução">${sim && !r.xo ? `<span class="note">conforme a simulação${r.semSim > 0 ? ` · <b class="warn">${NF[2].format(r.semSim / 1000)} km sem mês</b>` : ''}</span>` : `<span class="bsch">${mi(r.id, 'i', r.sch.i)}<span>a</span>${mi(r.id, 'f', r.sch.f)}</span>`}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total a britar – Rebouças</td><td class="n" data-l="A britar">${NF[0].format(totReb)} t</td>${used.map(p => `<td class="n" data-l="${esc(p.n)}">${bT(P.rows.reduce((a, r) => a + r.sp[p.id], 0))}</td>`).join('')}<td class="emp"></td></tr>
</tbody></table>`;
    // gráfico: produção por mês empilhada por produto
    const mx = Math.max(1, ...P.M.map(r => Math.max(r.tot, PRD.reduce((a, p) => a + r.p[p.id].dem, 0))));
    $('#b-chart').innerHTML = `<div class="bch">${P.M.map(r => { const dm = PRD.reduce((a, p) => a + r.p[p.id].dem, 0);
        return `<div class="bcol" title="${mesNomeS(r.ym)}: produzir ${NF[0].format(r.tot)} t · demanda ${NF[0].format(dm)} t"><span class="bv">${NF[0].format(r.tot / 1000)} mil t</span><div class="bstk">${dm > r.tot + 0.5 ? `<i class="bdef" style="height:${(dm - r.tot) / mx * 100}%" title="não atendido no mês"></i>` : ''}${[...used].reverse().map(p => r.p[p.id].prod > 0.5 ? `<i style="height:${r.p[p.id].prod / mx * 100}%;background:${p.c}" title="${esc(p.n)}: ${NF[0].format(r.p[p.id].prod)} t"></i>` : '').join('')}</div><span class="bm">${mesNomeS(r.ym)}</span></div>`; }).join('')}</div>
      <div class="legend av-legend">${used.map(p => `<span class="lg1"><i class="sw" style="background:${p.c}"></i>${esc(p.n)}</span>`).join('')}${P.M.some(r => PRD.reduce((a, p) => a + r.p[p.id].dem, 0) > r.tot + 0.5) ? '<span class="lg1"><i class="sw bdef"></i>demanda não atendida no mês</span>' : ''}</div>`;
    // programa por produto
    const cell = o => { const st = o.s < -0.5 ? `<small class="warn">falta ${NF[0].format(-o.s)} t</small>` : o.s > 0.5 ? `<small>estoque ${NF[0].format(o.s)} t</small>` : '';
      return `<b>${bT(o.prod)}</b><span class="bmtr${o.util > 0.999 ? ' full' : ''}"><i style="width:${Math.min(100, o.util * 100)}%"></i></span><small>${o.cap ? NF[0].format(o.util * 100) + '% da cap.' : ''}${o.dem > 0.5 ? ` · dem. ${NF[0].format(o.dem)}` : ''}</small>${st}`; };
    $('#b-prog').innerHTML = `<table class="itbl stab bprog"><thead><tr><th>Produto</th><th class="n">t/h · cap./mês</th>${P.M.map(r => `<th class="n">${mesNomeS(r.ym)}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
      ${used.map(p => `<tr><td><i class="dot" style="background:${p.c}"></i> <b>${esc(p.n)}</b><div class="note">${esc(p.fx)}${p.pri ? ' · britador primário' : ''}</div></td><td class="n" data-l="Capacidade">${NF[0].format(bp('rate.' + p.id))} t/h<div class="note">${NF[0].format(bCap(p))} t/mês</div></td>${P.M.map(r => `<td class="n bc" data-l="${mesNomeS(r.ym)}">${cell(r.p[p.id])}</td>`).join('')}<td class="n" data-l="Total"><b>${bT(sum(r => r.p[p.id].prod))}</b></td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Total britado</td>${P.M.map(r => `<td class="n" data-l="${mesNomeS(r.ym)}">${bT(r.tot)} t</td>`).join('')}<td class="n">${bT(totProd)} t</td></tr></tbody></table>
      ${P.falta.length ? `<p class="note warn">Com estes parâmetros fica faltando no fim: ${P.falta.map(x => `${esc(x.p.n)} ${NF[0].format(x.v)} t`).join(' · ')}. Aumente turnos, dias ou o prazo dos serviços.</p>` : ''}`;
    // furação e desmonte
    const fl = (l, f, d = 0, u = '') => `<tr><td>${l}</td>${P.M.map(r => `<td class="n" data-l="${mesNomeS(r.ym)}">${Math.abs(f(r)) < 0.5 && d === 0 ? '–' : NF[d].format(f(r)) + u}</td>`).join('')}</tr>`;
    $('#b-fur').innerHTML = `<table class="itbl stab"><thead><tr><th></th>${P.M.map(r => `<th class="n">${mesNomeS(r.ym)}</th>`).join('')}</tr></thead><tbody>
      ${fl('Rocha britada (t)', r => r.tot)}${fl('Rocha in situ (m³)', r => r.m3)}${fl('Furação necessária (m)', r => r.fNeed)}${fl('Furação a executar (m)', r => r.drill)}${fl('Furos (un)', r => r.furos)}${fl('Uso da perfuratriz', r => r.drill / r.fCap * 100, 0, '%')}${fl('Estoque furado no fim (m)', r => r.fStock)}</tbody></table>
      <p class="note">Rocha ${NF[1].format(bp('rocha.dens'))} t/m³ · ${NF[0].format(bp('rocha.m3m'))} m³ de rocha por metro furado · furos de ${NF[0].format(bp('rocha.hFuro'))} m · capacidade de ${NF[0].format(bp('rocha.furCap'))} m/mês · estoque inicial ${NF[0].format(bp('rocha.furos'))} furos (${NF[0].format(bp('rocha.furos') * bp('rocha.hEst'))} m).${P.M.some(r => r.fac < 0.999) ? ' <b class="warn">A furação limita a produção em ' + P.M.filter(r => r.fac < 0.999).map(r => mesNomeS(r.ym)).join(', ') + '.</b>' : ''}</p>`;
    // parâmetros
    const inp = (path, l, u, pct) => { const v = bp(path); const ch = BPO[path] !== undefined && BPO[path] !== null; return `<label class="lbl${ch ? ' chg' : ''}">${l} <input data-bp="${path}"${pct ? ' data-pct="1"' : ''} inputmode="decimal" value="${NF[pct ? 0 : 2].format(pct ? v * 100 : v).replace(/\./g, '')}"> ${u}</label>`; };
    $('#b-par').innerHTML = `<div class="bpar">
      <fieldset><legend>Densidade (t/m³)</legend>${inp('dens.bica', 'Bica corrida (reforço e sub-base)', '')}${inp('dens.bgs', 'BGS (base)', '')}${inp('dens.dreno', 'Brita p/ dreno', '')}${inp('dens.conc', 'Concreto', '')}</fieldset>
      <fieldset><legend>Composição</legend>${inp('comp.bgs.bica', 'BGS: bica corrida', '% (resto = pó)', 1)}${inp('comp.conc.b1', 'Concreto: brita 01', '%', 1)}${inp('comp.conc.ped', 'Concreto: pedrisco', '%', 1)}${inp('comp.conc.po', 'Concreto: pó', '%', 1)}</fieldset>
      <fieldset><legend>Produtividade (t/h)</legend>${PRD.map(p => inp('rate.' + p.id, p.n, 't/h')).join('')}</fieldset>
      <fieldset><legend>Jornada</legend>${inp('reb.h', 'Rebritagem: horas/turno', 'h')}${inp('reb.t', 'Rebritagem: turnos', '')}${inp('reb.d', 'Rebritagem: dias/mês', '')}${inp('rend', 'Rendimento mecânico', '%', 1)}</fieldset>
      <fieldset><legend>Desmonte e furação</legend>${inp('rocha.dens', 'Densidade da rocha', 't/m³')}${inp('rocha.m3m', 'Rocha por metro furado', 'm³/m')}${inp('rocha.hFuro', 'Altura do furo', 'm')}${inp('rocha.furCap', 'Capacidade de furação', 'm/mês')}${inp('rocha.furos', 'Furos em estoque', 'un')}</fieldset>
      <fieldset><legend>Estoque inicial (t)</legend>${PRD.map(p => inp('estoque.' + p.id, p.n, 't')).join('')}</fieldset>
      </div><p class="note">Valores do ${esc(B.fonte)}. Campos alterados ficam destacados. <button type="button" class="lnk" id="b-reset">Voltar aos valores do estudo</button></p>`;
    $('#b-prem-sum').textContent = `bica ${NF[0].format(bp('rate.bica'))} t/h · ${NF[0].format(bp('reb.t'))} turno(s) × ${NF[0].format(bp('reb.h'))} h × ${NF[0].format(bp('reb.d'))} dias × ${NF[0].format(bp('rend') * 100)}% · densidade ${NF[2].format(bDens('bica'))} t/m³ · BGS ${NF[0].format(bComp('bgs').bica * 100)}% bica + ${NF[0].format((bComp('bgs').po || 0) * 100)}% pó`;
  }
  function britInit() {
    const v = $('#v-britagem'); if (!v) return;
    const num2 = s => { const x = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
    v.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.bp) { const x = num2(t.value); BPO[t.dataset.bp] = x === null || x < 0 ? null : t.dataset.pct ? x / 100 : x; store.set('britPar', BPO); renderBrit(); return; }
      if (t.classList.contains('bvi')) { const x = num2(t.value); BPO[t.dataset.p] = x === null || x < 0 ? null : x; store.set('britPar', BPO); renderBrit(); return; }
      if (t.classList.contains('bmi')) { if (!/^\d{4}-\d{2}$/.test(t.value)) return; const r = BROWS.find(x => x.id === t.dataset.r); BST.sch = { ...(BST.sch || {}), [r.id]: { ...bSch(r), [t.dataset.k]: t.value } }; bSave(); renderBrit(); return; }
      if (t.id === 'b-ini') { if (!/^\d{4}-\d{2}$/.test(t.value)) return; const old = bStart(), n = t.value; const sh = (a) => { const [y1, m1] = old.split('-').map(Number), [y2, m2] = n.split('-').map(Number); return ymAdd(a, (y2 - y1) * 12 + m2 - m1); };
        if (BST.sch) for (const k of Object.keys(BST.sch)) BST.sch[k] = { i: sh(BST.sch[k].i), f: sh(BST.sch[k].f) }; BST.ini = n; bSave(); renderBrit(); return; }
      if (t.id === 'b-lim') { const x = num2(t.value); BST.lim = x === null ? null : Math.max(0, Math.min(NC, x)); bSave(); renderBrit(); return; }
    });
    v.addEventListener('click', ev => {
      const m = ev.target.closest('#b-mode [data-m]'); if (m) { BST.mode = m.dataset.m; bSave(); renderBrit(); return; }
      if (ev.target.closest('#b-reset')) { if (!confirm('Voltar todos os parâmetros aos valores do estudo de britagem?')) return; BPO = {}; store.set('britPar', BPO); renderBrit(); }
    });
    $('#b-csv').onclick = () => { const P = bPlan(); const L = [['Mês', 'Produto', 'Demanda (t)', 'Capacidade (t)', 'Produzir (t)', 'Utilização', 'Estoque (+) / falta (−) no fim (t)']];
      for (const r of P.M) for (const p of PRD) { const o = r.p[p.id]; if (o.dem < 0.5 && o.prod < 0.5) continue; L.push([mesNomeS(r.ym), p.n, o.dem, o.cap, o.prod, o.util, o.s]); }
      L.push([], ['Mês', 'Rocha britada (t)', 'Rocha in situ (m³)', 'Furação necessária (m)', 'Furação a executar (m)', 'Furos', 'Estoque furado no fim (m)']);
      for (const r of P.M) L.push([mesNomeS(r.ym), r.tot, r.m3, r.fNeed, r.drill, r.furos, r.fStock]);
      L.push([], ['Serviço', 'Restante (km)', 'Volume (m³)', 'Densidade (t/m³)', 'A britar (t)', ...PRD.map(p => p.n + ' (t)'), 'Início', 'Término']);
      for (const r of P.rows) L.push([r.n, r.xo ? '' : r.ext / 1000, r.vol, bDens(r.mat), r.sp.t, ...PRD.map(p => r.sp[p.id]), bMode() === 'sim' && !r.xo ? 'simulação' : mesNomeS(r.sch.i), bMode() === 'sim' && !r.xo ? '' : mesNomeS(r.sch.f)]);
      download(`britagem_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n')); };
  }
  // resumo de britagem da simulação: volumes pintados × densidade e composição do estudo (sem CBUQ)
  function simBrit(R) {
    const rows = R.filter(r => r.mat === 'bica' || r.mat === 'bgs').map(r => { const mat = r.mat === 'bgs' ? 'bgs' : 'bica'; return { r, mat, tot: bSplit(mat, r.q), bm: r.bm.map(o => bSplit(mat, o.q)) }; });
    const prods = PRD.filter(p => rows.some(x => x.tot[p.id] > 0.005) || p.id === 'bica');
    const capB = bCap(PRD.find(p => p.id === 'bica'));
    const mT = MESES.map((_, i) => rows.reduce((a, x) => a + x.bm[i].t, 0)), mB = MESES.map((_, i) => rows.reduce((a, x) => a + x.bm[i].bica, 0));
    const tot = rows.reduce((a, x) => a + x.tot.t, 0), m3 = tot / bp('rocha.dens'), fur = m3 / bp('rocha.m3m');
    const T0 = v => Math.abs(v) < 0.05 ? '–' : NF[1].format(v);
    $('#s-brit').innerHTML = `<div class="sbk">${[['A britar', NF[0].format(tot) + ' t', `${prods.map(p => `${p.n.toLowerCase()} ${NF[0].format(rows.reduce((a, x) => a + x.tot[p.id], 0))} t`).join(' · ')}`],
        ['Rocha a desmontar', NF[0].format(m3) + ' m³', `${NF[0].format(tot)} t de rocha a ${NF[1].format(bp('rocha.dens'))} t/m³`],
        ['Furação', NF[0].format(fur) + ' m', `${NF[0].format(Math.ceil(fur / bp('rocha.hFuro')))} furos de ${NF[0].format(bp('rocha.hFuro'))} m`],
        ['Rebritagem (bica)', NF[0].format(rows.reduce((a, x) => a + x.tot.bica, 0) / bp('rate.bica')) + ' h', `a ${NF[0].format(bp('rate.bica'))} t/h · cap. ${NF[0].format(capB)} t/mês`]].map(([l, v, s]) => `<div><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join('')}</div>
      <table class="itbl stab"><thead><tr><th>Serviço</th><th class="n">Volume</th>${MESES.map((ym, i) => `<th class="n"><i class="msw" style="background:${MCOL[i]};color:${MTXT[i]}">${mesNum(ym)}</i> ${mesNomeS(ym)}</th>`).join('')}${prods.map(p => `<th class="n"><i class="dot" style="background:${p.c}"></i> ${esc(p.n)}</th>`).join('')}<th class="n">A britar</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td><i class="dot" style="background:${SCOL[x.r.id]}"></i> <b>${esc(x.r.n)}</b><div class="note">${esc(MATN[x.mat])} · ${NF[2].format(bDens(x.mat))} t/m³${x.mat === 'bgs' ? ` · ${NF[0].format(bComp('bgs').bica * 100)}% bica + ${NF[0].format((bComp('bgs').po || 0) * 100)}% pó` : ''}</div></td><td class="n" data-l="Volume">${x.r.q > 0.05 ? NF[0].format(x.r.q) + ' m³' : '–'}</td>${x.bm.map((o, i) => `<td class="n" data-l="${mesNomeS(MESES[i])}">${T0(o.t)}</td>`).join('')}${prods.map(p => `<td class="n" data-l="${esc(p.n)}">${T0(x.tot[p.id])}</td>`).join('')}<td class="n" data-l="A britar"><b>${T0(x.tot.t)}</b></td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Total a britar (t)</td>${mT.map((v, i) => `<td class="n" data-l="${mesNomeS(MESES[i])}">${T0(v)}</td>`).join('')}${prods.map(p => `<td class="n">${T0(rows.reduce((a, x) => a + x.tot[p.id], 0))}</td>`).join('')}<td class="n">${T0(tot)}</td></tr>
      <tr><td colspan="2">Bica corrida × capacidade do mês</td>${mB.map((v, i) => `<td class="n" data-l="${mesNomeS(MESES[i])}">${v > 0.5 ? `<span class="${v > capB ? 'warn' : ''}">${NF[0].format(v / capB * 100)}%</span>` : '–'}</td>`).join('')}<td colspan="${prods.length + 1}" class="note">capacidade de bica: ${NF[0].format(capB)} t/mês</td></tr></tbody></table>`;
  }

  // ===================================================================== APRESENTAÇÃO (diretoria)
  // Deck de slides montado a partir da Simulação: situação atual, retigráfico planejado mês a mês (com reprodução),
  // evolução, recursos, britagem, valores (PI + R) e pontos de atenção. Tudo recalculado da pintura da Simulação.
  let AS = 0, AM = null, APLAY = null, AED = false;   // slide atual, mês selecionado (começa no último), reprodução, edição dos outros serviços
  let OFIN = store.get('aprFin', {});   // outros serviços lançados à mão: grupo do contrato → { 'aaaa-mm': PI em R$ }
  const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesLong = ym => { const [y, m] = ym.split('-'); return `${MESL[+m - 1]} de ${y}`; };
  const mi$ = v => { const a = Math.abs(v); return a >= 1e6 ? 'R$ ' + NF[2].format(v / 1e6) + ' mi' : a >= 1e3 ? 'R$ ' + NF[0].format(v / 1e3) + ' mil' : 'R$ ' + NF[0].format(v); };
  const APRC = [   // serviço simulado → itens do contrato (linha do Painel) e como sai a quantidade
    { row: 97, n: 'Bica corrida (reforço e sub-base)', q: (R, i) => ['p2', 'p3', 'p4'].reduce((a, id) => a + R.find(r => r.id === id).bm[i].q, 0) },
    { row: 98, n: 'Base – BGS', q: (R, i) => R.find(r => r.id === 'p5').bm[i].q },
    { row: 99, n: 'Imprimação', q: (R, i) => R.find(r => r.id === 'p6').bm[i].q },
    { row: 100, n: 'Pintura de ligação', q: (R, i) => R.find(r => r.id === 'p7').bm[i].rr },
    { row: 102, n: 'CBUQ', q: (R, i) => R.find(r => r.id === 'p7').bm[i].q },
    { row: 112, n: 'CAP 50/70', q: (R, i) => R.find(r => r.id === 'p7').bm[i].m['CAP 50/70'] },
    { row: 113, n: 'Emulsão EAI', q: (R, i) => R.find(r => r.id === 'p6').bm[i].m['Emulsão EAI'] },
    { row: 114, n: 'Emulsão RR-1C', q: (R, i) => R.find(r => r.id === 'p7').bm[i].m['Emulsão RR-1C'] },
  ];
  function aprData() {
    if (!AV) avLoad();
    const R = simCalc(); const LL = lockLen(), EXE = TOT - LL; const nM = MESES.length;
    const sv = SIMR.map(r => { const f = AV.frentes.find(x => x.id === r.id); const sl = simSel(r.id); let ex = 0; const pm = new Array(nM).fill(0);
      for (let k = 0; k < NC; k++) { if (f && f.c[k] === '2') { ex += cellLen(k); continue; } if (isLk(k)) continue; const v = +sl[k]; if (v > 0 && v <= nM) pm[v - 1] += cellLen(k); }
      const cum = []; let a = ex; for (const v of pm) { a += v; cum.push(a); }
      return { ...r, ex, pm, cum, plan: pm.reduce((s, v) => s + v, 0), rest: Math.max(0, EXE - a) }; });
    const runs = test => { const o = []; let k0 = null; for (let k = 0; k <= NC; k++) { const on = k < NC && test(k); if (on && k0 === null) k0 = k; if (!on && k0 !== null) { o.push([k0, k === NC ? TOT / 20 : k]); k0 = null; } } return o; };
    const all = AV.frentes.map(f => { const st = avStats(f.c); return { id: f.id, n: f.n, cc: f.cc, ca: f.ca || f.cc, p: st['2'] / (TOT - st.L), km: st['2'] / 1000,
      ex: runs(k => f.c[k] === '2'), at: runs(k => f.c[k] === '1'), falta: runs(k => f.c[k] === '0' && !isLk(k)) }; });
    const val = MESES.map((_, i) => { let pi = 0, r = 0; const it = APRC.map(p => { const q = p.q(R, i) || 0; const pr = num(C('I' + p.row)); const v = q * pr; const rr = X.reajR ? X.reajR(p.row) : 0; pi += v; r += v * rr; return { ...p, qv: q, v, rr }; }); return { pi, r, it }; });
    const brit = MESES.map((_, i) => { let t = 0, bica = 0, po = 0; for (const r of R) { if (r.mat !== 'bica' && r.mat !== 'bgs') continue; const s = bSplit(r.mat, r.bm[i].q); t += s.t; bica += s.bica; po += s.po; } return { t, bica, po }; });
    const capB = bCap(PRD.find(p => p.id === 'bica'));
    // pontos de atenção
    const att = [];
    const naoPl = sv.filter(s => s.rest > 1);
    if (naoPl.length) att.push({ k: 'warn', t: 'Trechos ainda sem mês', d: naoPl.map(s => `${s.n}: ${NF[2].format(s.rest / 1000)} km`).join(' · ') + '. Fora do plano e das quantidades.' });
    else att.push({ k: 'ok', t: 'Plano cobre todo o restante', d: `Todas as camadas chegam a 100% do trecho a executar até ${mesNomeS(MESES[nM - 1])}.` });
    brit.forEach((b, i) => { if (b.bica > capB) att.push({ k: 'warn', t: `Britagem acima da capacidade em ${mesNomeS(MESES[i])}`, d: `${NF[0].format(b.bica)} t de bica corrida para ${NF[0].format(capB)} t/mês (${NF[0].format(b.bica / capB * 100)}%). Antecipar produção ou ampliar turnos.` }); });
    const seq = []; for (let i = 0; i < nM; i++) { const c = id => sv.find(s => s.id === id).cum[i]; const pairs = [['p3', 'p2'], ['p4', 'p3'], ['p5', 'p4'], ['p6', 'p5'], ['p7', 'p6']]; for (const [a, b] of pairs) if (c(a) - c(b) > 20.5) seq.push(`${sv.find(s => s.id === a).n} à frente de ${sv.find(s => s.id === b).n.toLowerCase()} em ${mesNomeS(MESES[i])}`); }
    // célula a célula: camada superior planejada antes (ou sem) a inferior
    let inv = 0, ret = 0; const invK = []; const ord = ['p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    for (let k = 0; k < NC; k++) { if (isLk(k)) continue; let prev = 0, prevEx = true, bad = false, rbad = false; for (const id of ord) { const f = AV.frentes.find(x => x.id === id); const ex = f && f.c[k] === '2'; const v = +simSel(id)[k]; const m = ex ? 0 : (v > 0 && v <= nM ? v : 99);
        if (ex && !prevEx) rbad = true; else if (!ex && m < prev) bad = true; prev = Math.max(prev, m); prevEx = ex; } if (bad) { inv++; if (invK.length < 5) invK.push(k); } if (rbad) ret++; }
    if (inv) att.push({ k: 'warn', t: 'Sequência de camadas', d: `${inv} estaca${inv > 1 ? 's' : ''} com uma camada planejada antes da camada de baixo (ou a de baixo sem mês): ${invK.map(k => 'est. ' + k).join(', ')}${inv > invK.length ? '…' : ''}. Rever a pintura.` });
    else att.push({ k: 'ok', t: 'Sequência de camadas respeitada', d: 'Em todas as estacas cada camada vem no mesmo mês ou depois da camada de baixo.' });
    if (ret) att.push({ k: 'info', t: 'Retigráfico a conferir', d: `${ret} estaca${ret > 1 ? 's' : ''} com camada superior concluída e a de baixo não concluída no retigráfico de ${AV.data.split('-').reverse().join('/')}.` });
    const oacP = AV.oac.filter(o => o.st !== 'c' && o.e < NC && !isLk(Math.floor(o.e)) && sv.some(s => { const v = +simSel(s.id)[Math.floor(o.e)]; return v > 0 && v <= nM; }));
    if (oacP.length) att.push({ k: 'warn', t: 'Bueiros pendentes em trechos planejados', d: `${oacP.length} OAC não concluído${oacP.length > 1 ? 's' : ''} sob segmentos com pavimentação planejada: ${oacP.slice(0, 6).map(o => `${o.t} (est. ${estStr(o.e)})`).join(', ')}${oacP.length > 6 ? '…' : ''}. Concluir antes da base.` });
    if (LL) att.push({ k: 'info', t: 'Segmento fora do escopo', d: `${travaTxt()} (${NF[2].format(LL / 1000)} km) não será executado e não entra nos percentuais.` });
    return { R, sv, all, val, brit, capB, att, EXE, LL, nM };
  }
  function aprDiagram(sv, sel, pcts) {
    const W = 1200, LW = 168, RW = 74, rh = 24, gap = 9, top = 26, nR = sv.length; const H = top + nR * (rh + gap) + 6; const sx = (W - LW - RW) / (TOT / 20);
    let g = '';
    for (let km = 0; km <= 12; km++) { const x = LW + km * 50 * sx; g += `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${H - 6}" class="ax"/><text x="${x + 2}" y="${top - 10}" class="axt">${km ? km : 'km 0'}</text>`; }
    sv.forEach((s, j) => { const f = AV.frentes.find(x => x.id === s.id); const sl = simSel(s.id); const y = top + j * (rh + gap); g += `<text x="${LW - 10}" y="${y + rh / 2 + 5}" class="rl" text-anchor="end">${esc(s.n)}</text><text x="${W}" y="${y + rh / 2 + 6}" class="rp" text-anchor="end">${fPc(pcts[j])}</text>`;
      let run = null; const flush = () => { if (run) { g += `<rect x="${(LW + run.k0 * sx).toFixed(2)}" y="${y}" width="${Math.max(0.6, (run.k1 - run.k0) * sx).toFixed(2)}" height="${rh}" class="${run.c}"${run.f ? ` fill="${run.f}"` : ''}${run.o ? ` fill-opacity="${run.o}"` : ''}><title>${esc(s.n)} · est. ${run.k0} a ${run.k1}: ${run.t}</title></rect>`; run = null; } };
      for (let k = 0; k < NC; k++) { const kl = k + cellLen(k) / 20; let c, fl = '', o = '', t;
        if (f && f.c[k] === '2') { c = 'ex'; t = 'executado'; } else if (isLk(k)) { c = 'lk'; t = 'não será executado'; } else { const v = +sl[k]; if (v > 0 && v <= MESES.length) { const fut = sel >= -0.5 ? v - 1 > sel : false; c = fut ? 'fu' : 'pl'; fl = MCOL[v - 1]; o = fut ? '.22' : ''; t = (fut ? 'planejado para ' : 'executado em ') + mesNomeS(MESES[v - 1]); if (sel < -0.5) { c = 'fu'; o = '.22'; t = 'planejado para ' + mesNomeS(MESES[v - 1]); } } else { c = 're'; t = 'sem mês definido'; } }
        const key = c + fl + o; if (run && run.key === key) run.k1 = kl; else { flush(); run = { key, c, f: fl, o, t, k0: k, k1: kl }; } }
      flush(); });
    const oe = (AV.oae || []).map(o => `<rect x="${LW + o.e0 * sx}" y="${top - 4}" width="${Math.max(3, (o.e1 - o.e0) * sx)}" height="${H - top - 2}" class="apo"><title>${esc(o.n)}</title></rect>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="ap-svg" role="img" aria-label="Retigráfico planejado"><defs><pattern id="aprh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#e3e6e9"/><line x1="0" y1="0" x2="0" y2="5" stroke="#b9c0c6" stroke-width="2"/></pattern></defs>${g}${oe}</svg>`;
  }
  function renderApr() {
    if (!AV) avLoad();
    const A = aprData(); const nM = A.nM; if (AM === null || AM >= nM || AM < 0) AM = nM - 1;
    const per = nM > 1 ? `${mesNomeS(MESES[0])} – ${mesNomeS(MESES[nM - 1])}` : mesNomeS(MESES[0]);
    const pav = A.sv.filter(s => s.id !== 'p6'); const pctNow = s => s.ex / A.EXE, pctAt = (s, i) => (i < 0 ? s.ex : s.cum[i]) / A.EXE;
    const cb = A.sv.find(s => s.id === 'p7');
    const totPlan = A.sv.reduce((a, s) => Math.max(a, s.plan), 0);
    const GR = X.reajG ? X.reajG() : [];
    const oth = MESES.map(ym => { let pi = 0, r = 0; GR.forEach((g, gi) => { const v = +((OFIN[gi] || {})[ym]) || 0; pi += v; r += v * g.R; }); return { pi, r }; });
    const vt = A.val.reduce((a, v) => a + v.pi + v.r, 0) + oth.reduce((a, o) => a + o.pi + o.r, 0), vpi = A.val.reduce((a, v) => a + v.pi, 0) + oth.reduce((a, o) => a + o.pi, 0);
    const temO = oth.some(o => o.pi > 0);
    const R = A.R; const sum = (id, k) => R.find(r => r.id === id).m[k] || 0;
    const pet = ['p2', 'p3', 'p4'].reduce((a, id) => a + sum(id, 'Bica corrida'), 0) + sum('p5', 'Brita graduada (BGS)');
    const SL = [];
    // 1 · capa
    SL.push({ t: 'Capa', h: `<div class="ap-cover"><div class="ap-k">PR-990 · Contrato 050/2024 · TCE Engenharia</div><h2>Plano de pavimentação<br><span>${per}</span></h2>
      <p class="ap-lead">Rodovia PR-364 → Rebouças · ${NF[2].format(A.EXE / 1000)} km a executar${A.LL ? ` · ${NF[2].format(A.LL / 1000)} km fora do escopo` : ''} · situação do retigráfico de ${AV.data.split('-').reverse().join('/')}</p>
      <div class="ap-big">${[[fPc(pctNow(cb)), 'CBUQ concluído hoje'], [fPc(pctAt(cb, nM - 1)), `CBUQ ao fim de ${mesNomeS(MESES[nM - 1])}`], [NF[2].format(cb.plan / 1000) + ' km', 'de pista no período'], [mi$(vt), temO ? 'a executar (PI + R)' : 'pavimentação a executar (PI + R)']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <div class="ap-foot">Apresentação à diretoria · ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>` });
    // 2 · onde estamos
    SL.push({ t: 'Onde estamos', h: `<div class="ap-h"><span class="ap-n">01</span><h3>Onde estamos</h3><p>Onde cada frente está concluída ao longo do trecho (estacas), conforme o retigráfico de ${AV.data.split('-').reverse().join('/')}. Percentual sobre o trecho a executar.</p></div>
      <div class="ap-prog">${A.all.map(f => { const E = TOT / 20, pc = v => (v / E * 100).toFixed(3) + '%'; const rg = r => `${estStr(r[0])} a ${estStr(r[1])}`;
          const ft = f.falta.filter(r => r[1] - r[0] >= 0.5); const fx = ft.slice(0, 5).map(r => `${Math.floor(r[0])}–${Math.ceil(r[1])}`).join(' · ') + (ft.length > 5 ? ` · +${ft.length - 5} trechos` : '');
          return `<div class="ap-pr"><span class="n"><i class="dot" style="background:${f.cc}"></i>${esc(f.n)}</span>
          <span class="st" title="${esc(f.n)} – concluído: ${f.ex.map(rg).join(', ') || 'nada'}${f.at.length ? ' · em execução: ' + f.at.map(rg).join(', ') : ''}${f.falta.length ? ' · falta: ' + f.falta.map(rg).join(', ') : ''}">${f.ex.map(r => `<i style="left:${pc(r[0])};width:${pc(r[1] - r[0])};background:${f.cc}"></i>`).join('')}${f.at.map(r => `<i class="at" style="left:${pc(r[0])};width:${pc(r[1] - r[0])};background:${f.ca}"></i>`).join('')}${(AV.travas || []).map(t => `<i class="lk" style="left:${pc(t.e0)};width:${pc(t.e1 - t.e0)}"></i>`).join('')}</span>
          <b>${fPc(f.p)}</b><small>${NF[2].format(f.km)} km</small>
          <span class="fx">${f.at.length ? `em execução: est. ${f.at.map(r => `${Math.floor(r[0])}–${Math.ceil(r[1])}`).join(' · ')}${ft.length ? ' · ' : ''}` : ''}${ft.length ? `falta: est. ${fx}` : f.at.length ? '' : 'concluído em todo o trecho a executar'}</span></div>`; }).join('')}
        <div class="ap-pr ax"><span></span><span class="sx">${[0, 100, 200, 300, 400, 500, 600].map(e => `<i style="left:${(e / (TOT / 20) * 100).toFixed(2)}%">${e}</i>`).join('')}<i class="end" style="left:100%">${NF[0].format(Math.floor(TOT / 20))}</i></span><span></span><span></span></div></div>
      <div class="ap-row3">${(() => { const oc = { c: 0, a: 0, n: 0 }; AV.oac.forEach(o => oc[o.st]++); return [[`${oc.c}/${AV.oac.length}`, 'bueiros e galerias concluídos', `${oc.a} em execução · ${oc.n} não iniciados`], [NF[2].format(cb.ex / 1000) + ' km', 'com CBUQ', `de ${NF[2].format(A.EXE / 1000)} km a executar`], [NF[2].format(Math.max(0, A.EXE - cb.ex) / 1000) + ' km', 'falta pavimentar (CBUQ)', (() => { const ft = A.all.find(x => x.id === 'p7').falta.filter(r => r[1] - r[0] >= 0.5); return 'est. ' + ft.slice(0, 4).map(r => `${Math.floor(r[0])}–${Math.ceil(r[1])}`).join(' · ') + (ft.length > 4 ? ` · +${ft.length - 4}` : ''); })()]].map(([v, l, s]) => `<div class="ap-stat"><b>${v}</b><span>${l}</span><small>${s}</small></div>`).join(''); })()}</div>` });
    // 3 · retigráfico planejado
    SL.push({ t: 'Planejado', h: `<div class="ap-h"><span class="ap-n">02</span><h3>Planejado</h3><p>Situação planejada ao fim de cada mês. Escolha o mês ou reproduza.</p></div>
      <div class="ap-mes" role="group" aria-label="Situação ao fim do mês">${MESES.map((ym, i) => `<button type="button" class="ap-mb${AM === i ? ' on' : ''}" data-am="${i}"><i style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</button>`).join('')}<button type="button" class="ap-play" id="ap-play">${APLAY ? '❚❚ Pausar' : '▶ Reproduzir'}</button></div>
      <div class="ap-diag ap-dg">${aprDiagram(A.sv, AM, A.sv.map(s => pctAt(s, AM)))}</div>
      <div class="ap-leg"><span><i class="ex"></i>executado</span>${MESES.map((ym, i) => `<span><i style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</span>`).join('')}<span><i class="fu"></i>planejado (meses seguintes)</span><span><i class="re"></i>sem mês</span>${A.LL ? '<span><i class="lk"></i>fora do escopo</span>' : ''}<span><i class="apo"></i>ponte</span></div>
      <p class="ap-cap">${AM < 0 ? `Hoje: CBUQ em ${fPc(pctNow(cb))} do trecho a executar.` : (() => { const ad = A.sv.filter(s => s.pm[AM] > 1); return `Ao fim de ${mesLong(MESES[AM])}: CBUQ em ${fPc(pctAt(cb, AM))}.` + (ad.length ? `<small>No mês: ${ad.map(s => `${esc(s.n)} +${NF[2].format(s.pm[AM] / 1000)} km`).join(' · ')}</small>` : ''); })()}</p>` });
    // 4 · evolução
    const W = 680, H = 280, pl = 40, pr = 190, pt = 14, pb = 30; const y0 = Math.max(0, Math.floor(Math.min(...A.sv.map(s => pctNow(s))) * 10 - 1) / 10); const xs = i => pl + (i + 1) / nM * (W - pl - pr), ys = v => pt + (1 - (v - y0) / (1 - y0)) * (H - pt - pb);
    const lines = A.sv.map(s => { const pts = [[pl, ys(pctNow(s))], ...s.cum.map((c, i) => [xs(i), ys(c / A.EXE)])]; return { s, pts }; });
    const lab = lines.map(l => ({ l, y: l.pts[l.pts.length - 1][1] })).sort((a, b) => a.y - b.y); for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 13) lab[i].y = lab[i - 1].y + 13;
    SL.push({ t: 'Evolução', h: `<div class="ap-h"><span class="ap-n">03</span><h3>Evolução do avanço</h3><p>Percentual concluído de cada camada ao fim de cada mês${y0 > 0 ? ` (eixo a partir de ${NF[0].format(y0 * 100)}%)` : ''}.</p></div>
      <div class="ap-evo"><svg viewBox="0 0 ${W} ${H}" class="ap-line" role="img" aria-label="Evolução do avanço por camada">
      ${[0, .25, .5, .75, 1].map(f => y0 + f * (1 - y0)).map(v => `<line x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}" class="gr"/><text x="${pl - 6}" y="${ys(v) + 4}" class="yt">${NF[0].format(v * 100)}%</text>`).join('')}
      <text x="${pl}" y="${H - 8}" class="xt">hoje</text>${MESES.map((ym, i) => `<text x="${xs(i)}" y="${H - 8}" class="xt" text-anchor="middle">${mesNomeS(ym)}</text>`).join('')}
      ${lines.map(({ s, pts }) => `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${SCOL[s.id]}" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${SCOL[s.id]}"><title>${esc(s.n)} · ${i ? mesNomeS(MESES[i - 1]) : 'hoje'}: ${fPc(i ? s.cum[i - 1] / A.EXE : pctNow(s))}</title></circle>`).join('')}`).join('')}
      ${lab.map(({ l, y }) => `<text x="${W - pr + 8}" y="${y + 4}" class="ll" fill="${SCOL[l.s.id]}">${esc(l.s.n)} ${fPc(l.s.cum[nM - 1] / A.EXE)}</text>`).join('')}</svg>
      <div class="ap-tbl"><table><thead><tr><th>Mês</th><th class="n">Pista nova (CBUQ)</th><th class="n">Base</th><th class="n">Sub-base</th><th class="n">Reforço</th></tr></thead><tbody>${MESES.map((ym, i) => `<tr><td><i class="msq" style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</td>${['p7', 'p5', 'p4', 'p2'].map(id => { const s = A.sv.find(x => x.id === id); return `<td class="n">${s.pm[i] ? NF[2].format(s.pm[i] / 1000) + ' km' : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>` });
    // 5 · recursos
    const mt = (k, i) => R.reduce((a, r) => a + (r.bm[i].m[k] || 0), 0);
    const recs = [['Bica corrida', 't', 1], ['Brita graduada (BGS)', 't', 1], ['CBUQ', 't', 1], ['CAP 50/70', 't', 2], ['Emulsão EAI', 't', 2], ['Emulsão RR-1C', 't', 2], ['Xisto (L)', 'L', 0]];
    const mxB = Math.max(A.capB, ...A.brit.map(b => b.bica)) || 1;
    SL.push({ t: 'Recursos', h: `<div class="ap-h"><span class="ap-n">04</span><h3>Recursos por mês</h3><p>Materiais para executar o plano e a demanda sobre a britagem (bica corrida).</p></div>
      <div class="ap-res"><div class="ap-tbl"><table><thead><tr><th>Material</th>${MESES.map((ym, i) => `<th class="n"><i class="msq" style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
        ${recs.map(([k, u, d]) => { const vs = MESES.map((_, i) => mt(k, i)); const t = vs.reduce((a, v) => a + v, 0); return `<tr><td>${esc(k.replace(' (L)', ''))}</td>${vs.map(v => `<td class="n">${v > 0.0005 ? NF[d].format(v) + ' ' + u : '–'}</td>`).join('')}<td class="n"><b>${NF[d].format(t)} ${u}</b></td></tr>`; }).join('')}</tbody></table></div>
        <div class="ap-brit"><h4>Britagem · bica corrida</h4>${A.brit.map((b, i) => `<div class="ap-bb"><span>${mesNomeS(MESES[i])}</span><span class="tr"><i style="width:${Math.min(100, b.bica / mxB * 100)}%;background:${b.bica > A.capB ? 'var(--neg)' : MCOL[i]}"></i><em style="left:${A.capB / mxB * 100}%"></em></span><b class="${b.bica > A.capB ? 'warn' : ''}">${NF[0].format(b.bica / A.capB * 100)}%</b></div>`).join('')}
        <small>Traço = capacidade de ${NF[0].format(A.capB)} t/mês (${NF[0].format(bp('rate.bica'))} t/h). Total a britar no período: ${NF[0].format(A.brit.reduce((a, b) => a + b.t, 0))} t.</small></div></div>` });
    // 6 · valores
    const mxV = Math.max(1, ...A.val.map((v, i) => v.pi + v.r + oth[i].pi + oth[i].r));
    const pavT = A.val.reduce((a, v) => a + v.pi + v.r, 0), othT = oth.reduce((a, o) => a + o.pi + o.r, 0);
    const fin = v => v ? NF[2].format(v) : '';
    SL.push({ t: 'Valores', h: `<div class="ap-h"><span class="ap-n">05</span><h3>Produção financeira prevista</h3><p>${temO ? 'Pavimentação (calculada pela simulação) e demais serviços lançados à mão' : '<b>Somente serviços de pavimentação</b> (base, sub-base, reforço, imprimação, CBUQ e ligantes), calculados pela simulação'}, a preço do contrato (PI) mais reajuste (R) do grupo.</p></div>
      <div class="ap-val"><div class="ap-cols">${A.val.map((v, i) => { const o = oth[i]; return `<div class="ap-col" title="${mesNomeS(MESES[i])}: pavimentação ${fR(v.pi)}${o.pi ? ' · demais serviços ' + fR(o.pi) : ''} · reajuste ${fR(v.r + o.r)}"><b>${mi$(v.pi + v.r + o.pi + o.r)}</b><span class="abar"><i class="r" style="height:${(v.r + o.r) / mxV * 100}%"></i>${o.pi ? `<i class="ot" style="height:${o.pi / mxV * 100}%"></i>` : ''}<i style="height:${v.pi / mxV * 100}%;background:${MCOL[i]}"></i></span><em>${mesNomeS(MESES[i])}</em></div>`; }).join('')}</div>
        <div class="ap-vt"><div class="ap-stat"><b>${mi$(vt)}</b><span>PI + R no período</span><small>pavimentação ${fR(pavT)}${temO ? ` · demais serviços ${fR(othT)}` : ''} · R ${fR(vt - vpi)}</small></div>
        <div class="ap-tbl"><table><thead><tr><th>Serviço</th><th class="n">Quantidade</th><th class="n">PI + R</th></tr></thead><tbody>${APRC.map((p, j) => { const q = A.val.reduce((a, v) => a + v.it[j].qv, 0), t = A.val.reduce((a, v) => a + v.it[j].v * (1 + v.it[j].rr), 0); return `<tr><td>${esc(p.n)}</td><td class="n">${NF[p.row >= 112 ? 1 : 0].format(q)} ${esc(M().disciplinas.flatMap(d => d.linhas).find(l => l.r === p.row)?.u || '')}</td><td class="n">${fR(t)}</td></tr>`; }).join('')}
        ${GR.map((g, gi) => { const pi = MESES.reduce((a, ym) => a + (+((OFIN[gi] || {})[ym]) || 0), 0); return pi ? `<tr class="ot"><td>${esc(g.n.charAt(0) + g.n.slice(1).toLowerCase())} <small>(manual)</small></td><td class="n">–</td><td class="n">${fR(pi * (1 + g.R))}</td></tr>` : ''; }).join('')}</tbody></table></div></div></div>
      <div class="ap-fin-act"><span class="note ap-note">Parte hachurada = reajuste (R)${temO ? ' · cinza = demais serviços lançados à mão' : ''}.${temO ? '' : ' Terraplenagem, drenagem, galerias e outros não estão incluídos.'}</span><button type="button" class="btn sm" id="ap-fin-ed">${AED ? 'Fechar lançamento' : 'Lançar demais serviços'}</button></div>
      ${AED ? `<div class="ap-fin"><p class="note">Valor a preço inicial (PI, em R$) previsto por grupo e mês. O reajuste R do grupo é aplicado automaticamente. Pavimentação e ligantes já vêm da simulação: use essas linhas só para o que estiver fora dela (ex.: regularização do subleito).</p>
        <div class="ap-tbl"><table><thead><tr><th>Grupo</th><th class="n">R</th>${MESES.map((ym, i) => `<th class="n"><i class="msq" style="background:${MCOL[i]}"></i>${mesNomeS(ym)}</th>`).join('')}</tr></thead><tbody>
        ${GR.map((g, gi) => `<tr><td>${esc(g.n)}</td><td class="n">${NF[4].format(g.R)}</td>${MESES.map(ym => `<td class="n"><input class="ap-fi" data-g="${gi}" data-ym="${ym}" inputmode="decimal" value="${fin(+((OFIN[gi] || {})[ym]) || 0)}" placeholder="0,00" aria-label="${esc(g.n)} ${mesNomeS(ym)}"></td>`).join('')}</tr>`).join('')}
        <tr class="tot"><td colspan="2">Total demais serviços (PI)</td>${oth.map(o => `<td class="n">${fR(o.pi)}</td>`).join('')}</tr></tbody></table></div>
        <button type="button" class="lnk" id="ap-fin-clr">Limpar lançamentos</button></div>` : ''}` });
    // 7 · atenção
    if (X.unlocked() && MED) SL.push({ t: 'Curva S', h: `<div class="ap-h"><span class="ap-n">06</span><h3>Curva S financeira</h3><p>Medido acumulado até a ${MED.n}ª medição e previsão até o fim do plano, a preço inicial do contrato.</p></div><div class="ap-cv">${curvaHTML(false)}</div>` });
    SL.push({ t: 'Pontos de atenção', h: `<div class="ap-h"><span class="ap-n">${X.unlocked() && MED ? '07' : '06'}</span><h3>Pontos de atenção</h3><p>Verificações automáticas do plano.</p></div>
      <div class="ap-att">${A.att.map(a => `<div class="ap-a ${a.k}"><span class="ic">${a.k === 'ok' ? '✓' : a.k === 'warn' ? '!' : 'i'}</span><div><b>${esc(a.t)}</b><p>${esc(a.d)}</p></div></div>`).join('')}</div>` });
    if (AS >= SL.length) AS = SL.length - 1;
    $('#ap-deck').innerHTML = SL.map((s, i) => `<section class="ap-slide${i === 0 ? ' cover' : ''}${i === AS ? ' on' : ''}" data-s="${i}" aria-label="${esc(s.t)}"${i === AS ? '' : ' aria-hidden="true"'}>${s.h}<span class="ap-pg">${i + 1} / ${SL.length}</span></section>`).join('');
    $('#ap-dots').innerHTML = SL.map((s, i) => `<button type="button" class="${i === AS ? 'on' : ''}" data-go="${i}" title="${esc(s.t)}" aria-label="${esc(s.t)}"></button>`).join('');
    $('#ap-tit').textContent = SL[AS].t;
    $('#ap-prev').disabled = AS === 0; $('#ap-next').disabled = AS === SL.length - 1;
  }
  function aprGo(i) { const n = $$('#ap-deck .ap-slide').length; AS = Math.max(0, Math.min(n - 1, i)); renderApr(); }
  function aprStop() { if (APLAY) { clearInterval(APLAY); APLAY = null; } }
  function aprInit() {
    const v = $('#v-apresentacao'); if (!v) return;
    $('#ap-prev').onclick = () => aprGo(AS - 1); $('#ap-next').onclick = () => aprGo(AS + 1);
    $('#ap-dots').addEventListener('click', ev => { const b = ev.target.closest('[data-go]'); if (b) aprGo(+b.dataset.go); });
    $('#ap-deck').addEventListener('click', ev => {
      const m = ev.target.closest('[data-am]'); if (m) { aprStop(); AM = +m.dataset.am; renderApr(); return; }
      if (ev.target.closest('#ap-fin-ed')) { AED = !AED; renderApr(); return; }
      if (ev.target.closest('#ap-fin-clr')) { if (confirm('Apagar todos os valores lançados à mão?')) { OFIN = {}; store.set('aprFin', OFIN); renderApr(); } return; }
      if (ev.target.closest('#ap-play')) { if (APLAY) { aprStop(); renderApr(); return; } AM = 0; renderApr(); APLAY = setInterval(() => { if (X.current() !== 'apresentacao' || AM >= MESES.length - 1) { aprStop(); renderApr(); return; } AM++; renderApr(); }, 1300); renderApr(); }
    });
    $('#ap-deck').addEventListener('change', ev => { const t = ev.target.closest('.ap-fi'); if (!t) return; const v = parseFloat(String(t.value).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')); const g = t.dataset.g;
      OFIN[g] = { ...(OFIN[g] || {}) }; if (Number.isFinite(v) && v > 0) OFIN[g][t.dataset.ym] = v; else delete OFIN[g][t.dataset.ym]; store.set('aprFin', OFIN); renderApr(); });
    $('#ap-full').onclick = () => { const el = $('#v-apresentacao'); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => { }); };
    document.addEventListener('fullscreenchange', () => { $('#ap-full').textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'; v.classList.toggle('fs', !!document.fullscreenElement); });
    document.addEventListener('keydown', ev => { if (X.current() !== 'apresentacao' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') { ev.preventDefault(); aprGo(AS + 1); } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); aprGo(AS - 1); } else if (ev.key === 'Home') aprGo(0); else if (ev.key === 'End') aprGo(99); });
    let tx = null; $('#ap-deck').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    $('#ap-deck').addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 60 && !e.target.closest('.ap-mes, .ap-tbl, .ap-dg')) aprGo(AS + (dx < 0 ? 1 : -1)); }, { passive: true });
  }

  // ===================================================================== IMPORTAR PLANILHAS (retigráfico, estudo de britagem)
  function impShow(title, html, onApply, label = 'Aplicar') {
    const d = $('#imp-dlg'); $('#imp-tit').textContent = title; $('#imp-body').innerHTML = html; $('#imp-go').textContent = label; d.hidden = false;
    $('#imp-go').onclick = () => { d.hidden = true; onApply(); }; $('#imp-x').onclick = () => { d.hidden = true; };
  }
  const km2 = m => NF[2].format(m / 1000) + ' km';
  const dlt = (a, b, f) => { const d = b - a; return Math.abs(d) < 1e-9 ? '<span class="note">=</span>' : `<b class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${f(Math.abs(d))}</b>`; };
  async function impRetig(file) {
    if (!AV) avLoad(); $('#a-tip').textContent = 'Lendo ' + file.name + '…';
    try {
      const N = await parseRetigrafico(await file.arrayBuffer(), { drenagem: BASE().sheets['Drenagem pontual'] || [], travas: AV.travas || [], oacFix: D.avanco.oacFix || [], oae: AV.oae || D.avanco.oae || [] });
      const extra = AV.frentes.filter(f => !N.frentes.some(x => x.id === f.id));
      const rows = N.frentes.map(f => { const o = AV.frentes.find(x => x.id === f.id); const a = o ? avStats(o.c) : { 2: 0, 1: 0 }, b = avStats(f.c); return `<tr><td>${esc(f.n)}</td><td class="n">${km2(a['2'])}</td><td class="n">${km2(b['2'])}</td><td class="n">${dlt(a['2'], b['2'], km2)}</td><td class="n">${f.a ? km2(b['1']) : '–'}</td></tr>`; }).join('');
      const och = N.oac.map(o => ({ o, p: AV.oac.find(x => Math.abs(x.e - o.e) < 0.6) })).filter(x => !x.p || x.p.st !== x.o.st);
      const sumi = AV.oac.filter(p => !N.oac.some(o => Math.abs(o.e - p.e) < 0.6));
      const old = N.data < AV.data;
      impShow('Atualizar o retigráfico', `<p><b>${esc(file.name)}</b> · atualização de <b>${N.data.split('-').reverse().join('/')}</b> (hoje no app: ${AV.data.split('-').reverse().join('/')})</p>
        ${old ? '<p class="warn">Atenção: esta planilha é mais antiga que o retigráfico atual.</p>' : ''}
        <div class="tbl-wrap"><table class="itbl"><thead><tr><th>Frente</th><th class="n">Concluído antes</th><th class="n">Agora</th><th class="n">Diferença</th><th class="n">Em execução</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p><b>OAC:</b> ${N.oac.length} na planilha · ${och.length ? och.map(x => `${esc(x.o.t)} (est. ${estStr(x.o.e)}): ${x.p ? oacName(x.p.st) + ' → ' : 'novo, '}${oacName(x.o.st)}`).join(' · ') : 'sem mudança de situação'}${sumi.length ? ` · não aparecem mais: ${sumi.map(p => esc(p.t) + ' (est. ' + estStr(p.e) + ')').join(', ')}` : ''}</p>
        <p class="note">Travas e correções de OAC continuam valendo${extra.length ? `; as frentes criadas no app (${extra.map(f => esc(f.n)).join(', ')}) são mantidas` : ''}. Depois de aplicar, publique a versão mestra para todos receberem.</p>`,
        () => { AV = { ...N, frentes: [...N.frentes, ...extra], v: 2, atualizado: today(), ts: Date.now(), fixRev: D.avanco.fixRev || 0 }; LK = null; avSave(); renderAv(); $('#a-tip').textContent = `Retigráfico de ${N.data.split('-').reverse().join('/')} aplicado. Publique a versão mestra (botão Mestra no topo) para todos receberem.`; });
      $('#a-tip').textContent = '';
    } catch (e) { $('#a-tip').textContent = 'Não foi possível ler a planilha: ' + e.message; }
  }
  async function impBrit(file) {
    const tip = $('#b-imp-msg'); tip.textContent = 'Lendo ' + file.name + '…';
    try {
      const N = await parseBritagem(await file.arrayBuffer(), file.name); const O = BB();
      const L = [['Densidade bica (t/m³)', 'dens.bica', 2], ['Densidade BGS (t/m³)', 'dens.bgs', 2], ['Densidade brita p/ dreno', 'dens.dreno', 2], ['Densidade concreto', 'dens.conc', 2],
        ['Bica corrida (t/h)', 'rate.bica', 0], ['Brita 01 (t/h)', 'rate.b1', 0], ['Pedrisco (t/h)', 'rate.ped', 0], ['Pó (t/h)', 'rate.po', 0], ['Rebritagem: turnos', 'reb.t', 0], ['Rebritagem: dias/mês', 'reb.d', 0], ['Rendimento', 'rend', 2],
        ['Capacidade de furação (m/mês)', 'rocha.furCap', 0], ['Furos em estoque', 'rocha.furos', 0], ['Saldo de dreno (m³)', 'reb515.dreno', 1], ['Saldo de concreto (m³)', 'reb515.conc', 1]];
      const g = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
      const ch = L.filter(([, p]) => Math.abs((+g(N, p) || 0) - (+g(O, p) || 0)) > 1e-9);
      const ov = Object.keys(BPO).filter(k => BPO[k] !== null && BPO[k] !== undefined).length;
      impShow('Atualizar o estudo de britagem', `<p><b>${esc(file.name)}</b>${N.data ? ` · início da britagem ${N.data.split('-').reverse().join('/')}` : ''}</p>
        ${ch.length ? `<div class="tbl-wrap"><table class="itbl"><thead><tr><th>Parâmetro</th><th class="n">Antes</th><th class="n">Novo</th></tr></thead><tbody>${ch.map(([n, p, d]) => `<tr><td>${esc(n)}</td><td class="n">${NF[d].format(+g(O, p) || 0)}</td><td class="n"><b>${NF[d].format(+g(N, p) || 0)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum parâmetro principal mudou.</p>'}
        ${ov ? `<label class="chk"><input type="checkbox" id="imp-clr" checked> Descartar os ${ov} ajuste${ov > 1 ? 's' : ''} manual${ov > 1 ? 'is' : ''} feitos no app (para valer o estudo novo)</label>` : ''}`,
        () => { if ($('#imp-clr') && $('#imp-clr').checked) { BPO = {}; store.set('britPar', BPO); } BBASE = N; store.set('britBase', N); renderBrit(); tip.textContent = 'Estudo aplicado.' + (X.unlocked() ? ' Publique a versão mestra para todos receberem.' : ''); });
      tip.textContent = '';
    } catch (e) { tip.textContent = 'Não foi possível ler a planilha: ' + e.message; }
  }

  // ===================================================================== CURVA S FINANCEIRA (área restrita)
  // Realizado: valor medido (PI) por medição – a última pela própria medição, as anteriores distribuídas pelas memórias de
  // cálculo (aproximação) ou informadas à mão. Projeção: meses ainda sem medição (informados) + plano da Simulação + demais serviços.
  let CVH = store.get('curvaHist', null), CVG = store.get('curvaGap', null);
  const cvH = () => CVH || (D.prot && D.prot.curvaHist) || {}, cvG = () => CVG || (D.prot && D.prot.curvaGap) || {};
  const MESX = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  function medMes(m) {
    const o = m.oficial && /(\d{2})\/(\d{2})\/(\d{4}) a/.exec(m.oficial.periodo || ''); if (o) return `${o[3]}-${o[2]}`;
    const t = (m.arquivo || m.nome || '').toLowerCase(); const mm = /(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\W{0,4}(\d{4})/.exec(t);
    return mm ? `${mm[2]}-${String(MESX[mm[1]]).padStart(2, '0')}` : null;
  }
  function curvaData() {
    if (!MED) return null; const m = MED, N = m.n || 1;
    const tot = m.itens.reduce((s, i) => s + i.q * i.p, 0), acum = m.itens.reduce((s, i) => s + i.acum * i.p, 0), liq = m.itens.reduce((s, i) => s + i.liq * i.p, 0), ant = acum - liq;
    const mem = {}; for (const it of m.itens) for (const r of it.r) if (r[4] >= 1 && r[4] < N) mem[r[4]] = (mem[r[4]] || 0) + Math.max(0, r[3] * it.p);
    const H = cvH(); const known = Object.entries(H).filter(([n]) => +n < N).reduce((s, [, v]) => s + v, 0); const rem = Math.max(0, ant - known);
    const apx = []; for (let n = 1; n < N; n++) if (H[n] === undefined) apx.push(n); const memA = apx.reduce((s, n) => s + (mem[n] || 0), 0);
    const mN = medMes(m) || ymNow(); const ym0 = ymAdd(mN, -(N - 1));
    const hist = []; for (let n = 1; n <= N; n++) { const inf = H[n] !== undefined; const v = n === N ? (inf ? H[n] : liq) : inf ? H[n] : (memA ? (mem[n] || 0) / memA * rem : rem / Math.max(1, apx.length)); hist.push({ n, ym: ymAdd(ym0, n - 1), v, src: inf ? 'informado' : n === N ? 'medição' : 'aproximado' }); }
    const G = cvG(); const gap = []; const p0 = MESES[0]; for (let y = ymNext(mN); ymCmp(y, p0) < 0 && gap.length < 24; y = ymNext(y)) gap.push({ ym: y, v: +G[y] || 0 });
    const A = aprData(); const GR = X.reajG ? X.reajG() : [];
    const plan = MESES.map((ym, i) => { let o = 0; GR.forEach((g, gi) => { o += +((OFIN[gi] || {})[ym]) || 0; }); return { ym, i, pav: A.val[i].pi, out: o, v: A.val[i].pi + o }; });
    const real = hist.reduce((s, h) => s + h.v, 0);
    return { m, N, tot, acum: real, liq, reaj: m.oficial && m.oficial.reajAcum, hist, gap, plan, mN, apx: apx.length };
  }
  function curvaSVG(Cd, big) {
    const pts = [...Cd.hist.map(h => ({ ym: h.ym, v: h.v, k: 'r' })), ...Cd.gap.map(g => ({ ym: g.ym, v: g.v, k: 'g' })), ...Cd.plan.map(p => ({ ym: p.ym, v: p.v, k: 'p', i: p.i }))];
    let c = 0; pts.forEach(p => { c += p.v; p.c = c; });
    const W = 960, H = big ? 360 : 320, pl = 64, pr = 150, pt = 18, pb = 34; const n = pts.length; const bw = (W - pl - pr) / n;
    const ymax = Math.max(Cd.tot, c) * 1.06, mmax = Math.max(1, ...pts.map(p => p.v));
    const xs = i => pl + (i + .5) * bw, ys = v => pt + (1 - v / ymax) * (H - pt - pb), yb = v => (v / mmax) * (H - pt - pb) * .32;
    const lastR = pts.filter(p => p.k === 'r').length - 1;
    const tick = Math.max(1, Math.ceil(n / 14));
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = ymax / 1.06 * k / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}" class="gr"/><text x="${pl - 6}" y="${ys(v) + 4}" class="yt">${NF[0].format(v / 1e6)}</text>`; }
    g += `<text x="${pl - 6}" y="${pt - 6}" class="yt">R$ mi</text>`;
    pts.forEach((p, i) => { const h = yb(p.v); g += `<rect x="${xs(i) - bw * .32}" y="${H - pb - h}" width="${bw * .64}" height="${h}" class="b ${p.k}"${p.k === 'p' ? ` fill="${MCOL[p.i]}"` : ''}><title>${mesNomeS(p.ym)}: ${fR(p.v)}</title></rect>`;
      if (i % tick === 0 || p.k === 'p') g += `<text x="${xs(i)}" y="${H - 12}" class="xt" text-anchor="middle">${mesNomeS(p.ym)}</text>`; });
    g += `<line x1="${pl}" x2="${W - pr}" y1="${ys(Cd.tot)}" y2="${ys(Cd.tot)}" class="ct"/><text x="${W - pr + 6}" y="${ys(Cd.tot) + 4}" class="cl">Contrato ${mi$(Cd.tot)}</text>`;
    const pr_ = pts.slice(0, lastR + 1).map((p, i) => `${xs(i).toFixed(1)},${ys(p.c).toFixed(1)}`).join(' ');
    const pp = pts.slice(lastR).map((p, j) => `${xs(lastR + j).toFixed(1)},${ys(p.c).toFixed(1)}`).join(' ');
    g += `<polyline points="${pr_}" class="lr"/>${n > lastR + 1 ? `<polyline points="${pp}" class="lp"/>` : ''}`;
    pts.forEach((p, i) => { g += `<circle cx="${xs(i)}" cy="${ys(p.c)}" r="${p.k === 'r' ? 2.5 : 3.5}" class="${p.k === 'r' ? 'cr' : 'cp'}"><title>${mesNomeS(p.ym)} – acumulado ${fR(p.c)} (${fPc(p.c / Cd.tot)})</title></circle>`; });
    const lr = pts[lastR]; g += `<text x="${xs(lastR) - 6}" y="${ys(lr.c) - 10}" class="vl" text-anchor="end">${mi$(lr.c)} · ${fPc(lr.c / Cd.tot)}</text>`;
    if (n > lastR + 1) { const le = pts[n - 1]; g += `<text x="${xs(n - 1) + 8}" y="${ys(le.c) + 4}" class="vl vp">${mi$(le.c)} · ${fPc(le.c / Cd.tot)}</text>`; }
    const iNow = pts.findIndex(p => p.ym === ymNow()); if (iNow >= 0) g += `<line x1="${xs(iNow)}" x2="${xs(iNow)}" y1="${pt}" y2="${H - pb}" class="hj"/><text x="${xs(iNow) + 4}" y="${pt + 10}" class="hjt">hoje</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="cv-svg" role="img" aria-label="Curva S financeira: medido acumulado e projeção">${g}</svg>`;
  }
  function curvaHTML(edit) {
    const Cd = curvaData(); if (!Cd) return '<p class="note">Sem medição carregada.</p>';
    const fim = Cd.acum + Cd.gap.reduce((s, g) => s + g.v, 0) + Cd.plan.reduce((s, p) => s + p.v, 0);
    const k = (l, v, s) => `<div class="cv-k"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
    let h = `<div class="cv-kpis">${k('Medido acumulado (PI)', mi$(Cd.acum), `${fPc(Cd.acum / Cd.tot)} do contrato · até a ${Cd.N}ª medição (${mesNomeS(Cd.mN)})`)}${Cd.reaj ? k('Reajuste acumulado', mi$(Cd.reaj), `PI + R: ${mi$(Cd.acum + Cd.reaj)}`) : ''}${k(`Previsto até ${mesNomeS(MESES[MESES.length - 1])}`, mi$(fim), `${fPc(fim / Cd.tot)} do contrato`)}${k('Saldo após o plano', mi$(Cd.tot - fim), `de ${mi$(Cd.tot)} do contrato (PI)`)}</div>
      <div class="cv-sc">${curvaSVG(Cd, !edit)}</div>
      <div class="ap-leg cv-leg"><span><i class="lr"></i>medido acumulado</span><span><i class="lp"></i>previsto acumulado</span><span><i class="br"></i>medido no mês</span>${Cd.gap.length ? '<span><i class="bg"></i>meses ainda sem medição (informados)</span>' : ''}<span><i style="background:${MCOL[0]}"></i>plano da Simulação + demais serviços</span><span><i class="ct"></i>valor do contrato</span></div>
      <p class="note">${Cd.apx ? `Valores das medições anteriores à ${Cd.N}ª: ${Cd.apx} aproximados pela distribuição das memórias de cálculo, ajustados ao acumulado oficial. ` : ''}Projeção a preço inicial (PI): pavimentação pela Simulação e demais serviços lançados na Apresentação${Cd.gap.length ? '; meses sem medição conforme informado abaixo' : ''}.</p>`;
    if (edit) h += `<details class="cv-ed"><summary>Editar valores por medição e meses sem medição</summary><div class="cv-grid">
        ${Cd.hist.map(x => `<label class="lbl"><span>${x.n}ª · ${mesNomeS(x.ym)} <small class="${x.src === 'informado' ? 'inf' : ''}">${x.src}</small></span><input class="cv-in" data-n="${x.n}" inputmode="decimal" value="${NF[2].format(x.v)}"></label>`).join('')}
        ${Cd.gap.map(x => `<label class="lbl"><span>${mesNomeS(x.ym)} <small>previsto</small></span><input class="cv-gap" data-ym="${x.ym}" inputmode="decimal" value="${x.v ? NF[2].format(x.v) : ''}" placeholder="0,00"></label>`).join('')}
      </div><button type="button" class="lnk" id="cv-reset">Voltar aos valores aproximados</button></details>`;
    return h;
  }
  function curvaBind(host) {
    host.addEventListener('change', ev => { const t = ev.target; const v = parseFloat(String(t.value).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
      if (t.classList.contains('cv-in')) { CVH = { ...cvH() }; if (Number.isFinite(v) && v >= 0) CVH[t.dataset.n] = v; else delete CVH[t.dataset.n]; store.set('curvaHist', CVH); renderMedCurva(); }
      if (t.classList.contains('cv-gap')) { CVG = { ...cvG() }; if (Number.isFinite(v) && v > 0) CVG[t.dataset.ym] = v; else delete CVG[t.dataset.ym]; store.set('curvaGap', CVG); renderMedCurva(); } });
    host.addEventListener('click', ev => { if (ev.target.id === 'cv-reset') { CVH = {}; store.set('curvaHist', CVH); renderMedCurva(); } });
  }
  function renderMedCurva() { const h = $('#m-curva'); if (!h || !MED) return; const op = h.querySelector('details.cv-ed')?.open; h.innerHTML = curvaHTML(true); if (op) h.querySelector('details.cv-ed').open = true; }
  // dados restritos que vão (criptografados) na versão mestra
  function protPayload() { const ship = D.medShip || D.medicao; const p = D.prot || {};
    return { medicao: MED && MED !== ship && (MED.n || 0) >= (ship.n || 0) ? MED : p.medicao || null, curvaHist: cvH(), curvaGap: cvG() }; }

  // ===================================================================== PLANEJAMENTO DO CONTRATO (oculto, com a senha)
  // Saldo de cada item do contrato (contrato − medido) ÷ produção da equipe na CPU do contrato = horas de equipe.
  // Os itens formam pacotes de serviço com a sequência executiva das especificações de serviço (camadas uma após a outra,
  // cura da imprimação antes do CBUQ, sinalização definitiva após o CBUQ…) e um calendário de dias trabalháveis
  // (domingos, feriados nacionais, sábados, chuva e frio por mês). Resultado: cronograma, caminho crítico, término × prazo e valores por mês.
  const PGL = [[17, 'TERRA'], [53, 'PAV'], [66, 'LIG'], [71, 'DREN'], [143, 'GRAMP'], [151, 'PONTE'], [183, 'CONT'], [192, 'GAL'], [201, 'PASSA'], [221, 'COMPL'], [259, 'SIN'], [280, 'SINPROV'], [291, 'AMB'], [300, 'ILUM'], [325, 'INTERF'], [338, 'MOB']];
  const pgIdx = l => { let i = 0; PGL.forEach(([a], j) => { if (l >= a) i = j; }); return i; };
  // pacotes: família (cor), sensível a chuva, asfalto (frio), operários por equipe, equipes, dependências [pacote, tipo, defasagem em dias (parâmetro)]
  const PKG = [
    { id: 'interf', n: 'Interferências', f: 'g', ch: 0, eq: 1, op: 6, dep: [] },
    { id: 'terra', n: 'Terraplenagem', f: 't', ch: 1, eq: 2, op: 8, dep: [] },
    { id: 'oac', n: 'Bueiros (OAC)', f: 'd', ch: .5, eq: 2, op: 8, dep: [['terra', 'SS', 'lagOac']] },
    { id: 'gal', n: 'Galerias e passa-fauna', f: 'd', ch: .5, eq: 1, op: 10, dep: [['terra', 'SS', 'lagOac']] },
    { id: 'dreno', n: 'Drenos', f: 'd', ch: .5, eq: 2, op: 8, dep: [['terra', 'SS', 'lagDreno']] },
    { id: 'cont', n: 'Contenções e grampeamento', f: 'o', ch: .5, eq: 1, op: 8, dep: [] },
    { id: 'ponte', n: 'OAE – ponte', f: 'o', ch: .5, eq: 1, op: 10, dep: [] },
    { id: 'reg', n: 'Regularização do subleito', f: 'p', ch: 1, eq: 1, op: 6, dep: [['terra', 'SS', 'lagReg'], ['terra', 'FF', 'lagCam'], ['oac', 'FF', 'lagCam']] },
    { id: 'bica', n: 'Reforço e sub-base', f: 'p', ch: 1, eq: 1, op: 8, dep: [['reg', 'SS', 'lagCam'], ['reg', 'FF', 'lagCam'], ['dreno', 'FF', 'lagCam']] },
    { id: 'bgs', n: 'Base – BGS', f: 'p', ch: 1, eq: 1, op: 8, dep: [['bica', 'SS', 'lagCam'], ['bica', 'FF', 'lagCam']] },
    { id: 'imp', n: 'Imprimação', f: 'a', ch: 1, as: 1, eq: 1, op: 4, dep: [['bgs', 'SS', 'lagCam'], ['bgs', 'FF', 'lagCam']] },
    { id: 'cbuq', n: 'CBUQ e pintura de ligação', f: 'a', ch: 1, as: 1, eq: 1, op: 10, dep: [['imp', 'SS', 'lagCura'], ['imp', 'FF', 'lagCura']] },
    { id: 'drensup', n: 'Drenagem superficial', f: 'd', ch: .5, eq: 3, op: 8, dep: [['terra', 'SS', 'lagSup'], ['cbuq', 'FF', 'lagFim']] },
    { id: 'ilum', n: 'Iluminação', f: 'o', ch: .3, eq: 1, op: 6, dep: [['bgs', 'SS', 'lag0'], ['cbuq', 'FF', 'lagFim']] },
    { id: 'sinal', n: 'Sinalização definitiva', f: 's', ch: .7, eq: 1, op: 6, dep: [['cbuq', 'SS', 'lagSin'], ['cbuq', 'FF', 'lagSin']] },
    { id: 'compl', n: 'Serviços complementares', f: 'o', ch: .5, eq: 2, op: 8, dep: [['terra', 'SS', 'lag0'], ['cbuq', 'FF', 'lagFim']] },
    { id: 'amb', n: 'Melhorias ambientais', f: 'o', ch: .3, eq: 1, op: 6, dep: [['terra', 'SS', 'lagAmb'], ['terra', 'FF', 'lagAmb']] },
    { id: 'sinprov', n: 'Sinalização provisória', f: 's', span: 1, dep: [] },
    { id: 'mob', n: 'Desmobilização', f: 'g', end: 1, dep: [] },
  ];
  const PCOL = { t: '#b8860b', d: '#2a78d6', p: '#7a6a4f', a: '#1d2226', s: '#e8a400', o: '#6250d6', g: '#8a949c' };
  const PPD = { v: 2, ini: '2024-08-01', fim: '2026-08-01', base: 'total', hDia: 8.8, sab: 0.5, cura: 3, lagCam: 7, lagCura: 3, lagSin: 15, lagReg: 30, lagOac: 0, lagDreno: 15, lagSup: 30, lagAmb: 45, lagFim: 15, lag0: 0, desmob: 20, durSem: 60,
    chuva: [35, 30, 25, 15, 15, 15, 10, 10, 20, 25, 25, 30], frio: [0, 0, 0, 0, 10, 20, 25, 15, 0, 0, 0, 0], eq: {}, op: {} };
  const ppLoad = () => { const o = store.get('planPar', {}); if (o.v !== 2) { delete o.ini; delete o.fim; delete o.base; o.v = 2; } return Object.assign(JSON.parse(JSON.stringify(PPD)), o); };
  let PP = ppLoad();
  const ppSave = () => store.set('planPar', PP);
  const iso = d => d.toISOString().slice(0, 10), dOf = s => new Date(s + 'T12:00:00Z'), addD = (d, n) => new Date(d.getTime() + n * 864e5);
  const fD = s => s ? s.split('-').reverse().join('/') : '–';
  function feriados(y) {   // feriados nacionais (fixos + Carnaval, Sexta-feira Santa e Corpus Christi pela Páscoa)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1; const P = new Date(Date.UTC(y, mes - 1, dia, 12));
    return new Set([...['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(x => `${y}-${x}`), ...[-48, -47, -2, 60].map(n => iso(addD(P, n)))]);
  }
  const FER = {}; const isFer = s => { const y = +s.slice(0, 4); return (FER[y] ||= feriados(y)).has(s); };
  function dayF(d, pk) {   // fração trabalhável do dia para o pacote
    const s = iso(d), wd = d.getUTCDay(); if (wd === 0 || isFer(s)) return 0; let f = wd === 6 ? +PP.sab : 1; const mo = d.getUTCMonth();
    if (pk.ch) f *= 1 - pk.ch * (+PP.chuva[mo] || 0) / 100; if (pk.as) f *= 1 - (+PP.frio[mo] || 0) / 100; return Math.max(0, f);
  }
  function planItens() {   // itens do contrato com saldo, pacote e produção por equipe
    const C = M().contrato || []; if (!C.length || !MED) return null;
    const ac = {}; for (const it of MED.itens) ac[it.l] = (ac[it.l] || 0) + it.acum;
    const I = INS() || {}; const PR = I.prod || {}, CO = I.consumos || {};
    // pavimento pelo retigráfico (até a estaca final da britagem, fora das travas)
    let rq = null;
    if (PP.base === 'ret__') { if (!AV) avLoad(); const R = bRest(); const Q = cellQ(); const lim = bLim(); const rem = (id, col) => { const f = AV.frentes.find(x => x.id === id); let q = 0; for (let k = 0; k < Math.min(NC, lim); k++) if (!isLk(k) && !(f && f.c[k] === '2')) q += Q[col][k]; return q; };
      const imp = rem('p6', 'Imprimação EAI (m²)'), cb = rem('p7', 'CBUQ (t)'), rr = rem('p7', 'Pintura RR-1C (m²)');
      rq = { '530200': R.ref1.vol + R.ref2.vol + R.sub.vol, '531100': R.base.vol, '560100': imp, '570400': cb, '561100': rr, '589000': cb * par('cap'), '589190': imp * par('eai') / 1000, '589420': rr * par('rr') / 1000 }; }
    const GR = X.reajG ? X.reajG() : [];
    return C.map(c => {
      const g = PGL[pgIdx(c.linha)][1], cod = String(c.codigo), sv = c.servico || '';
      let pk = { TERRA: 'terra', GRAMP: 'cont', CONT: 'cont', PONTE: 'ponte', GAL: 'gal', PASSA: 'gal', COMPL: 'compl', SIN: 'sinal', SINPROV: 'sinprov', AMB: 'amb', ILUM: 'ilum', INTERF: 'interf', MOB: 'mob' }[g];
      if (g === 'PAV') pk = { '530200': 'bica', '531100': 'bgs', '560100': 'imp', '570400': 'cbuq', '561100': 'cbuq', '575000': 'cbuq' }[cod] || 'reg';
      if (g === 'LIG') pk = cod === '589190' ? 'imp' : 'cbuq';
      if (g === 'DREN') pk = /bueiro|BSTC|BDTC|BTTC|BSCC|corpo de|boca de b|escoramento|meia cana/i.test(sv) ? 'oac' : /dreno|talvegue|PEAD|geot[eê]xtil|brita para dreno|valas de drenagem/i.test(sv) ? 'dreno' : /gabi[aã]o/i.test(sv) ? 'cont' : 'drensup';
      const pkg = PKG.find(p => p.id === pk);
      const tot = PP.base === 'total'; const saldoC = tot ? c.qtd : Math.max(0, c.qtd - (ac[c.linha] || 0));
      const saldo = rq && rq[cod] !== undefined && (g === 'PAV' || g === 'LIG') ? Math.max(0, rq[cod]) : saldoC;
      const pr = +PR[cod] || 0; const mo = (CO[cod] || []).filter(r => r[0] === 'Mão de obra').reduce((s, r) => s + r[4], 0); const eqh = Math.max(0, ...(CO[cod] || []).filter(r => r[0] === 'Equipamento').map(r => r[4]));
      const op = +(PP.op[pk] ?? pkg.op ?? 8);
      const rate = pr > 1.0001 ? pr : mo > 0 ? op / mo : eqh > 0 ? 1 / eqh : 0;   // un/h por equipe
      const gi = pgIdx(c.linha); const R = GR[gi] ? GR[gi].R : 0;
      return { ...c, g, pk, saldo, saldoC, rate, h: rate ? saldo / rate : 0, v: saldo * c.preco, R, fonteRate: pr > 1.0001 ? 'produção da CPU' : mo > 0 ? `${op} operários ÷ ${NF[3].format(mo)} h/un` : eqh ? 'equipamento da CPU' : 'acompanha o pacote' };
    });
  }
  function planRun(k = 1) {
    const IT = planItens(); if (!IT) return null;
    const st = PP.base === 'total' ? dOf(PP.ini) : dOf(PP.status || today()); const P = {};
    for (const p of PKG) { const its = IT.filter(i => i.pk === p.id); P[p.id] = { ...p, its, W: its.reduce((s, i) => s + i.h, 0), v: its.reduce((s, i) => s + i.v, 0), vR: its.reduce((s, i) => s + i.v * i.R, 0), eqn: +(PP.eq[p.id] ?? p.eq ?? 1) * k,
      tot: its.reduce((s, i) => s + i.qtd * i.preco, 0), done: its.reduce((s, i) => s + Math.max(0, i.qtd - i.saldoC) * i.preco, 0) }; }
    const lagOf = key => +(PP[key] ?? 0);
    const order = []; const seen = new Set(); const visit = id => { if (seen.has(id)) return; seen.add(id); for (const [d] of P[id].dep) visit(d); order.push(id); }; PKG.forEach(p => visit(p.id));
    for (const id of order) { const p = P[id]; if (p.span || p.end) continue;
      let S = st, why = PP.base === 'total' ? 'início do contrato' : 'data de status'; for (const [d, t, l] of p.dep) if (t === 'SS' && P[d].S) { const c = addD(P[d].S, lagOf(l)); if (c > S) { S = c; why = `${t} ${P[d].n} + ${lagOf(l)} d`; } }
      let F = S, w = 0, guard = 0; const cap = PP.hDia * p.eqn;
      if (p.W > 1e-9) { while (w < p.W && guard++ < 4000) { w += cap * dayF(F, p); F = addD(F, 1); } } 
      let whyF = 'produção'; for (const [d, t, l] of p.dep) if (t === 'FF' && P[d].F) { const c = addD(P[d].F, lagOf(l)); if (c > F && p.W > 1e-9) { F = c; whyF = `${t} ${P[d].n} + ${lagOf(l)} d`; } }
      if (p.W <= 1e-9 && p.v <= 0.5) { p.S = null; p.F = null; continue; }
      if (p.W <= 1e-9) { F = addD(S, +PP.durSem); whyF = 'sem produção na CPU: duração padrão'; for (const [d, t, l] of p.dep) if (t === 'FF' && P[d].F) { const c = addD(P[d].F, lagOf(l)); if (c > F) { F = c; whyF = `${t} ${P[d].n} + ${lagOf(l)} d`; } } }
      Object.assign(p, { S, F, why, whyF, dur: Math.round((F - S) / 864e5) });
    }
    const fins = Object.values(P).filter(p => p.F); let end = fins.length ? new Date(Math.max(...fins.map(p => p.F))) : st;
    const mob = P.mob; if (mob.v > 0.5) { mob.S = end; mob.F = addD(end, +PP.desmob); end = mob.F; mob.why = 'fim dos serviços'; }
    const sp = P.sinprov; if (sp.v > 0.5) { sp.S = st; sp.F = end; sp.why = 'todo o período'; }
    // caminho crítico: volta pelas restrições que definiram término e início
    const crit = new Set(); let cur = fins.sort((a, b) => b.F - a.F)[0]; let gd = 0;
    while (cur && gd++ < 30) { crit.add(cur.id); const m = /^(SS|FF) (.+) \+/.exec(cur.whyF !== 'produção' ? cur.whyF : cur.why); cur = m ? Object.values(P).find(q => q.n === m[2]) : null; }
    return { P, st, end, IT, crit };
  }
  function planMonths(R) {   // PI e R por mês, distribuídos pelos dias trabalháveis de cada pacote
    const mm = {};
    for (const p of Object.values(R.P)) { if (!p.S || p.v <= 0) continue; let tot = 0; const days = [];
      for (let d = p.S; d <= p.F; d = addD(d, 1)) { const f = p.end || p.span ? 1 : dayF(d, p); if (f > 0) { days.push([d, f]); tot += f; } }
      if (!tot) { const ym = iso(p.S).slice(0, 7); (mm[ym] ||= { pi: 0, r: 0, by: {} }); mm[ym].pi += p.v; mm[ym].r += p.vR; continue; }
      for (const [d, f] of days) { const ym = iso(d).slice(0, 7); (mm[ym] ||= { pi: 0, r: 0, by: {} }); mm[ym].pi += p.v * f / tot; mm[ym].r += p.vR * f / tot; mm[ym].by[p.id] = (mm[ym].by[p.id] || 0) + p.v * f / tot; } }
    return Object.keys(mm).sort().map(ym => ({ ym, ...mm[ym] }));
  }
  function planFactor() {   // multiplicador de equipes para terminar no prazo contratual
    const lim = dOf(PP.fim); const e = k => planRun(k).end; if (e(1) <= lim) return { ok: true };
    if (e(8) > lim) return { ok: false, imp: true }; let a = 1, b = 8; for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (e(m) <= lim) b = m; else a = m; } return { ok: false, k: b };
  }
  function renderPlan() {
    const host = $('#pl-body'); if (!host) return;
    if (!X.unlocked()) { host.innerHTML = '<p class="note">Aba restrita.</p>'; return; }
    const R = planRun(); if (!R) { host.innerHTML = '<p class="note">Carregando contrato e medição…</p>'; return; }
    const pf = planFactor(); const ini = dOf(PP.ini), fim = dOf(PP.fim);
    const folga = Math.round((fim - R.end) / 864e5); const ps = Object.values(R.P).filter(p => p.S);
    const saldo = ps.reduce((s, p) => s + p.v, 0), saldoR = ps.reduce((s, p) => s + p.vR, 0);
    const tot = Object.values(R.P).reduce((s, p) => s + p.tot, 0), done = Object.values(R.P).reduce((s, p) => s + p.done, 0);
    const prazoTot = Math.round((fim - ini) / 864e5), dec = Math.round((R.st - ini) / 864e5);
    $('#pl-hero').innerHTML = `<div><span>Término previsto</span><b class="${folga < 0 ? 'late' : ''}">${fD(iso(R.end))}</b></div><div><span>Prazo contratual</span><b>${fD(PP.fim)}</b></div><div><span>${folga < 0 ? 'Atraso' : 'Folga'}</span><b class="${folga < 0 ? 'late' : ''}">${Math.abs(folga)} dias</b></div><div><span>${PP.base === 'total' ? 'Valor do contrato (PI)' : 'Saldo a executar (PI)'}</span><b>${mi$(saldo)}</b></div>`;
    const K = (l, v, s, c) => `<div class="cv-k${c ? ' ' + c : ''}"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
    const months = planMonths(R); const pico = Math.max(0, ...months.map(m => m.pi));
    const TT = PP.base === 'total'; const pzM = Math.round(prazoTot / 30.44); const durM = Math.round((R.end - R.st) / 864e5 / 30.44);
    $('#pl-kpis').innerHTML = [TT ? K('Prazo do contrato', `${pzM} meses`, `${prazoTot} dias · ${fD(PP.ini)} a ${fD(PP.fim)}`) : K('Prazo decorrido', fPc(dec / prazoTot), `${dec} de ${prazoTot} dias (${fD(PP.ini)} a ${fD(PP.fim)})`), TT ? K('Duração simulada', `${durM} meses`, `contrato inteiro: ${mi$(saldo)} (PI) + R ${mi$(saldoR)}`) : K('Executado (medido, PI)', fPc(done / tot), `${mi$(done)} de ${mi$(tot)}`),
      K('Para cumprir o prazo', pf.ok ? 'no prazo' : pf.imp ? 'inviável' : `${NF[1].format(pf.k)}× equipes`, pf.ok ? 'com as equipes informadas' : pf.imp ? 'nem com 8× as equipes: sequência e esperas das normas dominam' : 'reforço sobre todas as equipes', pf.ok ? 'ok' : 'bad'),
      K('Pico mensal', mi$(pico), `média ${mi$(saldo / Math.max(1, months.length))}/mês em ${months.length} meses · R ${mi$(saldoR)}`)].join('');
    // Gantt
    const x0 = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), 1, 12)), xEnd = new Date(Math.max(fim, R.end)); const x1 = new Date(Date.UTC(xEnd.getUTCFullYear(), xEnd.getUTCMonth() + 1, 1, 12));
    const W = 1100, LW = 250, RW = 10, rh = 22, gap = 6, top = 30; const rows = PKG.filter(p => R.P[p.id].S || R.P[p.id].tot > 0.5);
    const H = top + rows.length * (rh + gap) + 10; const sx = (W - LW - RW) / ((x1 - x0) / 864e5); const X_ = d => LW + (d - x0) / 864e5 * sx;
    let g = `<rect x="${X_(ini)}" y="${top - 8}" width="${X_(fim) - X_(ini)}" height="${H - top}" class="cw"/>`;
    for (let d = new Date(x0); d < x1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) { const m = d.getUTCMonth(); g += `<line x1="${X_(d)}" x2="${X_(d)}" y1="${top - 8}" y2="${H}" class="${m === 0 ? 'ya' : 'ma'}"/>`; if (m === 0 || m === 6 || (x1 - x0) / 864e5 < 500) g += `<text x="${X_(d) + 3}" y="${top - 14}" class="mt">${m === 0 ? d.getUTCFullYear() : mesNomeS(iso(d).slice(0, 7))}</text>`; }
    rows.forEach((p0, j) => { const p = R.P[p0.id]; const y = top + j * (rh + gap); const pd = p.tot ? p.done / p.tot : 0;
      g += `<text x="${LW - 8}" y="${y + rh / 2 + 4}" class="pn${R.crit.has(p.id) ? ' cr' : ''}" text-anchor="end">${esc(p.n)}</text>`;
      if (pd > 0.001) g += `<rect x="${X_(ini)}" y="${y + rh * .35}" width="${Math.max(1, X_(R.st) - X_(ini))}" height="${rh * .3}" class="ex"><title>${esc(p.n)}: executado ${fPc(pd)} (medido)</title></rect><text x="${X_(R.st) - 4}" y="${y + rh * .35 - 2}" class="px" text-anchor="end">${NF[0].format(pd * 100)}%</text>`;
      if (p.S) g += `<rect x="${X_(p.S)}" y="${y}" width="${Math.max(3, X_(p.F) - X_(p.S))}" height="${rh}" rx="3" fill="${PCOL[p.f]}" class="pb${R.crit.has(p.id) ? ' cr' : ''}"><title>${esc(p.n)}: ${fD(iso(p.S))} a ${fD(iso(p.F))} · início por ${esc(p.why)}${p.whyF && p.whyF !== 'produção' ? ' · término por ' + esc(p.whyF) : ''} · saldo ${fR(p.v)}</title></rect>`; });
    if (PP.base !== 'total') g += `<line x1="${X_(R.st)}" x2="${X_(R.st)}" y1="${top - 8}" y2="${H}" class="hj"/><text x="${X_(R.st) + 3}" y="${H - 2}" class="hjt">status ${fD(iso(R.st))}</text>`;
    g += `<line x1="${X_(fim)}" x2="${X_(fim)}" y1="${top - 8}" y2="${H}" class="pz"/><text x="${X_(fim) - 3}" y="${top - 1}" class="pzt" text-anchor="end">prazo ${fD(PP.fim)}</text>`;
    if (R.end > fim) g += `<line x1="${X_(R.end)}" x2="${X_(R.end)}" y1="${top - 8}" y2="${H}" class="pz late"/>`;
    $('#pl-gantt').innerHTML = `<div class="cv-sc"><svg viewBox="0 0 ${W} ${H}" class="pl-svg" role="img" aria-label="Cronograma do contrato">${g}</svg></div>
      <div class="ap-leg">${Object.entries({ t: 'terraplenagem', d: 'drenagem e OAC', p: 'camadas granulares', a: 'revestimento asfáltico', s: 'sinalização', o: 'obras especiais e complementares', g: 'apoio' }).map(([k, n]) => `<span><i style="background:${PCOL[k]}"></i>${n}</span>`).join('')}<span><i class="cr"></i>caminho crítico</span><span><i class="ex"></i>executado (medido)</span></div>`;
    // tabela de pacotes
    $('#pl-tab').innerHTML = `<table class="itbl stab pl-t"><thead><tr><th>Pacote</th><th class="n">Saldo (PI)</th><th class="n">Horas de equipe</th><th class="n">Equipes</th><th class="n">Operários/equipe</th><th class="n">Início</th><th class="n">Término</th><th>Condicionante</th></tr></thead><tbody>
      ${rows.map(p0 => { const p = R.P[p0.id]; return `<tr class="${R.crit.has(p.id) ? 'crit' : ''}"><td><i class="dot" style="background:${PCOL[p.f]}"></i> <b>${esc(p.n)}</b><div class="note">${p.its.length} itens${p.tot ? ' · executado ' + fPc(p.done / p.tot) : ''}</div></td><td class="n" data-l="Saldo">${fR(p.v)}</td><td class="n" data-l="Horas">${p.W ? NF[0].format(p.W) : '–'}</td>
        <td class="n" data-l="Equipes">${p.span || p.end ? '–' : `<input class="pl-in" data-k="eq" data-p="${p.id}" inputmode="decimal" value="${NF[0].format(+(PP.eq[p.id] ?? p0.eq))}">`}</td><td class="n" data-l="Operários">${p.span || p.end ? '–' : `<input class="pl-in" data-k="op" data-p="${p.id}" inputmode="decimal" value="${NF[0].format(+(PP.op[p.id] ?? p0.op))}">`}</td>
        <td class="n" data-l="Início">${p.S ? fD(iso(p.S)) : '–'}</td><td class="n" data-l="Término">${p.F ? fD(iso(p.F)) : '–'}</td><td data-l="Condicionante"><span class="note">${p.S ? esc(p.whyF && p.whyF !== 'produção' ? 'término: ' + p.whyF : 'início: ' + p.why) : 'sem saldo'}</span></td></tr>`; }).join('')}</tbody></table>`;
    // meses
    const mx = Math.max(1, ...months.map(m => m.pi + m.r)); let ac = 0;
    $('#pl-mes').innerHTML = `<div class="pl-bars">${months.map(m => { ac += m.pi; return `<div class="pl-b" title="${mesNomeS(m.ym)}: PI ${fR(m.pi)} · R ${fR(m.r)} · acumulado ${fR(ac)}"><span class="v">${NF[1].format((m.pi + m.r) / 1e6)}</span><span class="c"><i style="height:${(m.pi + m.r) / mx * 100}%"></i></span><em class="${m.ym > PP.fim.slice(0, 7) ? 'late' : ''}">${mesNomeS(m.ym)}</em></div>`; }).join('')}</div>
      <p class="note">R$ milhões por mês (PI + R), saldo a executar distribuído pelos dias trabalháveis de cada pacote. Meses em vermelho estão depois do prazo contratual.</p>`;
    // mês a mês por pacote
    const MM = months.map(m => m.ym); let acm = 0; const totPI = months.reduce((s2, m) => s2 + m.pi, 0);
    $('#pl-mat').innerHTML = `<table class="pl-mx"><thead><tr><th>Pacote</th>${MM.map(ym => `<th class="${ym > PP.fim.slice(0, 7) ? 'late' : ''}">${mesNomeS(ym)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${rows.filter(p0 => R.P[p0.id].v > 0.5).map(p0 => { const p = R.P[p0.id]; const vs = months.map(m => m.by[p.id] || 0); const mx2 = Math.max(...vs, 1);
        return `<tr><th><i class="dot" style="background:${PCOL[p.f]}"></i> ${esc(p.n)}</th>${vs.map(v => `<td style="--a:${(v / mx2 * .85).toFixed(2)}" title="${esc(p.n)}: ${fR(v)}">${v > 500 ? NF[0].format(v / 1e3) : ''}</td>`).join('')}<td class="t">${NF[0].format(p.v / 1e3)}</td></tr>`; }).join('')}
      <tr class="tt"><th>Total PI (R$ mil)</th>${months.map(m => `<td>${NF[0].format(m.pi / 1e3)}</td>`).join('')}<td class="t">${NF[0].format(totPI / 1e3)}</td></tr>
      <tr class="tt"><th>PI + R (R$ mil)</th>${months.map(m => `<td>${NF[0].format((m.pi + m.r) / 1e3)}</td>`).join('')}<td class="t">${NF[0].format((totPI + saldoR) / 1e3)}</td></tr>
      <tr class="tt"><th>Acumulado (% do PI)</th>${months.map(m => { acm += m.pi; return `<td>${NF[0].format(acm / Math.max(1, totPI) * 100)}%</td>`; }).join('')}<td class="t">100%</td></tr></tbody></table>`;
    // parâmetros
    const inp = (k, l, u, t = 'n') => `<label class="lbl">${l} <input class="pl-p" data-k="${k}" ${t === 'd' ? 'type="date"' : 'inputmode="decimal"'} value="${t === 'd' ? (PP[k] || '') : NF[1].format(+PP[k])}"> ${u}</label>`;
    if (!$('#pl-par').dataset.ok) {
      $('#pl-par').innerHTML = `<div class="bpar"><fieldset><legend>Contrato</legend>${inp('ini', 'Início do contrato', '', 'd')}${inp('fim', 'Término do contrato', '', 'd')}<label class="lbl">Simular <select class="pl-p" data-k="base"><option value="total"${PP.base === 'total' ? ' selected' : ''}>o contrato inteiro (desde o início)</option><option value="saldo"${PP.base === 'saldo' ? ' selected' : ''}>o saldo da medição (a partir da data de status)</option></select></label>
          <label class="lbl">Data de status (saldo) <input class="pl-p" data-k="status" type="date" value="${PP.status || today()}"></label></fieldset>
        <fieldset><legend>Jornada</legend>${inp('hDia', 'Horas por dia', 'h')}${inp('sab', 'Sábado (fração do dia)', '')}${inp('desmob', 'Desmobilização', 'dias')}${inp('durSem', 'Pacote sem produção na CPU', 'dias')}</fieldset>
        <fieldset><legend>Sequência executiva (dias)</legend>${inp('lagCam', 'Liberação de cada camada (controle tecnológico)', 'd')}${inp('lagCura', 'Cura da imprimação antes do CBUQ', 'd')}${inp('lagSin', 'Sinalização definitiva após o CBUQ', 'd')}${inp('lagReg', 'Regularização após início da terraplenagem', 'd')}${inp('lagDreno', 'Drenos após início da terraplenagem', 'd')}${inp('lagSup', 'Drenagem superficial após início da terraplenagem', 'd')}${inp('lagAmb', 'Revestimento vegetal após terraplenagem', 'd')}${inp('lagFim', 'Acabamentos após o CBUQ', 'd')}</fieldset>
        <fieldset class="pl-cl"><legend>Dias perdidos por mês (%)</legend><div class="pl-mg"><span></span>${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map(m => `<span>${m}</span>`).join('')}
          <span>chuva</span>${PP.chuva.map((v, i) => `<input class="pl-c" data-k="chuva" data-i="${i}" inputmode="decimal" value="${v}">`).join('')}<span>frio (asfalto)</span>${PP.frio.map((v, i) => `<input class="pl-c" data-k="frio" data-i="${i}" inputmode="decimal" value="${v}">`).join('')}</div></fieldset></div>
        <p class="note">Produção por equipe: produção horária da CPU do contrato; nas CPUs sem produção definida, operários por equipe ÷ horas de mão de obra por unidade da CPU. Fornecimentos (CAP, emulsões) acompanham o pacote. Domingos e feriados nacionais não contam; a chuva reduz os pacotes sensíveis e o frio reduz imprimação e CBUQ (não executar com temperatura abaixo de 10 °C nem com chuva, conforme as especificações de serviço). <button type="button" class="lnk" id="pl-reset">Voltar aos parâmetros padrão</button></p>`;
      $('#pl-par').dataset.ok = '1'; }
    $('#pl-warn').hidden = true;
  }
  function planInit() {
    const v = $('#v-planejamento'); if (!v) return;
    v.addEventListener('change', ev => { const t = ev.target; const num2 = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
      if (t.classList.contains('pl-p')) { const k = t.dataset.k; PP[k] = t.type === 'date' || t.tagName === 'SELECT' ? t.value : (Number.isFinite(num2(t.value)) ? num2(t.value) : PPD[k]); }
      else if (t.classList.contains('pl-c')) { PP[t.dataset.k][+t.dataset.i] = Math.max(0, Math.min(100, num2(t.value) || 0)); }
      else if (t.classList.contains('pl-in')) { const x = num2(t.value); if (Number.isFinite(x) && x > 0) PP[t.dataset.k][t.dataset.p] = x; else delete PP[t.dataset.k][t.dataset.p]; }
      else return; ppSave(); renderPlan(); });
    v.addEventListener('click', ev => { if (ev.target.id === 'pl-reset') { if (!confirm('Voltar todos os parâmetros do planejamento ao padrão?')) return; PP = JSON.parse(JSON.stringify(PPD)); ppSave(); $('#pl-par').dataset.ok = ''; renderPlan(); } });
    $('#pl-csv').onclick = () => { const R = planRun(); if (!R) return; const L = [['Pacote', 'Item', 'Código', 'Serviço', 'Un', 'Saldo', 'Produção (un/h por equipe)', 'Origem da produção', 'Horas de equipe', 'Saldo PI (R$)', 'R', 'Início', 'Término']];
      for (const p of Object.values(R.P)) for (const i of p.its) L.push([p.n, i.linha, i.codigo, i.servico, i.un, i.saldo, i.rate, i.fonteRate, i.h, i.v, i.R, p.S ? iso(p.S) : '', p.F ? iso(p.F) : '']);
      L.push([], ['Mês', 'PI (R$)', 'R (R$)']); for (const m of planMonths(R)) L.push([m.ym, m.pi, m.r]);
      download(`planejamento_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n')); };
  }

  // ===================================================================== MEMÓRIA JUSTIFICATIVA (pesquisável)
  const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let MEMP = null; let MQ = '', MDOC = '', MPG = null;
  function memLoad() {
    if (MEMP) return MEMP;
    MEMP = (window.__PR990__ && window.__PR990__.memorias ? Promise.resolve(window.__PR990__.memorias) : fetch('data/memorias.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }))
      .then(m => { for (const d of m.docs) d.np = d.pages.map(nrm); D.mem = m; return m; }).catch(e => { MEMP = null; throw e; });
    return MEMP;
  }
  const hl = (txt, terms) => { const ch = [...String(txt)]; const nm = []; let n = ''; ch.forEach((c, i) => { const x = nrm(c); for (let k = 0; k < x.length; k++) nm.push(i); n += x; });
    const on = new Array(ch.length).fill(false); for (const t of terms.filter(t => t.length > 1)) { let k = n.indexOf(t); while (k >= 0) { for (let j = k; j < k + t.length; j++) on[nm[j]] = true; k = n.indexOf(t, k + t.length); } }
    let h = '', open = false; ch.forEach((c, i) => { if (on[i] && !open) { h += '<mark>'; open = true; } else if (!on[i] && open) { h += '</mark>'; open = false; } h += esc(c); }); return h + (open ? '</mark>' : ''); };
  function memSearch(q, docId) {
    const m = D.mem; if (!m) return []; const terms = nrm(q).split(/\s+/).filter(t => t.length > 1); if (!terms.length) return [];
    const out = [];
    for (const d of m.docs) { if (docId && d.id !== docId) continue;
      d.np.forEach((p, i) => { if (!terms.every(t => p.includes(t))) return; let sc = 0; for (const t of terms) sc += p.split(t).length - 1; const k = p.indexOf(terms[0]);
        const raw = d.pages[i]; const a = Math.max(0, k - 90), b = Math.min(raw.length, k + 160); out.push({ d, i, sc, snip: (a ? '…' : '') + raw.slice(a, b).replace(/\s+/g, ' ') + (b < raw.length ? '…' : '') }); }); }
    return out.sort((x, y) => y.sc - x.sc).slice(0, 80);
  }
  const secOf = (d, pg) => { let s = null; for (const t of d.toc) if (t.p <= pg) s = t; return s; };
  // página original: PDF.js (vendor/pdfjs) lê só as partes necessárias do PDF; se o PDF estiver guardado no aparelho, lê de lá
  let MVIEW = store.get('memView', 'pdf'), MZ = 1; const MZS = [1, 1.5, 2, 3]; const PJ = 'vendor/pdfjs-3.11.174/'; let PJL = null; const PDOC = {}; let PTOK = 0;
  const pjLoad = () => PJL || (PJL = new Promise((ok, no) => { if (window.pdfjsLib) return ok(window.pdfjsLib); const sc = document.createElement('script'); sc.src = PJ + 'pdf.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PJ + 'pdf.worker.js'; ok(window.pdfjsLib); }; sc.onerror = () => { PJL = null; no(new Error('leitor de PDF indisponível')); }; document.head.appendChild(sc); }));
  const pdfCached = async f => { try { return 'caches' in window ? await (await caches.open('pr990-midia')).match(f, { ignoreSearch: true }) : null; } catch { return null; } };
  function pdfDoc(d) {
    if (PDOC[d.id]) return PDOC[d.id];
    return PDOC[d.id] = pjLoad().then(async L => { const hit = await pdfCached(d.file); const opt = { standardFontDataUrl: PJ + 'standard_fonts/', isEvalSupported: false };
      return L.getDocument(hit ? { ...opt, data: new Uint8Array(await hit.arrayBuffer()) } : { ...opt, url: d.file, rangeChunkSize: 262144, disableAutoFetch: true, disableStream: true }).promise; })
      .catch(e => { delete PDOC[d.id]; throw e; });
  }
  async function pdfPage(d, pg, terms) {
    const tok = ++PTOK; const box = $('#mm-cv'); if (!box) return;
    pdfCached(d.file).then(h => { const o = $('#mm-off'); if (o && tok === PTOK) o.innerHTML = h ? `${esc(d.n)} guardado neste aparelho: abre sem internet. <button type="button" class="lnk" data-mdrop="${d.id}">Apagar do aparelho</button>` : `Para ver as páginas originais sem internet: <button type="button" class="lnk" data-msave="${d.id}">guardar ${esc(d.n)} neste aparelho</button> (${({ t0: 9, t1: 34, t2: 11, t3: 40, t4: 46 })[d.id] || ''} MB).`; });
    try {
      const doc = await pdfDoc(d); const page = await doc.getPage(pg); if (tok !== PTOK) return;
      const w = Math.max(280, box.clientWidth) * MZ; const v1 = page.getViewport({ scale: 1 }); const sc = w / v1.width; const vp = page.getViewport({ scale: sc });
      const dpr = Math.min(2.5, window.devicePixelRatio || 1); const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr); cv.style.width = vp.width + 'px'; cv.style.height = vp.height + 'px';
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise; if (tok !== PTOK) return;
      box.innerHTML = ''; const inner = document.createElement('div'); inner.className = 'mm-in'; inner.style.width = vp.width + 'px'; inner.style.height = vp.height + 'px'; inner.appendChild(cv); box.appendChild(inner);
      const tt = terms.filter(t => t.length > 1); let first = null;
      if (tt.length) { const tc = await page.getTextContent(); for (const it of tc.items) { const n = nrm(it.str); if (!n.trim() || !tt.some(t => n.includes(t))) continue;
        const [a, b, , , e, f] = it.transform; const hgt = it.height || Math.hypot(a, b); const L = n.length || 1;
        for (const t of tt) { let k = n.indexOf(t); while (k >= 0) { const x0 = e + it.width * k / L, x1 = e + it.width * (k + t.length) / L; const r = vp.convertToViewportRectangle([x0, f - hgt * 0.25, x1, f + hgt * 0.95]);
          const el = document.createElement('i'); el.className = 'mm-mk'; el.style.cssText = `left:${Math.min(r[0], r[2]) - 1}px;top:${Math.min(r[1], r[3])}px;width:${Math.abs(r[2] - r[0]) + 2}px;height:${Math.abs(r[3] - r[1])}px`; inner.appendChild(el); first = first || el; k = n.indexOf(t, k + t.length); } } } }
      if (first) first.scrollIntoView({ block: 'center' });
    } catch (e) { if (tok !== PTOK) return; box.style.height = ''; box.innerHTML = `<p class="note warn">Não foi possível abrir a página original (${esc(e.message || 'sem conexão')}). Mostrando o texto extraído.</p><pre class="mm-pg">${hl(d.pages[pg - 1] || '', terms)}</pre>`; }
  }
  async function pdfSave(id, btn) { const d = D.mem.docs.find(x => x.id === id); try { btn.textContent = 'baixando…'; btn.disabled = true; const r = await fetch(d.file, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
      await (await caches.open('pr990-midia')).put(d.file, r); delete PDOC[id]; renderMem(); } catch (e) { btn.textContent = 'falhou – tente de novo com internet'; btn.disabled = false; } }
  async function pdfDrop(id) { const d = D.mem.docs.find(x => x.id === id); try { await (await caches.open('pr990-midia')).delete(d.file, { ignoreSearch: true }); } catch { } delete PDOC[id]; renderMem(); }
  async function renderMem() {
    const host = $('#mm-body'); if (!host) return;
    if (!D.mem) { host.innerHTML = '<p class="note">Carregando a memória justificativa…</p>'; try { await memLoad(); } catch (e) { host.innerHTML = `<p class="note warn">Não foi possível carregar a memória justificativa (${esc(e.message)}). Abra uma vez com internet.</p>`; return; } }
    const m = D.mem;
    $('#mm-docs').innerHTML = `<button type="button" class="chip${!MDOC ? ' on' : ''}" data-md="">Todos</button>` + m.docs.map(d => `<button type="button" class="chip${MDOC === d.id ? ' on' : ''}" data-md="${d.id}">${esc(d.n)} <small>${d.pages.length} p.</small></button>`).join('');
    if (MPG) { const d = m.docs.find(x => x.id === MPG.d); const i = MPG.p - 1; const s = secOf(d, MPG.p); const terms = nrm(MQ).split(/\s+/).filter(Boolean);
      const orig = MVIEW === 'pdf' && !window.__PR990__;
      host.innerHTML = `<div class="mm-rd"><div class="mm-bar"><button type="button" class="btn sm" data-mback>← ${MQ ? 'Resultados' : 'Sumário'}</button><b>${esc(d.n)}</b><span class="note">${s ? esc(s.s + ' ' + s.t) + ' · ' : ''}página ${MPG.p} de ${d.pages.length}</span><span class="sp"></span>
        <button type="button" class="btn sm" data-mpg="${MPG.p - 1}"${MPG.p <= 1 ? ' disabled' : ''} aria-label="Página anterior">‹</button><button type="button" class="btn sm" data-mpg="${MPG.p + 1}"${MPG.p >= d.pages.length ? ' disabled' : ''} aria-label="Próxima página">›</button>
        ${window.__PR990__ ? '' : `<span class="seg mm-vw"><button type="button" class="${orig ? 'on' : ''}" data-mview="pdf">Página original</button><button type="button" class="${orig ? '' : 'on'}" data-mview="txt">Só o texto</button></span>`}
        ${orig ? `<span class="mm-z"><button type="button" class="btn sm" data-mz="-1" aria-label="Diminuir"${MZ <= 1 ? ' disabled' : ''}>−</button><span class="note">${Math.round(MZ * 100)}%</span><button type="button" class="btn sm" data-mz="1" aria-label="Ampliar"${MZ >= 3 ? ' disabled' : ''}>+</button></span>` : ''}
        <a class="btn sm" href="${window.__PR990__ ? 'https://filipezanella1.github.io/PR990-Obra-completa/' : ''}${d.file}#page=${MPG.p}" target="_blank" rel="noopener">Abrir no PDF</a></div>
        ${orig ? `<div class="mm-cv" id="mm-cv"><p class="note mm-ld">Carregando a página original…</p></div><p class="note mm-off" id="mm-off"></p>` : `<pre class="mm-pg">${hl(d.pages[i] || '(página sem texto)', terms)}</pre>`}
        <div class="mm-foot"><button type="button" class="btn sm" data-mpg="${MPG.p - 1}"${MPG.p <= 1 ? ' disabled' : ''}>‹ Página ${MPG.p - 1}</button><button type="button" class="btn sm" data-mpg="${MPG.p + 1}"${MPG.p >= d.pages.length ? ' disabled' : ''}>Página ${MPG.p + 1} ›</button></div></div>`;
      if (orig) pdfPage(d, MPG.p, terms); else { const mk = host.querySelector('mark'); if (mk) mk.scrollIntoView({ block: 'center' }); }
      return; }
    if (MQ.trim().length > 1) { const R = memSearch(MQ, MDOC); const terms = nrm(MQ).split(/\s+/).filter(Boolean);
      host.innerHTML = `<p class="note">${R.length ? `${R.length}${R.length === 80 ? '+' : ''} página${R.length > 1 ? 's' : ''} encontrada${R.length > 1 ? 's' : ''}` : 'Nada encontrado. Tente outra palavra (a busca ignora acentos e exige todas as palavras na mesma página).'}</p>
        <div class="mm-res">${R.map(r => { const s = secOf(r.d, r.i + 1); return `<button type="button" class="mm-r" data-mopen="${r.d.id}|${r.i + 1}"><span class="mm-h"><b>${esc(r.d.n)}</b> · p. ${r.i + 1}${s ? ' · ' + esc(s.s + ' ' + s.t) : ''}</span><span class="mm-s">${hl(r.snip, terms)}</span></button>`; }).join('')}</div>`; return; }
    host.innerHTML = `<div class="mm-toc">${m.docs.filter(d => !MDOC || d.id === MDOC).map(d => `<details${MDOC ? ' open' : ''}><summary><b>${esc(d.n)}</b> <span class="note">${d.pages.length} páginas${d.ocr ? ` · ${d.ocr} digitalizadas (texto por OCR)` : ''}</span></summary><ol>${d.toc.map(t => `<li class="lv${Math.min(3, t.s.split('.').length)}"><button type="button" class="lnk" data-mopen="${d.id}|${t.p}">${esc(t.s)} ${esc(t.t)}</button><span class="note">p. ${t.p}</span></li>`).join('')}</ol></details>`).join('')}</div>`;
  }
  function memOpen(doc, page, q) { MPG = { d: doc, p: page }; if (q !== undefined) { MQ = q; const i = $('#mm-q'); if (i) i.value = q; } if (X.current() !== 'memorias') location.hash = '#memorias'; else renderMem(); }
  function memInit() {
    const v = $('#v-memorias'); if (!v) return;
    let tm; $('#mm-q').addEventListener('input', ev => { clearTimeout(tm); tm = setTimeout(() => { MQ = ev.target.value; MPG = null; renderMem(); }, 180); });
    v.addEventListener('click', ev => {
      const o = ev.target.closest('[data-mopen]'); if (o) { const [d, p] = o.dataset.mopen.split('|'); MPG = { d, p: +p }; renderMem(); window.scrollTo({ top: v.offsetTop - 80 }); return; }
      const g = ev.target.closest('[data-mpg]'); if (g) { MPG.p = +g.dataset.mpg; renderMem(); if (!MQ) $('#mm-body').scrollIntoView({ block: 'start' }); return; }
      if (ev.target.closest('[data-mback]')) { MPG = null; renderMem(); return; }
      const zm = ev.target.closest('[data-mz]'); if (zm) { MZ = MZS[Math.max(0, Math.min(MZS.length - 1, MZS.indexOf(MZ) + +zm.dataset.mz))]; renderMem(); return; }
      const vw = ev.target.closest('[data-mview]'); if (vw) { MVIEW = vw.dataset.mview; store.set('memView', MVIEW); renderMem(); return; }
      const sv = ev.target.closest('[data-msave]'); if (sv) { pdfSave(sv.dataset.msave, sv); return; }
      const dr = ev.target.closest('[data-mdrop]'); if (dr) { pdfDrop(dr.dataset.mdrop); return; }
      const c = ev.target.closest('[data-md]'); if (c) { MDOC = c.dataset.md; MPG = null; renderMem(); }
    });
    if ('requestIdleCallback' in window) requestIdleCallback(() => memLoad().catch(() => { }), { timeout: 8000 }); else setTimeout(() => memLoad().catch(() => { }), 4000);
  }

  // ===================================================================== CONTROLE TECNOLÓGICO
  let CTG = '', CTE = store.get('ctEns', {}), TRC = store.get('tracos', null), TRP = store.get('tracoPar', { ra: 1.50, rb: 1.45 });
  const trc = () => TRC || JSON.parse(JSON.stringify(D.controle.tracos));
  const srcLink = s => s ? `<button type="button" class="lnk ct-src" data-src="${s[0]}|${s[1]}">${({ t0: 'Volume 1', t1: 'Tomo I', t2: 'Tomo II', t3: 'Tomo III', t4: 'Anexo 3A' })[s[0]]}, p. ${s[1]}</button>` : '<span class="note">contrato</span>';
  function ctCheck(it, val) {
    if (val === '' || val === undefined || val === null) return '';
    const x = parseFloat(String(val).replace(',', '.')); if (!Number.isFinite(x) || it.t === 'info') return '';
    const ok = it.t === 'min' ? x >= it.v - 1e-9 : it.t === 'max' ? x <= it.v + 1e-9 : x >= it.v[0] - 1e-9 && x <= it.v[1] + 1e-9;
    return ok ? '<span class="pill ok">atende</span>' : '<span class="pill bad">não atende</span>';
  }
  function renderCt() {
    const C = D.controle; if (!C) return;
    $('#ct-gr').innerHTML = `<button type="button" class="chip${!CTG ? ' on' : ''}" data-ctg="">Todos</button>` + C.grupos.map(g => `<button type="button" class="chip${CTG === g.g ? ' on' : ''}" data-ctg="${esc(g.g)}">${esc(g.g)}</button>`).join('');
    $('#ct-par').innerHTML = C.grupos.filter(g => !CTG || g.g === CTG).map(g => `<h3 class="ct-g">${esc(g.g)}</h3>${g.s.map((s, si) => `<div class="panel ct-s"><div class="ph"><h4>${esc(s.n)}</h4><span class="note">${esc(s.es)}</span></div>
      <table class="itbl ct-t"><thead><tr><th>Parâmetro</th><th>Exigência de projeto</th><th>Fonte</th><th class="n">Resultado de ensaio</th><th>Situação</th></tr></thead><tbody>
      ${s.it.map((it, ii) => { const key = `${g.g}|${s.n}|${it.p}`; const val = CTE[key] ?? ''; return `<tr><td><b>${esc(it.p)}</b></td><td data-l="Exigência">${esc(it.c)}</td><td data-l="Fonte">${srcLink(it.src)}</td>
        <td class="n" data-l="Ensaio">${it.t === 'info' ? '<span class="note">–</span>' : `<input class="ct-in" data-k="${esc(key)}" inputmode="decimal" value="${esc(String(val))}" placeholder="${esc(it.u || '')}">`}</td><td data-l="Situação" class="ct-st">${ctCheck(it, val)}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}`).join('');
    // traços
    const T = trc(); const ra = +TRP.ra || 1.5, rb = +TRP.rb || 1.45; const N = (v, d = 2) => v === null || v === undefined || v === '' ? '' : NF[d].format(v);
    const lim = { 25: 0.60, 40: 0.55 };
    $('#ct-tr').innerHTML = `<div class="ct-trp"><label class="lbl">Massa unitária da areia <input class="tr-p" data-k="ra" inputmode="decimal" value="${N(ra)}"> t/m³</label><label class="lbl">Massa unitária da brita <input class="tr-p" data-k="rb" inputmode="decimal" value="${N(rb)}"> t/m³</label><span class="sp"></span><button type="button" class="btn sm" id="tr-add">+ Traço</button><button type="button" class="lnk" id="tr-rst">Voltar aos traços das CPUs</button></div>
      <div class="tbl-wrap"><table class="itbl ct-tt"><thead><tr><th>Concreto</th><th class="n">fck (MPa)</th><th class="n">Cimento (kg/m³)</th><th class="n">Areia (m³/m³)</th><th class="n">Brita (m³/m³)</th><th class="n">a/c</th><th class="n">Água (L/m³)</th><th>Traço em massa<br>1 : areia : brita : água</th><th>Por saco de 50 kg</th><th class="n">Aditivo (kg/m³)</th><th class="n">Abatim. (mm)</th><th>Uso</th><th>Origem (CPU)</th><th></th></tr></thead><tbody>
      ${T.map((t, i) => { const c = +t.cim || 0; const a = c && t.are ? t.are * ra * 1000 / c : null, p = c && t.bri ? t.bri * rb * 1000 / c : null; const agua = c && t.ac ? c * t.ac : null;
        const amax = t.fck >= 40 ? 0.55 : t.fck >= 25 ? 0.60 : null; const acBad = amax && t.ac > amax + 1e-9;
        const inp = (k, d = 2, w = '') => `<input class="tr-in${k === 'ac' && acBad ? ' bad' : ''}" data-i="${i}" data-k="${k}" ${k === 'n' || k === 'uso' || k === 'cpu' ? '' : 'inputmode="decimal"'} value="${esc(k === 'n' || k === 'uso' || k === 'cpu' ? (t[k] || '') : N(t[k], d))}"${w}>`;
        return `<tr><td>${inp('n', 0, ' size="18"')}</td><td class="n">${inp('fck', 0)}</td><td class="n">${inp('cim', 1)}</td><td class="n">${inp('are', 3)}</td><td class="n">${inp('bri', 3)}</td><td class="n">${inp('ac', 2)}${acBad ? `<div class="note warn">máx. ${N(amax)}</div>` : ''}</td><td class="n">${agua ? NF[0].format(agua) : '–'}</td><td><b>${c ? `1 : ${a !== null ? N(a) : '–'} : ${p !== null ? N(p) : '–'} : ${t.ac ? N(t.ac) : '–'}` : '<span class="note">dosagem da concreteira</span>'}</b></td><td class="note">${c ? `areia ${a !== null ? NF[0].format(t.are * 1000 * 50 / c) : '–'} L · brita ${p !== null ? NF[0].format(t.bri * 1000 * 50 / c) : '–'} L · água ${t.ac ? NF[0].format(50 * t.ac) : '–'} L` : '–'}</td><td class="n">${inp('adt', 2)}</td><td class="n">${inp('slump', 0)}</td><td>${inp('uso', 0, ' size="18"')}</td><td>${inp('cpu', 0, ' size="12"')}</td><td><button type="button" class="lnk" data-trdel="${i}" title="Remover">✕</button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="note">Quantidades por m³ das CPUs do contrato (cimento, areia e brita); água pela relação a/c informada. Traço unitário em massa pelas massas unitárias acima. Relação a/c máxima de projeto: 0,60 para C25 e 0,55 para C40 (classe de agressividade II). Ajuste os traços conforme a dosagem experimental aprovada.</p>`;
  }
  function ctInit() {
    const v = $('#v-controle'); if (!v) return;
    v.addEventListener('click', ev => {
      const g = ev.target.closest('[data-ctg]'); if (g) { CTG = g.dataset.ctg; renderCt(); return; }
      const s = ev.target.closest('[data-src]'); if (s) { const [d, p] = s.dataset.src.split('|'); memOpen(d, +p, ''); return; }
      if (ev.target.id === 'tr-add') { TRC = trc(); TRC.push({ id: 'u' + Date.now(), n: 'Novo traço', uso: '', fck: null, cim: null, are: null, bri: null, ac: null, adt: 0, slump: null, cpu: '' }); store.set('tracos', TRC); renderCt(); return; }
      if (ev.target.id === 'tr-rst') { if (!confirm('Voltar todos os traços aos valores das CPUs do contrato?')) return; TRC = null; try { localStorage.removeItem('pr990:tracos'); } catch { } store.set('tracos', JSON.parse(JSON.stringify(D.controle.tracos))); TRC = null; renderCt(); return; }
      const dl = ev.target.closest('[data-trdel]'); if (dl) { TRC = trc(); TRC.splice(+dl.dataset.trdel, 1); store.set('tracos', TRC); renderCt(); }
    });
    v.addEventListener('change', ev => { const t = ev.target; const num2 = s => { const x = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
      if (t.classList.contains('ct-in')) { const k = t.dataset.k; if (t.value.trim() === '') delete CTE[k]; else CTE[k] = t.value.trim(); store.set('ctEns', CTE); renderCt(); return; }
      if (t.classList.contains('tr-in')) { TRC = trc(); const r = TRC[+t.dataset.i]; const k = t.dataset.k; r[k] = ['n', 'uso', 'cpu'].includes(k) ? t.value : num2(t.value); store.set('tracos', TRC); renderCt(); return; }
      if (t.classList.contains('tr-p')) { TRP = { ...TRP, [t.dataset.k]: num2(t.value) || TRP[t.dataset.k] }; store.set('tracoPar', TRP); renderCt(); } });
  }

  // ===================================================================== CAMPO (GPS)
  function toUTM(lat, lon, zone = 22) {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), rad = Math.PI / 180;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * rad, p = lat * rad, l = lon * rad;
    const sn = Math.sin(p), cs = Math.cos(p), tn = Math.tan(p);
    const N = a / Math.sqrt(1 - e2 * sn * sn), T = tn * tn, Cc = ep2 * cs * cs, A = cs * (l - lon0);
    const Mm = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
    const E = k0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * A ** 5 / 120) + 500000;
    let Nn = k0 * (Mm + N * tn * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) Nn += 10000000; return [E, Nn];
  }
  function project(E, N) {   // ponto → estaca, afastamento e lado (pelo eixo de projeto, pontos a cada 5 m)
    const P = D.eixo.pts, st = D.eixo.step; let best = null;
    for (let i = 0; i < P.length - 1; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[i + 1]; const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((E - x1) * dx + (N - y1) * dy) / L2)); const px = x1 + t * dx, py = y1 + t * dy;
      const d2 = (E - px) ** 2 + (N - py) ** 2;
      if (!best || d2 < best.d2) best = { d2, i, t, side: dx * (N - y1) - dy * (E - x1) > 0 ? 'LE' : 'LD' };
    }
    const est = Math.min(END(), (best.i + best.t) * st / 20);
    return { est, off: Math.sqrt(best.d2), lado: best.side };
  }
  function axisAt(est) { const P = D.eixo.pts, i = Math.max(0, Math.min(P.length - 1, Math.round(est * 20 / D.eixo.step))); return P[i]; }
  let gpsWatch = null, here = store.get('campoEst', null), hereFix = null, raio = store.get('campoRaio', 50);
  function campoGPS() {
    if (gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; $('#g-go').textContent = 'Usar minha localização'; $('#g-go').classList.remove('on'); return; }
    if (!('geolocation' in navigator)) { $('#g-msg').textContent = 'Este aparelho/navegador não informa a localização.'; return; }
    $('#g-msg').textContent = 'Buscando o sinal do GPS…'; $('#g-go').textContent = 'Parar GPS'; $('#g-go').classList.add('on');
    gpsWatch = navigator.geolocation.watchPosition(pos => {
      const [E, N] = toUTM(pos.coords.latitude, pos.coords.longitude); const p = project(E, N);
      hereFix = { ...p, acc: pos.coords.accuracy, E, N, t: Date.now() }; here = p.est; store.set('campoEst', here);
      $('#g-msg').textContent = p.off > 300 ? `Você está a ${NF[0].format(p.off)} m do eixo da PR-990 — mostrando a estaca mais próxima.` : '';
      renderCampo();
    }, err => { $('#g-msg').textContent = err.code === 1 ? 'Permissão de localização negada. Libere a localização para este site nas configurações do navegador.' : 'Não foi possível obter a localização (' + err.message + ').'; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function nearby(est) {
    const R = raio / 20, out = [];
    const dist = (ei, ef) => (ef !== null && ef > ei) ? (est < ei ? (ei - est) * 20 : est > ef ? (est - ef) * 20 : 0) : Math.abs(ei - est) * 20;
    const drf = d => X.DRF.find(f => f.re.test(String(d).trim()));
    for (const r of tab('Drenagem linear')) { const ei = num(r['Est. inicial (dec.)']), ef = num(r['Est. final (dec.)']); const dd = dist(ei, ef); if (dd <= raio) out.push({ g: 'Drenagem', d: r['Dispositivo'], desc: r['Descrição'], lado: r['Lado'], ei, ef, q: fQ(r['L (m)']) + ' m', dd, f: drf(r['Dispositivo']) }); }
    for (const r of tab('Drenagem pontual')) { const ei = num(r['Estaca (dec.)']); const dd = dist(ei, null); if (dd <= raio) out.push({ g: 'Drenagem', d: r['Dispositivo'], desc: r['Descrição'], lado: r['Lado'], ei, ef: null, q: (num(r['L (m)']) ? fQ(r['L (m)']) + ' m' : NF[0].format(num(r['Quantidade (un)']) || 1) + ' un'), dd, f: drf(r['Dispositivo']) }); }
    for (const r of tab('Sinalização – placas')) { const ei = num(r['Estaca (dec.)']); const dd = dist(ei, null); if (dd <= raio && ei > 0) out.push({ g: 'Sinalização', d: 'Placa ' + r['Placa'], desc: r['Dimensões'], lado: r['Lado'] || '', ei, ef: null, q: fQ(r['Área (m²)']) + ' m²', dd, sh: r['Prancha'] }); }
    for (const r of tab('Interferências')) { const ei = num(r['Estaca (dec.)']); if (!Number.isFinite(ei) || typeof r['Estaca (dec.)'] !== 'number') continue; const dd = dist(ei, null); if (dd <= raio) out.push({ g: 'Interferências', d: r['Tipo'], desc: (r['Afastamento do eixo (m)'] ? 'a ' + fQ(r['Afastamento do eixo (m)'], 1) + ' m do eixo' : ''), lado: r['Lado'] || '', ei, ef: null, q: NF[0].format(num(r['Quantidade (un)']) || 1) + ' un', dd }); }
    for (const r of tab('Obras compl. – pontuais')) { const ei = num(r['Estaca (dec.)']); const dd = dist(ei, null); if (dd <= raio) out.push({ g: 'Obras complementares', d: r['Item'], desc: '', lado: r['Lado'] || '', ei, ef: null, q: fQ(r['Quantidade'], 0) + ' ' + (r['Un'] || ''), dd, sh: r['Fonte'] }); }
    for (const r of tab('Contenções')) { const ei = num(r['Est. inicial (dec.)']), ef = num(r['Est. final (dec.)']); const dd = dist(ei, ef); if (dd <= raio) out.push({ g: 'Contenções', d: r['Muro'], desc: r['Material'], lado: r['Lado'], ei, ef, q: fQ(r['Quantidade'], 0), dd }); }
    for (const r of tab('Iluminação')) { const ei = num(r['Estaca aprox. (dec.)']); const dd = dist(ei, null); if (dd <= raio) out.push({ g: 'Iluminação', d: 'Poste ' + r['Poste'], desc: r['Luminária'] + ' · ' + r['Local'], lado: '', ei, ef: null, q: '1 un', dd }); }
    for (const r of tab('MJ – sinalização horizontal')) { const ei = num(r['Est. inicial (dec.)']), ef = num(r['Est. final (dec.)']); if (dist(ei, ef) === 0) out.push({ g: 'Sinalização', d: r['Tipo de faixa'], desc: '', lado: r['Lado'], ei, ef, q: fQ(r['Área (m²)']) + ' m² no segmento', dd: 0 }); }
    for (const r of tab('OAE – ponte').slice(0, 1)) { const ei = num(r['Est. inicial (dec.)']), ef = num(r['Est. final (dec.)']); const dd = dist(ei, ef); if (dd <= raio) out.push({ g: 'OAE', d: 'Ponte sobre o Rio do Salto', desc: `${estStr(ei)} a ${estStr(ef)}`, lado: '', ei, ef, q: '', dd, sh: 'ES-2-0001' }); }
    return out.sort((a, b) => a.dd - b.dd || a.ei - b.ei);
  }
  function renderCampo() {
    $('#g-raio').value = String(raio);
    if (here === null) { $('#g-here').innerHTML = '<p class="note">Toque em <b>Usar minha localização</b> no trecho da obra ou digite uma estaca para ver o que existe no local.</p>'; $('#g-list').innerHTML = ''; $('#g-map').innerHTML = ''; return; }
    const est = here, k = Math.floor(est);
    const geo = tab('Geometria por estaca').find(r => Math.floor(num(r['Estaca (dec.)'])) === k) || {};
    const es = tab('Estacas').find(r => Math.floor(num(r['Estaca (decimal)'])) === k) || {};
    const fix = hereFix && Math.abs(hereFix.est - est) < 1e-6 ? hereFix : null;
    const av = avAt(est);
    $('#g-here').innerHTML = `<div class="here"><div><span class="label">Estaca atual</span><div class="big mono">${estStr(est)}</div>
      <div class="note">${fix ? `${NF[1].format(fix.off)} m ${fix.off < 0.5 ? 'no eixo' : 'à ' + (fix.lado === 'LE' ? 'esquerda (LE)' : 'direita (LD)')} · precisão ±${NF[0].format(fix.acc)} m · E ${NF[1].format(fix.E)} N ${NF[1].format(fix.N)} (SIRGAS 2000 / UTM 22S)` : 'estaca informada manualmente'}</div></div>
      <dl class="kv"><dt>Segmento · seção tipo</dt><dd>${esc(es['Segmento'] || '–')} · ${esc(es['Seção tipo'] || '–')}</dd><dt>Largura do CBUQ</dt><dd>${es['Largura CBUQ acabado W (m)'] ? fQ(es['Largura CBUQ acabado W (m)']) + ' m' : '–'}</dd>
      <dt>Cota terreno → projeto</dt><dd>${geo['Cota do terreno (m)'] ? fQ(geo['Cota do terreno (m)']) + ' → ' + fQ(geo['Cota de projeto (m)']) + ' m' : '–'}</dd><dt>Situação</dt><dd>${esc(geo['Situação'] || '–')} ${geo['Altura (projeto − terreno) (m)'] !== undefined ? '(' + fQ(geo['Altura (projeto − terreno) (m)']) + ' m)' : ''}</dd>
      <dt>Greide · curva</dt><dd>${geo['Rampa do greide (%)'] !== undefined ? fQ(geo['Rampa do greide (%)'], 3) + '%' : '–'}${geo['Curva horizontal'] ? ' · ' + esc(geo['Curva horizontal']) + ' R=' + fQ(geo['Raio (m)'], 0) : ''}</dd></dl>
      <div class="avst"><span class="label">Avanço nesta estaca</span>${av.map(a => `<span class="avchip"><i class="sw" style="background:${a.col}"></i>${esc(a.n)}:&nbsp;<b>${esc(stName(a.k))}</b></span>`).join('')}${oacNear(est, raio).map(o => `<span class="avchip">${oacIcon(o.st)}&nbsp;${esc(o.t)} (est. ${estStr(o.e)}):&nbsp;<b>OAC ${oacName(o.st)}</b></span>`).join('')}</div>
      ${!MED ? '' : (() => { const L = MED.itens.map(it => { const q = it.r.filter(r => r[4] === MED.n && (r[1] !== null && r[1] > r[0] ? est >= r[0] - 1e-9 && est <= r[1] + 1e-9 : Math.abs(r[0] - est) <= 0.5)).reduce((s, r) => s + r[3], 0); return { it, q }; }).filter(o => Math.abs(o.q) > 1e-9);
        return L.length ? `<div class="avst"><span class="label">Medido aqui na ${MED.n}ª medição</span>${L.map(o => `<span class="avchip"><b>${esc(o.it.c)}</b>&nbsp;${esc(o.it.s.slice(0, 48))} · ${fQ(o.q)} ${esc(o.it.u)}</span>`).join('')}</div>` : ''; })()}
      ${(() => { const L = (D.pranchas || []).filter(p => p.e && est >= p.e[0] - 1e-9 && est <= p.e[1] + 1e-9).sort((x, y) => DISC.findIndex(d => d.id === x.d) - DISC.findIndex(d => d.id === y.d)); return L.length ? `<div class="avst"><span class="label">Pranchas deste local</span>${L.map(p => `<button type="button" class="avchip g-pr" data-gpr="${esc(p.id)}"><b>${esc(p.id)}</b>&nbsp;${esc(DISC.find(d => d.id === p.d).n)}</button>`).join('')}</div>` : ''; })()}
      <div class="here-act"><button class="btn" type="button" id="g-tr">Usar como trecho no painel (± 1 estaca)</button><button class="btn" type="button" id="g-av">Ver no retigráfico</button></div></div>`;
    $$('#g-here [data-gpr]').forEach(b => b.onclick = () => prOpenSheet(b.dataset.gpr));
    $('#g-tr').onclick = () => { X.setSel(Math.max(0, est - 1), Math.min(END(), est + 1), true); X.show('painel'); location.hash = '#painel'; };
    $('#g-av').onclick = () => { location.hash = '#avanco'; setTimeout(() => { const c = document.querySelector(`#a-grid i.c[data-k="${k}"]`); if (c) { c.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 2500); } }, 120); };
    const list = nearby(est);
    const groups = [...new Set(list.map(x => x.g))];
    $('#g-list').innerHTML = list.length ? groups.map(g => `<h3>${esc(g)}</h3><div class="near">${list.filter(x => x.g === g).map(x => {
      const img = x.f && x.f.sh[0] ? `<button type="button" class="nimg" data-dr="${x.f.sh[0]}" title="Detalhe tipo"><img loading="lazy" src="drenagem/thumb/DR-4-${x.f.sh[0]}.webp" alt=""></button>` : '';
      return `<div class="nit">${img}<div><b>${esc(x.d)}</b> <span class="pill na">${esc(x.lado || 'eixo')}</span><div class="note">${esc(x.desc || '')}</div>
        <div class="mono small">${estStr(x.ei)}${x.ef !== null && x.ef > x.ei ? ' → ' + estStr(x.ef) : ''} · ${esc(x.q)} · ${x.dd < 1 ? 'aqui' : NF[0].format(x.dd) + ' m'}</div></div></div>`; }).join('')}</div>`).join('')
      : `<p class="note">Nenhum elemento cadastrado a menos de ${raio} m.</p>`;
    $$('#g-list [data-dr]').forEach(b => b.onclick = () => X.lbOpen(b.dataset.dr));
    drawMap(est, fix);
  }
  function drawMap(est, fix) {
    const P = D.eixo.pts, st = D.eixo.step, i0 = Math.max(0, Math.round((est * 20 - 600) / st)), i1 = Math.min(P.length - 1, Math.round((est * 20 + 600) / st));
    const seg = P.slice(i0, i1 + 1); const c = axisAt(est); if (fix && fix.off > 400) fix = null; const pts = fix ? [...seg, [fix.E, fix.N]] : seg;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const pad = 40;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad; const W = 600, H = 260;
    const sc = Math.min(W / (x1 - x0), H / (y1 - y0)); const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    const tx = x => ox + (x - x0) * sc, ty = y => H - (oy + (y - y0) * sc);
    let ticks = '';
    for (let e = Math.ceil((i0 * st) / 100) * 5; e * 20 <= i1 * st; e += 5) { const p = axisAt(e); ticks += `<circle cx="${tx(p[0]).toFixed(1)}" cy="${ty(p[1]).toFixed(1)}" r="2.5" class="tk"/><text x="${tx(p[0]).toFixed(1)}" y="${(ty(p[1]) - 7).toFixed(1)}" class="tl">${e}</text>`; }
    $('#g-map').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Eixo da rodovia perto da estaca ${estStr(est)}"><polyline points="${seg.map(p => tx(p[0]).toFixed(1) + ',' + ty(p[1]).toFixed(1)).join(' ')}" class="ax"/>${ticks}
      <circle cx="${tx(c[0]).toFixed(1)}" cy="${ty(c[1]).toFixed(1)}" r="6" class="here-ax"/>${fix ? `<circle cx="${tx(fix.E).toFixed(1)}" cy="${ty(fix.N).toFixed(1)}" r="${Math.max(5, Math.min(40, fix.acc * sc)).toFixed(1)}" class="acc"/><circle cx="${tx(fix.E).toFixed(1)}" cy="${ty(fix.N).toFixed(1)}" r="5" class="me"/>` : ''}
      <text x="8" y="${H - 8}" class="tl">N ↑ · estacas a cada 100 m</text></svg>`;
  }
  function campoInit() {
    $('#g-go').onclick = campoGPS;
    $('#g-raio').onchange = () => { raio = +$('#g-raio').value; store.set('campoRaio', raio); renderCampo(); };
    const go = () => { const v = parseEstIn($('#g-est').value); if (v === null || v < 0 || v > END()) { $('#g-msg').textContent = 'Estaca inválida (0 a 642+15,817).'; return; } $('#g-msg').textContent = ''; here = v; hereFix = null; store.set('campoEst', here); renderCampo(); };
    $('#g-see').onclick = go; $('#g-est').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#g-prev').onclick = () => { if (here === null) return; here = Math.max(0, Math.floor(here - 1e-9) - (Number.isInteger(here) ? 1 : 0)); hereFix = null; renderCampo(); };
    $('#g-next').onclick = () => { if (here === null) return; here = Math.min(END(), Math.floor(here) + 1); hereFix = null; renderCampo(); };
  }

  // ===================================================================== PRANCHAS (outras disciplinas)
  const DISC = [
    { id: 'pav', n: 'Pavimentação' }, { id: 'sin', n: 'Sinalização' }, { id: 'oae', n: 'OAE – ponte' }, { id: 'oc', n: 'Obras complementares' }, { id: 'cont', n: 'Contenções' }, { id: 'ilu', n: 'Iluminação' }, { id: 'top', n: 'Topografia' }, { id: 'ger', n: 'Geral' }];
  const sh = (...ids) => ids;
  const VOL = (col, un, n) => ({ sheet: 'Volumes por intervalo', ei: 'Estaca inicial', ef: 'Estaca final', parse: true, items: [{ n, col, un }] });
  const CARDS = [
    { d: 'pav', id: 'pv-camadas', n: 'Camadas do pavimento', sh: sh('PV-2-0001', 'PV-2-0002'), q: [VOL('CBUQ (t)', 't', 'CBUQ'), VOL('BGS (m³)', 'm³', 'Base BGS'), VOL('Sub-base (m³)', 'm³', 'Sub-base'), VOL('Reforço (m³)', 'm³', 'Reforço do subleito'), VOL('Imprimação EAI (m²)', 'm²', 'Imprimação'), VOL('Pintura RR-1C (m²)', 'm²', 'Pintura de ligação'), VOL('Regularização subleito (m²)', 'm²', 'Regularização do subleito')] },
    { d: 'pav', id: 'pv-secoes', n: 'Seções tipo', sh: sh('PV-2-0001', 'PV-2-0002'), q: [{ sheet: 'Seções tipo', ei: 'Estaca inicial', ef: 'Estaca final', parse: true, key: 'Seção tipo', col: 'Extensão (m)', un: 'm' }] },
    { d: 'pav', id: 'pv-plantas', n: 'Plantas de pavimentação', plantas: 'PV-1' },
    { d: 'pav', id: 'pv-outros', n: 'Diagrama linear e ocorrências de materiais', sh: sh('PV-9-0011', 'PV-9-0010') },
    { d: 'sin', id: 'si-hor', n: 'Sinalização horizontal', sh: sh('SI-1-0012', 'SI-1-0014', 'SI-1-0015', 'SI-1-0016'), q: [{ sheet: 'MJ – sinalização horizontal', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', key: 'Tipo de faixa', col: 'Área (m²)', un: 'm²' }, { sheet: 'MJ – sinalização horizontal', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', key: 'Tipo de tacha', col: 'Tachas (un)', un: 'un' }] },
    { d: 'sin', id: 'si-ver', n: 'Sinalização vertical – placas', sh: sh('SI-1-0013', 'SI-1-0012', 'SI-1-0001'), q: [{ sheet: 'Sinalização – placas', ei: 'Estaca (dec.)', key: 'Placa', col: null, un: 'un' }] },
    { d: 'sin', id: 'si-def', n: 'Defensas e terminais', sh: sh('SI-1-0014'), q: [{ sheet: 'Sinalização – defensas', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', items: [{ n: 'Defensa LE', col: 'Defensa LE (m)', un: 'm' }, { n: 'Defensa LD', col: 'Defensa LD (m)', un: 'm' }] }] },
    { d: 'sin', id: 'si-plantas', n: 'Plantas de sinalização', plantas: 'SI-1' },
    { d: 'oae', id: 'oae-geral', n: 'Ponte sobre o Rio do Salto – geral', sh: sh('ES-2-0001', 'ES-2-0002', 'ES-2-0007'), q: [{ sheet: 'OAE – ponte', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', key: 'Categoria', col: 'Qtd. contratual', un: '', whole: true }] },
    { d: 'oae', id: 'oae-infra', n: 'Infraestrutura – estacas, blocos e encontros', sh: sh('ES-2-0003', 'ES-2-0013', 'ES-2-0008', 'ES-2-0014', 'ES-2-0015') },
    { d: 'oae', id: 'oae-meso', n: 'Mesoestrutura', sh: sh('ES-2-0004') },
    { d: 'oae', id: 'oae-super', n: 'Superestrutura – longarinas, transversinas e laje', sh: sh('ES-2-0005', 'ES-2-0006', 'ES-2-0009', 'ES-2-0010', 'ES-2-0011', 'ES-2-0012', 'ES-2-0016', 'ES-2-0017', 'ES-2-0018', 'ES-2-0019', 'ES-2-0020', 'ES-2-0021', 'ES-2-0022', 'ES-2-0023', 'ES-2-0024', 'ES-2-0025') },
    { d: 'oae', id: 'oae-compl', n: 'Placas de aproximação e barreiras', sh: sh('ES-2-0026') },
    { d: 'oc', id: 'oc-cercas', n: 'Cercas', sh: sh('OC-1-0010', 'OC-3-0001'), q: [{ sheet: 'Obras compl. – cercas', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', items: [{ n: 'Cerca a implantar LE', col: 'Cerca a implantar LE (m)', un: 'm' }, { n: 'Cerca a implantar LD', col: 'Cerca a implantar LD (m)', un: 'm' }, { n: 'Cerca a remover LE', col: 'Cerca a remover LE (m)', un: 'm' }, { n: 'Cerca a remover LD', col: 'Cerca a remover LD (m)', un: 'm' }] }] },
    { d: 'oc', id: 'oc-pont', n: 'Abrigos, acessos e itens pontuais', sh: sh('OC-1-0010', 'OC-1-0011', 'OC-3-0001'), q: [{ sheet: 'Obras compl. – pontuais', ei: 'Estaca (dec.)', key: 'Item', col: 'Quantidade', unCol: 'Un' }] },
    { d: 'oc', id: 'oc-plantas', n: 'Plantas de obras complementares', plantas: 'OC-1' },
    { d: 'cont', id: 'co-muros', n: 'Muros de contenção (Terramesh)', sh: sh('CO-2-0001', 'CO-2-0002', 'CO-2-0005', 'CO-2-0009', 'CO-2-0003', 'CO-2-0004', 'CO-2-0006', 'CO-2-0007', 'CO-2-0008'), q: [{ sheet: 'Contenções', ei: 'Est. inicial (dec.)', ef: 'Est. final (dec.)', key: 'Material', col: 'Quantidade', un: '' }] },
    { d: 'ilu', id: 'il-postes', n: 'Iluminação – postes e luminárias', sh: sh('IL-1-0001', 'IL-1-0002'), q: [{ sheet: 'Iluminação', ei: 'Estaca aprox. (dec.)', key: 'Luminária', col: null, un: 'un' }] },
    { d: 'top', id: 'tc-pp', n: 'Levantamento topográfico – planta e perfil do terreno', plantas: 'TC-1' },
    { d: 'top', id: 'tc-ger', n: 'Convenções e interseção com a PR-364', sh: sh('TC-1-0001', 'TC-1-0002') },
    { d: 'ger', id: 'ge-loc', n: 'Mapa de localização', sh: sh('GE-1-0001') },
  ];
  let prD = store.get('prD', 'pav'), prOpen = store.get('prOpen', null);
  const PRC = () => new Map((D.pranchas || []).map(p => [p.id, p]));
  function cardQ(card, a, b) {
    const m = new Map();
    const fr = (ei, ef) => (ef !== null && ef !== undefined && ef > ei + 1e-9) ? Math.max(0, Math.min(b, ef) - Math.max(a, ei)) / (ef - ei) : ((ei >= a - 1e-9 && (ei < b - 1e-9 || b >= END() - 1e-6)) ? 1 : 0);
    for (const q of card.q || []) {
      for (const r of tab(q.sheet)) {
        let ei = q.parse ? parseEst(String(r[q.ei]).replace(/\.0*$/, '')) : num(r[q.ei]); let ef = q.ef ? (q.parse ? parseEst(String(r[q.ef])) : num(r[q.ef])) : null;
        if (ei === null || !Number.isFinite(ei)) continue;
        const f = q.whole ? 1 : fr(ei, ef);
        const its = q.items || [{ n: String(r[q.key] ?? '').trim(), col: q.col, un: q.unCol ? r[q.unCol] : q.un }];
        for (const it of its) {
          if (!it.n) continue; const v = it.col ? num(r[it.col]) : 1; if (!v) continue;
          const k = it.n + '|' + (it.un || ''); if (!m.has(k)) m.set(k, { d: it.n, un: it.un || '', q: 0, qt: 0 });
          const o = m.get(k); o.q += v; o.qt += v * (q.whole ? (fr(ei, ef) > 0 ? 1 : 0) : f);
        }
      }
    }
    return [...m.values()];
  }
  function cardSheets(card) {
    if (card.plantas) return (D.pranchas || []).filter(p => p.id.startsWith(card.plantas + '-') && p.e).sort((x, y) => x.e[0] - y.e[0]).map(p => p.id);
    return card.sh || [];
  }
  function renderPr() {
    const [a, b] = trecho(); $('#r-trecho').textContent = `${estStr(a)} → ${estStr(b)}`; const P = PRC();
    $('#r-disc').innerHTML = DISC.map(d => `<button type="button" class="chip${d.id === prD ? ' on' : ''}" data-d="${d.id}">${esc(d.n)}</button>`).join('');
    $$('#r-disc .chip').forEach(bt => bt.onclick = () => { prD = bt.dataset.d; store.set('prD', prD); prOpen = null; renderPr(); });
    const cards = CARDS.filter(c => c.d === prD);
    $('#r-grid').innerHTML = cards.map(c => {
      const ids = cardSheets(c); const s0 = c.plantas ? (ids.find(id => { const p = P.get(id); return p.e && p.e[0] <= b && p.e[1] >= a; }) || ids[0]) : ids[0];
      const tq = cardQ(c, a, b);
      const chips = c.plantas ? ids.map(id => { const p = P.get(id); const on = p.e[0] <= b && p.e[1] >= a; return `<span class="tchip${on ? ' tin' : ''}"><b>${esc(id)}</b> est. ${p.e[0]}–${Math.floor(p.e[1])}</span>`; }).join('')
        : tq.slice(0, 8).map(t => `<span class="tchip"><b>${esc(t.d)}</b> ${fQ(t.q, t.un === 'un' ? 0 : 2)} ${esc(t.un)}${Math.abs(t.qt - t.q) > 1e-6 ? ` <i>· trecho ${fQ(t.qt, t.un === 'un' ? 0 : 2)}</i>` : ''}</span>`).join('') + (tq.length > 8 ? `<span class="tchip">+${tq.length - 8} tipos</span>` : '');
      return `<article class="dr-card${prOpen === c.id ? ' sel' : ''}"><button type="button" class="dr-img" data-pr="${s0 || ''}">${s0 ? `<img loading="lazy" src="pranchas/thumb/${s0}.webp" alt="${esc(c.n)}">` : '<div class="noimg">sem prancha</div>'}</button>
        <div class="dr-body"><span class="label">${esc(DISC.find(d => d.id === c.d).n)} · ${ids.length} prancha${ids.length === 1 ? '' : 's'}</span><h3>${esc(c.n)}</h3><div class="tchips">${chips || '<span class="note">quantidades nas pranchas</span>'}</div>
        <button type="button" class="btn dr-more" data-id="${c.id}">Pranchas e quantidades</button></div></article>`;
    }).join('');
    $$('#r-grid [data-pr]').forEach(bt => bt.onclick = () => bt.dataset.pr && prOpenSheet(bt.dataset.pr));
    $$('#r-grid .dr-more').forEach(bt => bt.onclick = () => { prOpen = prOpen === bt.dataset.id ? null : bt.dataset.id; store.set('prOpen', prOpen); renderPr(); if (prOpen) $('#r-det').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const c = prOpen && CARDS.find(x => x.id === prOpen && x.d === prD); const host = $('#r-det');
    if (!c) { host.hidden = true; return; }
    host.hidden = false; const ids = cardSheets(c); const tq = cardQ(c, a, b);
    host.innerHTML = `<div class="ins-head"><h2>${esc(c.n)}</h2><button type="button" class="btn" id="r-close">Fechar</button></div>
      <h3>Pranchas (toque para abrir)</h3><div class="sheets">${ids.map(id => { const p = P.get(id) || { t: '' }; const on = p.e && p.e[0] <= b && p.e[1] >= a; return `<button type="button" class="sh${on ? ' tin' : ''}" data-pr="${id}"><img loading="lazy" src="pranchas/thumb/${id}.webp" alt=""><span><b>${esc(id)}</b> ${esc(p.t)}</span></button>`; }).join('')}</div>
      ${tq.length ? `<h3>Quantidades do projeto</h3><div class="tbl-wrap"><table class="itbl"><thead><tr><th>Tipo</th><th class="n">Obra inteira</th><th class="n">No trecho</th></tr></thead><tbody>${tq.map(t => `<tr><td><b>${esc(t.d)}</b></td><td class="n" data-l="Obra">${fQ(t.q, t.un === 'un' ? 0 : 2)} ${esc(t.un)}</td><td class="n" data-l="No trecho"><b>${fQ(t.qt, t.un === 'un' ? 0 : 2)} ${esc(t.un)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}`;
    $$('#r-det [data-pr]').forEach(bt => bt.onclick = () => prOpenSheet(bt.dataset.pr));
    $('#r-close').onclick = () => { prOpen = null; store.set('prOpen', null); renderPr(); };
  }
  function prOpenSheet(id) { const p = PRC().get(id) || { t: '' }; X.lbShow(`pranchas/${id}.webp`, `${id} · ${p.t}`); }

  // ===================================================================== COMPARAR TRECHOS
  function snapshot(a, b) {
    const I = M().meta.inputs; const wb = X.wb();
    const ei = Math.floor(a + 1e-9), mi = +((a - ei) * 20).toFixed(3); let ef = Math.floor(b + 1e-9), mf = +((b - ef) * 20).toFixed(3); if (b >= END() - 1e-6) { ef = 642; mf = 15.817; }
    wb.set(I.ei, ei); wb.set(I.mi, mi); wb.set(I.ef, ef); wb.set(I.mf, mf);
    const o = { ext: num(C(M().meta.sel)), disc: M().disciplinas.map(d => ({ n: d.curto, real: num(C('J' + d.subtotal)), adj: num(C('P' + d.subtotal)) })), lines: new Map(), kpi: M().kpi.map(k => ({ l: k.label, v: num(C(k.cel)), fmt: k.fmt })) };
    for (const d of M().disciplinas) for (const l of d.linhas) if (l.t === 'it' && l.ct) o.lines.set(l.r, { l, d: d.curto, q: num(C('H' + l.r)), v: num(C('J' + l.r)) });
    return o;
  }
  function renderCmpT() {
    const host = $('#cmp-out'); if (!host || $('#cmp-box').hidden) return;
    const A = trecho(); const b0 = parseEstIn($('#cb-ei').value), b1 = parseEstIn($('#cb-ef').value);
    if (b0 === null || b1 === null || b1 <= b0) { host.innerHTML = '<p class="note">Informe o trecho B (estaca inicial e final).</p>'; return; }
    const sa = snapshot(A[0], A[1]), sb = snapshot(b0, Math.min(END(), b1)); X.applyInputs();
    const perKm = $('#cmp-km').checked; const ka = perKm ? 1000 / Math.max(1, sa.ext) : 1, kb = perKm ? 1000 / Math.max(1, sb.ext) : 1;
    const fv = (v, f) => f === 'R$' ? fR(v) : NF[f === 'm' ? 0 : 0].format(v) + (f === 't' ? ' t' : f === 'm3' ? ' m³' : f === 'm' ? ' m' : '');
    const top = [...sa.lines.keys()].map(r => { const x = sa.lines.get(r), y = sb.lines.get(r); return { l: x.l, d: x.d, qa: x.q * ka, qb: y.q * kb, va: x.v * ka, vb: y.v * kb }; }).filter(o => Math.abs(o.va - o.vb) > 0.5).sort((p, q) => Math.abs(q.va - q.vb) - Math.abs(p.va - p.vb)).slice(0, 25);
    host.innerHTML = `<div class="tbl-wrap"><table class="itbl cmpt"><thead><tr><th></th><th class="n">A · ${estStr(A[0])} → ${estStr(A[1])}</th><th class="n">B · ${estStr(b0)} → ${estStr(Math.min(END(), b1))}</th><th class="n">B − A</th></tr></thead><tbody>
      <tr class="grp"><td colspan="4">Indicadores${perKm ? ' (por km)' : ''}</td></tr>
      ${sa.kpi.map((k, i) => { const va = k.v * (k.fmt === 'm' ? 1 : ka), vb = sb.kpi[i].v * (k.fmt === 'm' ? 1 : kb); return `<tr><td>${esc(k.l)}</td><td class="n" data-l="A">${fv(va, k.fmt)}</td><td class="n" data-l="B">${fv(vb, k.fmt)}</td><td class="n" data-l="B − A">${k.fmt === 'R$' ? fRs(vb - va) : fv(vb - va, k.fmt)}</td></tr>`; }).join('')}
      <tr class="grp"><td colspan="4">Consumo real por disciplina${perKm ? ' (R$/km)' : ''}</td></tr>
      ${sa.disc.map((d, i) => `<tr><td>${esc(d.n)}</td><td class="n" data-l="A">${fR(d.real * ka)}</td><td class="n" data-l="B">${fR(sb.disc[i].real * kb)}</td><td class="n ${sb.disc[i].real * kb - d.real * ka < 0 ? 'neg' : ''}" data-l="B − A">${fRs(sb.disc[i].real * kb - d.real * ka)}</td></tr>`).join('')}
      <tr class="grp"><td colspan="4">Serviços com maior diferença${perKm ? ' por km' : ''}</td></tr>
      ${top.map(o => `<tr><td>${esc(o.l.n)} <span class="note">${esc(o.d)} · ${esc(o.l.c)}</span></td><td class="n" data-l="A">${fQ(o.qa)} ${esc(o.l.u)}<br><span class="note">${fR(o.va)}</span></td><td class="n" data-l="B">${fQ(o.qb)} ${esc(o.l.u)}<br><span class="note">${fR(o.vb)}</span></td><td class="n ${o.vb - o.va < 0 ? 'neg' : ''}" data-l="B − A">${fRs(o.vb - o.va)}</td></tr>`).join('')}
      </tbody></table></div><p class="note">Extensões: A ${NF[2].format(sa.ext)} m · B ${NF[2].format(sb.ext)} m. ${perKm ? 'Valores normalizados por quilômetro de cada trecho.' : 'Marque “por km” para comparar trechos de extensões diferentes.'}</p>`;
  }
  function cmpInit() {
    $('#cmp-tg').onclick = () => { const bx = $('#cmp-box'); bx.hidden = !bx.hidden; $('#cmp-tg').classList.toggle('on', !bx.hidden); if (!bx.hidden) { if (!$('#cb-ei').value) { const [a, b] = trecho(); const L = b - a; let b0, b1; if (L > END() / 2) { b0 = 0; b1 = Math.floor(END() / 2); } else { b1 = Math.min(END(), b + L); b0 = Math.max(0, b1 - L); } $('#cb-ei').value = estStr(b0); $('#cb-ef').value = estStr(b1); } renderCmpT(); } };
    ['#cb-ei', '#cb-ef'].forEach(s => $(s).addEventListener('change', renderCmpT)); $('#cmp-km').addEventListener('change', renderCmpT);
    $$('[data-cmpp]').forEach(bt => bt.onclick = () => { const segs = BASE().sheets['Resumo por segmento'].slice(1).filter(r => r[0] === bt.dataset.cmpp); if (segs[0]) { $('#cb-ei').value = segs[0][3]; $('#cb-ef').value = segs[0][4]; } else { $('#cb-ei').value = '0+0'; $('#cb-ef').value = '642+15,817'; } renderCmpT(); });
  }

  // ===================================================================== BUSCA GLOBAL
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function searchAll(q) {
    const n = norm(q).trim(); if (n.length < 2) return [];
    const res = []; const add = (g, t, s, go) => res.push({ g, t, s, go });
    const e = /^(\d{1,3})(?:\s*\+\s*([\d.,]+))?$/.exec(q.trim());
    if (e && +e[1] <= 642) { const v = +e[1] + (e[2] ? parseFloat(e[2].replace(',', '.')) / 20 : 0); add('Estaca', `Estaca ${estStr(v)}`, 'O que existe no local (Campo)', () => { here = v; hereFix = null; store.set('campoEst', v); location.hash = '#campo'; }); }
    for (const d of M().disciplinas) for (const l of d.linhas) if (l.t === 'it' && norm(l.c + ' ' + l.n).includes(n)) add('Painel', `${l.c} · ${l.n}`, d.titulo, () => X.gotoRow(l.r));
    if (MED) for (const it of MED.itens) if (norm(it.c + ' ' + it.s).includes(n)) add('Medição', `${it.c} · ${it.s}`, `${MED.nome} · medido ${fQ(it.acum)} de ${fQ(it.q)} ${it.u}`, () => { location.hash = '#medicao'; $('#m-q').value = it.c; medFilt = ''; medOpen = it.l; renderMed(); });
    for (const c of M().contrato || []) if (norm(c.codigo + ' ' + c.servico).includes(n)) add('Contrato × projeto', `${c.codigo} · ${c.servico}`, c.grupo, () => { location.hash = '#contrato'; $('#c-q').value = c.codigo; X.renderCmp(); });
    for (const f of X.DRF) { const ty = new Set(); for (const r of [...tab('Drenagem linear'), ...tab('Drenagem pontual')]) { const d = String(r['Dispositivo'] || '').trim(); if (f.re.test(d) && norm(d + ' ' + f.n).includes(n)) ty.add(d); } if (ty.size || norm(f.n).includes(n)) add('Drenagem', f.n, [...ty].slice(0, 6).join(', '), () => { location.hash = '#drenagem'; $('#dr-q').value = q; X.renderDrenagem(); }); }
    for (const [s, t] of Object.entries(X.SHEETS)) if (norm('DR-4-' + s + ' ' + t).includes(n)) add('Pranchas', `DR-4-${s} · ${t}`, 'Drenagem – detalhe tipo', () => X.lbOpen(s));
    for (const p of D.pranchas || []) if (norm(p.id + ' ' + p.t + ' ' + DISC.find(d => d.id === p.d).n).includes(n)) add('Pranchas', `${p.id} · ${p.t}`, DISC.find(d => d.id === p.d).n, () => prOpenSheet(p.id));
    const seen = new Set(); for (const [c, rows] of Object.entries(INS().consumos)) for (const r of rows) { const k = r[0] + r[1]; if (!seen.has(k) && norm(r[1] + ' ' + r[2]).includes(n)) { seen.add(k); add('Insumos', `${r[2]}`, `${r[0]} · código ${r[1]}`, () => { location.hash = '#insumos'; $('#i-q2').value = r[2]; X.renderIns(); }); } }
    for (const l of (AV || { frentes: [] }).frentes) if (norm(l.n).includes(n)) add('Retigráfico', l.n, 'Frente do retigráfico', () => { location.hash = '#avanco'; });
    if (D.mem) for (const r of memSearch(q, '').slice(0, 12)) { const s = secOf(r.d, r.i + 1); add('Memória justificativa', `${r.d.n} · p. ${r.i + 1}${s ? ' · ' + s.s + ' ' + s.t : ''}`, r.snip.slice(0, 160), () => memOpen(r.d.id, r.i + 1, q)); }
    if (D.controle) for (const g of D.controle.grupos) for (const sv of g.s) for (const it of sv.it) if (norm(sv.n + ' ' + it.p + ' ' + sv.es).includes(n)) add('Controle tecnológico', `${sv.n} · ${it.p}`, it.c, () => { CTG = g.g; if (X.current() === 'controle') renderCt(); else location.hash = '#controle'; });
    return res;
  }
  function searchInit() {
    const ov = $('#srch'), inp = $('#srch-q'), out = $('#srch-out');
    const open = () => { ov.hidden = false; inp.value = ''; out.innerHTML = '<p class="note">Digite um código (ex.: 641800), um serviço (ex.: sarjeta), um insumo (ex.: cimento), uma prancha (ex.: SI-1) ou uma estaca (ex.: 345+10).</p>'; setTimeout(() => inp.focus(), 30); document.body.style.overflow = 'hidden'; };
    const close = () => { ov.hidden = true; document.body.style.overflow = ''; };
    $('#srch-btn').onclick = open; $('#srch-x').onclick = close;
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); open(); } else if (e.key === 'Escape' && !ov.hidden) close(); });
    let tm; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => {
      const r = searchAll(inp.value); const groups = [...new Set(r.map(x => x.g))];
      out.innerHTML = r.length ? groups.map(g => { const it = r.filter(x => x.g === g); return `<h3>${esc(g)} <span class="note">${it.length}</span></h3>${it.slice(0, 12).map((x) => `<button type="button" class="sres" data-i="${r.indexOf(x)}"><b>${esc(x.t)}</b><span>${esc(x.s || '')}</span></button>`).join('')}${it.length > 12 ? `<p class="note">+ ${it.length - 12} resultados – refine a busca</p>` : ''}`; }).join('') : (inp.value.trim().length < 2 ? '' : '<p class="note">Nada encontrado.</p>');
      $$('.sres', out).forEach(b => b.onclick = () => { const x = r[+b.dataset.i]; close(); x.go(); });
    }, 120); });
  }

  // ===================================================================== IMPRESSÃO / PDF
  // PDF: escolhe papel e orientação; a grade do retigráfico é refeita na largura da página e cada faixa fica inteira numa página
  const PAPER = { A4: [297, 210], A3: [420, 297] };
  function askPdf(v) {
    const dl = $('#pdf-dlg'); const pf = store.get('pdfPaper', { f: 'A4', o: 'landscape' });
    $('#pdf-f').value = pf.f; $('#pdf-o').value = pf.o; dl.hidden = false;
    $('#pdf-go').onclick = () => { const f = $('#pdf-f').value, o = $('#pdf-o').value; store.set('pdfPaper', { f, o }); dl.hidden = true; printView(v, f, o); };
    $('#pdf-x').onclick = () => { dl.hidden = true; };
  }
  function printView(v, fmt = 'A4', ori = 'landscape') {
    const [pw, ph] = PAPER[fmt]; const wmm = (ori === 'landscape' ? pw : ph) - 20;
    let st = $('#print-page'); if (!st) { st = document.createElement('style'); st.id = 'print-page'; document.head.appendChild(st); }
    st.textContent = `@media print { @page { size: ${fmt} ${ori}; margin: 10mm; } }`;
    const pagePx = Math.floor(wmm * 96 / 25.4);
    if (v === 'avanco' || v === 'simulacao') drawGrid(v === 'simulacao', pagePx - 80);
    const opened = [];
    if (v === 'painel') $$('#detail details.disc').forEach(d => { if (!d.open) { d.open = true; opened.push(d); } });
        document.body.dataset.print = v;
    const [a, b] = trecho(); const old = document.title; document.title = `PR-990 – ${({ painel: 'Painel', insumos: 'Insumos', medicao: 'Medição', avanco: 'Retigráfico', simulacao: 'Simulação de segmentos', britagem: 'Planejamento da britagem', apresentacao: 'Plano de pavimentação' })[v] || v} – ${estStr(a)} a ${estStr(b)}`;
    $('#print-head').textContent = `${document.title} · emitido em ${new Date().toLocaleDateString('pt-BR')}`;
    const done = () => { opened.forEach(d => d.open = false); delete document.body.dataset.print; document.title = old; window.removeEventListener('afterprint', done);
      if (v === 'avanco') drawGrid(false); if (v === 'simulacao') drawGrid(true); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
  }

  // ===================================================================== versão mestra
  function reloadState() {   // relê o que vem da versão mestra (ou das alterações deste aparelho) depois que a mestra carrega
    for (const k of Object.keys(SP)) delete SP[k]; Object.assign(SP, { dBica: 2.022, dBgs: 2.421, eai: null, rr: null, cap: null, xisto: 8 }, store.get('simPar', {}));
    SIM = store.get('simSel', {}); MESES = store.get('simMeses', null) || [ymNext(ymNow())]; MATV = Math.min(store.get('simMesAtv', 0), MESES.length - 1);
    BPO = store.get('britPar', {}); BBASE = store.get('britBase', null); BST = store.get('britSt', {}); OFIN = store.get('aprFin', {}); AV = null; LK = null;
    CVH = store.get('curvaHist', null); CVG = store.get('curvaGap', null); PP = ppLoad(); TRC = store.get('tracos', null);
  }
  function avMaster() { if (!AV) avLoad(); const c = JSON.parse(JSON.stringify(AV)); c.ts = Date.now(); return c; }
  function avIsLocal() { const l = store.get(AVKEY, null); const m = D.mestre && D.mestre.retigrafico; return !!(l && (!m || (l.ts || 0) > (m.ts || 0))); }

  // ===================================================================== início
  async function load(get) {
    const [medicao, medref, avanco, eixo, pranchas] = await Promise.all(['medicao.json', 'medref.json', 'avanco.json', 'eixo.json', 'pranchas.json'].map(f => get(f)));
    Object.assign(D, { medicao, medref, avanco, eixo, pranchas });
  }
  function unlock(medicao, medref, prot) {
    D.medShip = medicao; D.prot = prot || null; if (prot && prot.medicao && (prot.medicao.n || 0) >= (medicao.n || 0)) medicao = prot.medicao;
    Object.assign(D, { medicao, medref }); medInit(); MCELL = null; AV = null; LK = null;
    if (X.current() === 'avanco') renderAv(); if (X.current() === 'campo') renderCampo();
  }
  function init() {
    $('#m-sel').onchange = () => { const m = medAll().find(x => x.nome === $('#m-sel').value); if (m) { medSetActive(m); medOpen = null; renderMed(); } };
    $('#m-file').onchange = e => { const f = e.target.files[0]; if (f) medUpload(f); e.target.value = ''; };
    $('#m-del').onclick = () => { if (MED === D.medicao || !confirm('Remover a ' + MED.nome + ' do aparelho?')) return; store.set(medKey, medList().filter(n => n !== MED.nome)); try { localStorage.removeItem('pr990:med:' + MED.nome); } catch { } medSetActive(D.medicao); renderMed(); };
    ['#m-q', '#m-grp', '#m-tr'].forEach(s => $(s).addEventListener('input', renderMed)); $('#m-csv').onclick = exportMed;
    avInitEvents(); britInit(); aprInit(); planInit(); memInit(); ctInit(); campoInit(); cmpInit(); searchInit();
    $$('[data-print]').forEach(b => b.onclick = () => askPdf(b.dataset.print));
  }
  return { load, init, reloadState, avMaster, avIsLocal, protPayload, renderPlan, renderMem, renderCt, memSearch, memOpen, renderMed, renderAv, renderSim, renderBrit, renderApr, renderCampo, renderPr, unlock, renderCmpT, printView, data: D, toUTM, project };
}
