// Módulos de obra: medição, retigráfico de avanço, campo (GPS), planejamento, pranchas, busca global e comparação de trechos.
// Recebe o contexto do app (X) para usar o motor de cálculo, a base e os utilitários sem duplicá-los.
import { parseMedicao } from './medparse.js?v=__BUILD__';

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
    if (!MED) return;
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
    const b = D.avanco;
    return { v: 2, fonte: b.fonte, data: b.data, frentes: b.frentes.map(f => ({ ...f })), oac: b.oac.map(o => ({ ...o })), oae: b.oae, atualizado: b.data };
  }
  function avLoad() { AV = store.get(AVKEY, null); if (!AV || AV.v !== 2 || !AV.frentes) AV = avDefault(); }
  function avSave() { AV.atualizado = today(); store.set(AVKEY, AV); }
  const stName = k => ST[k] || ST['0'];
  const cellLen = k => k >= 642 ? 15.817 : 20;
  function avStats(c) { const s = { '0': 0, '1': 0, '2': 0 }; for (let k = 0; k < NC; k++) s[c[k]] = (s[c[k]] || 0) + cellLen(k); return s; }
  const TOT = 642.79085 * 20;
  const oacName = st => st === 'c' ? 'concluído' : st === 'a' ? 'atacado' : 'não iniciado';
  function oacIcon(st) {
    const f = st === 'c' ? '#1f3864' : st === 'a' ? '#00b0f0' : '#fff';
    return `<svg viewBox="0 0 14 22" width="11" height="17" aria-hidden="true"><path d="M1 1h12l-3 5v10l3 5H1l3-5V6z" fill="${f}" stroke="#1f3864" stroke-width="1.4"/></svg>`;
  }
  function renderAv() {
    if (!AV) avLoad();
    $('#a-fonte').textContent = `${AV.fonte} · alterado em ${AV.atualizado.split('-').reverse().join('/')}`;
    $('#a-hl').checked = avHl; $('#a-hln').textContent = `Destacar o que foi medido na ${MED.n || ''}ª medição`;
    $('#a-brush').innerHTML = `<div class="avleg">${AV.frentes.map(f => `<span class="lg1"><b>${esc(f.n)}</b>${f.a ? `<i class="sw" style="background:${f.ca}"></i>atacado` : ''}<i class="sw" style="background:${f.cc}"></i>concluído</span>`).join('')}
      <span class="lg1"><b>OAC</b>${oacIcon('c')} concluído ${oacIcon('a')} atacado ${oacIcon('n')} não iniciado</span></div>`;
    $('#a-paint').classList.toggle('on', paintOn); $('#a-paint').textContent = paintOn ? 'Editando – toque para parar' : 'Editar o retigráfico';
    $('#v-avanco').classList.toggle('painting', paintOn);
    const oc = { c: 0, a: 0, n: 0 }; AV.oac.forEach(o => oc[o.st]++);
    $('#a-sum').innerHTML = `<table class="itbl avsum"><thead><tr><th>Frente</th><th class="n">Concluído</th><th class="n">Atacado (em execução)</th><th class="n">A executar</th><th class="n">Medido na ${MED.n || ''}ª</th><th style="width:30%">Avanço</th></tr></thead><tbody>` +
      AV.frentes.map(f => { const s = avStats(f.c); const mc = medCells()[f.id]; const p = k => s[k] / TOT;
        return `<tr><td><b>${esc(f.n)}</b></td><td class="n" data-l="Concluído">${fPc(p('2'))} <span class="note">${NF[2].format(s['2'] / 1000)} km</span></td><td class="n" data-l="Atacado">${f.a ? `${fPc(p('1'))} <span class="note">${NF[2].format(s['1'] / 1000)} km</span>` : '–'}</td>
          <td class="n" data-l="A executar">${fPc(p('0'))}</td><td class="n" data-l="Medido na ${MED.n || ''}ª">${mc && mc.size ? mc.size + ' est.' : '–'}</td>
          <td><div class="stk"><i style="width:${(p('2') * 100).toFixed(2)}%;background:${f.cc}"></i><i style="width:${(p('1') * 100).toFixed(2)}%;background:${f.ca || f.cc}"></i></div></td></tr>`; }).join('') +
      `<tr><td><b>OAC – bueiros e galerias</b></td><td class="n" data-l="Concluídos">${oc.c} de ${AV.oac.length}</td><td class="n" data-l="Atacados">${oc.a}</td><td class="n" data-l="Não iniciados">${oc.n}</td><td class="n">${medCells().oac.size ? medCells().oac.size + ' est.' : '–'}</td><td><div class="stk"><i style="width:${oc.c / AV.oac.length * 100}%;background:#1f3864"></i><i style="width:${oc.a / AV.oac.length * 100}%;background:#00b0f0"></i></div></td></tr></tbody></table>`;
    const sel = $('#a-lay'); const prev = [...sel.selectedOptions].map(o => o.value);
    sel.innerHTML = AV.frentes.map(f => `<option value="${f.id}" ${prev.includes(f.id) ? 'selected' : ''}>${esc(f.n)}</option>`).join('');
    $('#a-st').innerHTML = ['2', '1', '0'].map(k => `<option value="${k}">${esc(stName(k))}</option>`).join('');
    drawGrid();
  }
  function drawGrid() {
    const host = $('#a-grid'); const w = host.clientWidth || 1000;
    const labW = w < 700 ? 112 : 190, cw = w < 700 ? 15 : 17;
    const per = Math.max(10, Math.floor((w - labW - 4) / cw));
    const mc = avHl ? medCells() : {};
    let h = '';
    for (let s0 = 0; s0 < NC; s0 += per) {
      const s1 = Math.min(NC, s0 + per);
      const oa = AV.oac.map((o, i) => ({ o, i })).filter(({ o }) => o.e >= s0 && o.e < s1);
      const oe = (AV.oae || []).filter(o => o.e1 >= s0 && o.e0 < s1);
      h += `<div class="blk" style="--n:${s1 - s0};--cw:${cw}px;--lw:${labW}px"><div class="mrow">` +
        oe.map(o => `<span class="oae" style="left:calc(var(--lw) + ${(Math.max(o.e0, s0) - s0) * cw}px);width:${(Math.min(o.e1, s1) - Math.max(o.e0, s0)) * cw}px" title="${esc(o.n)}">OAE</span>`).join('') +
        oa.map(({ o, i }) => `<button type="button" class="oac ${o.st}${mc.oac && mc.oac.has(Math.floor(o.e)) ? ' m' : ''}" data-oac="${i}" style="left:calc(var(--lw) + ${(o.e - s0) * cw}px)" title="${esc(o.t)} · est. ${estStr(o.e)}${o.L ? ' · ' + o.L + ' m' : ''} · ${oacName(o.st)}">${oacIcon(o.st)}<span>${esc(o.t)}${o.L ? ' · ' + esc(o.L) + ' m' : ''}</span></button>`).join('') + '</div>';
      for (const f of AV.frentes) {
        const m = mc[f.id];
        const row = (sub, val, col) => { let r = `<div class="lrow ${sub}" data-id="${f.id}" data-sub="${val}"><span class="ln"><span class="fn">${sub === 'ra' || !f.a ? esc(f.n) : ''}</span><span class="sb">${val === '1' ? 'Atacado' : 'Concluído'}</span></span><div class="cells">`;
          for (let k = s0; k < s1; k++) r += `<i class="c${f.c[k] === val ? ' on' : ''}${m && val === '2' && m.has(k) ? ' m' : ''}" data-k="${k}"${f.c[k] === val ? ` style="background:${col}"` : ''}></i>`;
          return r + '</div></div>'; };
        h += `<div class="fgrp">${f.a ? row('ra', '1', f.ca) : ''}${row('rc', '2', f.cc)}</div>`;
      }
      h += `<div class="erow"><span class="ln">Estaca</span><div class="cells">${Array.from({ length: s1 - s0 }, (_, i) => `<b>${s0 + i}</b>`).join('')}</div></div></div>`;
    }
    host.innerHTML = h;
  }
  let avDirty = false, avDown = null;
  function avPaintAt(el, first) {
    const c = el && el.closest && el.closest('i.c'); if (!c) return;
    const row = c.closest('.lrow'); const f = AV.frentes.find(x => x.id === row.dataset.id); const k = +c.dataset.k; const val = row.dataset.sub;
    if (first) avDown = { id: f.id, val, to: f.c[k] === val ? '0' : val };
    if (!avDown || avDown.id !== f.id || avDown.val !== val) return;
    if (f.c[k] === avDown.to) return;
    f.c = f.c.slice(0, k) + avDown.to + f.c.slice(k + 1); avDirty = true;
    const grp = row.parentElement; grp.querySelectorAll(`i.c[data-k="${k}"]`).forEach(x => { const sv = x.closest('.lrow').dataset.sub; const on = f.c[k] === sv; x.classList.toggle('on', on); x.style.background = on ? (sv === '1' ? f.ca : f.cc) : ''; });
  }
  function avInitEvents() {
    const g = $('#a-grid');
    g.addEventListener('pointerdown', ev => { if (!paintOn || !ev.target.closest('i.c')) return; g.setPointerCapture(ev.pointerId); avPaintAt(ev.target, true); ev.preventDefault(); });
    g.addEventListener('pointermove', ev => { if (!paintOn || !avDown) return; avPaintAt(document.elementFromPoint(ev.clientX, ev.clientY)); });
    const up = () => { if (!avDown) return; avDown = null; if (avDirty) { avDirty = false; avSave(); renderAv(); } };
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    g.addEventListener('click', ev => {
      const ob = ev.target.closest('[data-oac]');
      if (ob) { const o = AV.oac[+ob.dataset.oac];
        if (paintOn) { o.st = { n: 'a', a: 'c', c: 'n' }[o.st]; avSave(); renderAv(); $('#a-tip').textContent = `${o.t} (est. ${estStr(o.e)}): ${oacName(o.st)}.`; }
        else $('#a-tip').textContent = `${o.t} · estaca ${estStr(o.e)}${o.L ? ' · ' + o.L + ' m' : ''}: ${oacName(o.st)}.${o.obs ? ' ' + o.obs + '.' : ''} Em “Editar”, toque no ícone para trocar a situação.`; return; }
      if (paintOn) return; const c = ev.target.closest('i.c'); if (!c) return; const f = AV.frentes.find(x => x.id === c.closest('.lrow').dataset.id); const k = +c.dataset.k;
      const m = medCells()[f.id]?.get(k);
      $('#a-tip').textContent = `${f.n} · estaca ${k} a ${k + 1}: ${stName(f.c[k])}.${m ? ` Medido na ${MED.n}ª medição: ${[...m].join(', ')}.` : ''} Em “Editar”, toque na linha Atacado ou Concluído para marcar ou desmarcar.`; });
    $('#a-hl').onchange = () => { avHl = $('#a-hl').checked; store.set('avHl', avHl); drawGrid(); };
    $('#a-paint').onclick = () => { paintOn = !paintOn; renderAv(); };
    $('#a-apply').onclick = () => {
      const a = parseEstIn($('#a-ei').value), b = parseEstIn($('#a-ef').value), k = $('#a-st').value; const ids = [...$('#a-lay').selectedOptions].map(o => o.value);
      if (a === null || b === null || !ids.length) { $('#a-tip').textContent = 'Informe estaca inicial, final e ao menos uma frente.'; return; }
      const i0 = Math.max(0, Math.floor(Math.min(a, b))), i1 = Math.min(NC - 1, Math.ceil(Math.max(a, b)) - 1);
      for (const f of AV.frentes) if (ids.includes(f.id)) { const kk = k === '1' && !f.a ? '2' : k; const c = f.c.split(''); for (let i = i0; i <= Math.max(i0, i1); i++) c[i] = kk; f.c = c.join(''); }
      avSave(); renderAv(); $('#a-tip').textContent = `Aplicado: ${stName(k)} da estaca ${i0} a ${Math.max(i0, i1) + 1} em ${ids.length} frente(s).`;
    };
    $('#a-add').onclick = () => { const n = prompt('Nome da nova frente (ex.: Sarjetas, Drenos, Sinalização horizontal):'); if (!n) return; const pc = PAL[AV.frentes.length % PAL.length]; AV.frentes.push({ id: 'u' + Date.now(), n: n.trim(), a: true, ca: pc[0], cc: pc[1], c: '0'.repeat(NC) }); avSave(); renderAv(); };
    $('#a-ren').onclick = () => { const ids = [...$('#a-lay').selectedOptions].map(o => o.value); if (ids.length !== 1) { $('#a-tip').textContent = 'Selecione uma frente na lista para renomear ou remover.'; return; } const f = AV.frentes.find(x => x.id === ids[0]); const n = prompt('Novo nome (deixe vazio para remover a frente):', f.n); if (n === null) return; if (!n.trim()) { if (confirm('Remover a frente “' + f.n + '”?')) AV.frentes = AV.frentes.filter(x => x !== f); } else f.n = n.trim(); avSave(); renderAv(); };
    $('#a-reset').onclick = () => { if (!confirm('Voltar ao retigráfico de ' + D.avanco.data.split('-').reverse().join('/') + '? As alterações feitas no app serão perdidas (exporte antes, se quiser guardar).')) return; AV = avDefault(); avSave(); renderAv(); };
    $('#a-exp').onclick = () => download(`retigrafico_PR-990_${today()}.json`, JSON.stringify(AV), 'application/json');
    $('#a-csv').onclick = () => { const L = [['Estaca inicial', 'Estaca final', ...AV.frentes.map(f => f.n)]]; for (let k = 0; k < NC; k++) L.push([k, Math.min(k + 1, 642.79085), ...AV.frentes.map(f => stName(f.c[k]))]); L.push([], ['OAC', 'Estaca', 'Comprimento (m)', 'Situação']); for (const o of AV.oac) L.push([o.t, estStr(o.e), o.L || '', oacName(o.st)]); download(`retigrafico_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n')); };
    $('#a-imp').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.frentes) throw new Error('arquivo de outro modelo de retigráfico'); AV = { ...avDefault(), ...j, v: 2 }; avSave(); renderAv(); $('#a-tip').textContent = 'Retigráfico importado.'; } catch (e) { $('#a-tip').textContent = 'Arquivo inválido: ' + e.message; } ev.target.value = ''; };
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (X.current() === 'avanco') drawGrid(); }, 200); });
  }
  const parseEstIn = s => { s = String(s || '').trim().replace(/\s/g, ''); if (!s) return null; if (s.includes('+')) { const [e, m] = s.split('+'); const v = +e + (parseFloat(m.replace(',', '.')) || 0) / 20; return Number.isFinite(v) ? v : null; } const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : null; };
  function avAt(k) { if (!AV) avLoad(); k = Math.max(0, Math.min(NC - 1, Math.floor(k))); return AV.frentes.map(f => ({ n: f.n, k: f.c[k], col: f.c[k] === '2' ? f.cc : f.c[k] === '1' ? f.ca : '#fff' })); }
  function oacNear(est, r) { if (!AV) avLoad(); return AV.oac.filter(o => Math.abs(o.e - est) * 20 <= r); }

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
      ${(() => { const L = MED.itens.map(it => { const q = it.r.filter(r => r[4] === MED.n && (r[1] !== null && r[1] > r[0] ? est >= r[0] - 1e-9 && est <= r[1] + 1e-9 : Math.abs(r[0] - est) <= 0.5)).reduce((s, r) => s + r[3], 0); return { it, q }; }).filter(o => Math.abs(o.q) > 1e-9);
        return L.length ? `<div class="avst"><span class="label">Medido aqui na ${MED.n}ª medição</span>${L.map(o => `<span class="avchip"><b>${esc(o.it.c)}</b>&nbsp;${esc(o.it.s.slice(0, 48))} · ${fQ(o.q)} ${esc(o.it.u)}</span>`).join('')}</div>` : ''; })()}
      <div class="here-act"><button class="btn" type="button" id="g-tr">Usar como trecho no painel (± 1 estaca)</button><button class="btn" type="button" id="g-av">Ver no retigráfico</button></div></div>`;
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

  // ===================================================================== PLANEJAMENTO
  const PL = Object.assign({ base: 'saldo', ini: nextMonday(), h: 9, dsem: 5, frentes: {}, serv: {} }, store.get('plan', {}));
  function nextMonday() { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); }
  const plSave = () => store.set('plan', PL);
  function workDays(start, n, dsem) {   // índice de dia útil → data (seg–sex, ou seg–sáb)
    const out = []; const d = new Date(start + 'T12:00:00'); let c = 0;
    while (out.length < n && c < 5000) { const wd = d.getDay(); if (wd !== 0 && (dsem === 6 || wd !== 6)) out.push(new Date(d)); d.setDate(d.getDate() + 1); c++; }
    return out;
  }
  function plServ() {
    const rows = medRows(); const byL = new Map(rows.map(r => [r.l, r]));
    const out = [];
    for (const d of M().disciplinas) {
      for (const l of d.linhas) {
        if (l.t !== 'it' || !l.ct) continue;
        const projT = num(C('H' + l.r)); const mr = byL.get(l.ct);
        let q = projT;
        if (PL.base === 'saldo' && mr) { const share = mr.prevT ? projT / mr.prevT : 0; q = Math.max(0, projT - mr.medT * share); }
        if (q <= 1e-6) continue;
        const cons = INS().consumos[l.c] || []; const prodH = INS().prod?.[l.c] || null;
        const cfg = PL.serv[l.c] || {}; const pd = cfg.pd ?? (prodH ? prodH * PL.h : null);
        out.push({ d, l, q, cons, prodH, pd, eq: cons.filter(x => x[0] === 'Equipamento'), dl: cons.filter(x => x[0] === 'Diesel').reduce((s, x) => s + x[4], 0) });
      }
    }
    return out;
  }
  function plCalc() {
    const sv = plServ(); const fr = new Map();
    for (const s of sv) { const k = s.d.num; if (!fr.has(k)) fr.set(k, { d: s.d, sv: [] }); fr.get(k).sv.push(s); }
    const meses = new Map(); let fim = 0;
    for (const f of fr.values()) {
      const cfg = PL.frentes[f.d.num] || {}; f.modo = cfg.modo || 'paralelo'; f.off = cfg.off || 0; f.eqp = cfg.eqp || 1;
      let t = f.off; f.dias = 0; f.crit = null;
      for (const s of f.sv) {
        s.pdE = s.pd ? s.pd * f.eqp : 0;
        s.dias = s.pdE > 0 ? Math.ceil(s.q / s.pdE) : 0; if (!f.crit || s.dias > f.crit.dias) f.crit = s; s.ini = f.modo === 'sequencial' ? t : f.off; s.fim = s.ini + s.dias;
        if (f.modo === 'sequencial') t = s.fim; f.dias = Math.max(f.dias, s.fim - f.off);
      }
      fim = Math.max(fim, f.off + f.dias);
    }
    const cal = workDays(PL.ini, Math.max(1, fim) + 1, PL.dsem);
    const mk = d => d.toISOString().slice(0, 7);
    for (const f of fr.values()) for (const s of f.sv) {
      if (!s.dias) continue;
      for (let i = s.ini; i < s.fim; i++) {
        const m = mk(cal[i]); if (!meses.has(m)) meses.set(m, { m, q: {}, dl: 0, eq: {}, lab: {}, serv: new Set() });
        const o = meses.get(m); const qd = Math.min(s.pdE, s.q - (i - s.ini) * s.pdE);
        o.dl += qd * s.dl; o.serv.add(s.l.c);
        for (const c of s.cons) if (c[5]) o.lab[c[5]] = (o.lab[c[5]] || 0) + qd * c[4];
        for (const e of s.eq) o.eq[e[2] + '§' + s.l.c] = Math.ceil(s.pdE * e[4] / PL.h - 1e-9);
      }
    }
    // equipamentos por mês = soma, entre os serviços ativos no mês, das unidades necessárias de cada equipamento
    for (const o of meses.values()) { const eq = {}; for (const [k, v] of Object.entries(o.eq)) { if (!k.includes('§')) continue; const n = k.split('§')[0]; eq[n] = (eq[n] || 0) + v; } o.eqT = eq; }
    return { fr: [...fr.values()], meses: [...meses.values()].sort((a, b) => a.m.localeCompare(b.m)), fim, cal };
  }
  const mesNome = m => { const [y, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm - 1] + '/' + y.slice(2); };
  const fDate = d => d ? d.toLocaleDateString('pt-BR') : '–';
  function renderPlan() {
    const [a, b] = trecho(); $('#p-trecho').textContent = `${estStr(a)} → ${estStr(b)}`;
    $('#p-base').value = PL.base; $('#p-ini').value = PL.ini; $('#p-h').value = PL.h; $('#p-dsem').value = String(PL.dsem);
    const R = plCalc(); const cal = R.cal;
    const tot = R.meses.reduce((o, m) => { o.dl += m.dl; return o; }, { dl: 0 });
    $('#p-kpis').innerHTML = [['PRAZO TOTAL', `${R.fim} dias úteis`, `${fDate(cal[0])} → ${fDate(cal[Math.max(0, R.fim - 1)])}`], ['FRENTES', String(R.fr.length), `${R.fr.reduce((s, f) => s + f.sv.length, 0)} serviços com quantidade`], ['DIESEL', NF[0].format(tot.dl) + ' L', 'no período'], ['MESES', String(R.meses.length), R.meses.length ? mesNome(R.meses[0].m) + ' a ' + mesNome(R.meses[R.meses.length - 1].m) : '']]
      .map(([l, v, c]) => `<div class="kpi"><span class="label">${l}</span><span class="v num">${esc(v)}</span><span class="c">${esc(c)}</span></div>`).join('');
    // gantt por frente
    const W = Math.max(1, R.fim);
    $('#p-gantt').innerHTML = `<div class="gantt">${R.fr.map(f => `<div class="gr"><span class="gl">${esc(f.d.curto)}</span><div class="gt"><i style="left:${f.off / W * 100}%;width:${Math.max(0.5, f.dias / W * 100)}%" title="${f.dias} dias úteis"></i></div><span class="gd">${f.dias} d · até ${fDate(cal[Math.max(0, f.off + f.dias - 1)])}${f.crit && f.crit.dias ? `<br>crítico: ${esc(f.crit.l.n.slice(0, 38))}` : ''}</span></div>`).join('')}</div>
      <div class="gax">${R.meses.filter((m, i, a) => i % Math.max(1, Math.ceil(a.length / 10)) === 0).map(m => `<span>${mesNome(m.m)}</span>`).join('')}</div>`;
    // frentes e serviços
    $('#p-fr').innerHTML = R.fr.map(f => `<details class="disc" ${PL.frentes[f.d.num]?.open ? 'open' : ''} data-f="${f.d.num}"><summary><span class="no">${esc(f.d.num)}</span><span class="t">${esc(f.d.titulo)}</span><span class="v">${f.dias} dias úteis</span><span class="v">equipes <input class="pin" type="number" min="1" max="50" value="${f.eqp}" data-eqp="${f.d.num}" aria-label="Número de equipes da frente"> · início no dia <input class="pin" type="number" min="0" value="${f.off}" data-off="${f.d.num}" aria-label="Início da frente (dia útil)"> · <select data-modo="${f.d.num}" aria-label="Execução dos serviços"><option value="paralelo" ${f.modo === 'paralelo' ? 'selected' : ''}>serviços em paralelo</option><option value="sequencial" ${f.modo === 'sequencial' ? 'selected' : ''}>em sequência</option></select></span></summary>
      <div class="tbl-wrap"><table class="itbl plan"><thead><tr><th>Código</th><th>Serviço</th><th class="n">Quantidade</th><th class="n">Equipe CPU (un/h)</th><th class="n">Produção diária (1 equipe)</th><th class="n">Dias úteis</th><th>Equipamentos (un)</th></tr></thead><tbody>
      ${f.sv.map(s => `<tr><td class="code">${esc(s.l.c)}</td><td>${esc(s.l.n)}</td><td class="n" data-l="Quantidade">${fQ(s.q)} ${esc(s.l.u)}</td><td class="n" data-l="Equipe CPU">${s.prodH ? NF[2].format(s.prodH) : '–'}</td>
        <td class="n" data-l="Produção / dia (${esc(s.l.u)})"><input class="pin" inputmode="decimal" data-pd="${esc(s.l.c)}" value="${s.pd ? NF[2].format(s.pd).replace(/\./g, '') : ''}" placeholder="informe"></td><td class="n" data-l="Dias"><b>${s.dias || '–'}</b></td>
        <td class="src">${s.eq.length && s.pdE ? s.eq.map(e => `${Math.ceil(s.pdE * e[4] / PL.h - 1e-9)}× ${esc(e[2])}`).join(' · ') : ''}</td></tr>`).join('')}</tbody></table></div></details>`).join('') || '<p class="note">Nenhum serviço com quantidade a executar no trecho.</p>';
    $$('#p-fr details').forEach(el => el.addEventListener('toggle', () => { const k = el.dataset.f; PL.frentes[k] = { ...(PL.frentes[k] || {}), open: el.open }; plSave(); }));
    $$('#p-fr [data-off]').forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => { const k = i.dataset.off; PL.frentes[k] = { ...(PL.frentes[k] || {}), off: Math.max(0, parseInt(i.value) || 0) }; plSave(); renderPlan(); }; });
    $$('#p-fr [data-eqp]').forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => { const k = i.dataset.eqp; PL.frentes[k] = { ...(PL.frentes[k] || {}), eqp: Math.max(1, parseInt(i.value) || 1) }; plSave(); renderPlan(); }; });
    $$('#p-fr [data-modo]').forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => { const k = i.dataset.modo; PL.frentes[k] = { ...(PL.frentes[k] || {}), modo: i.value }; plSave(); renderPlan(); }; });
    $$('#p-fr [data-pd]').forEach(i => i.onchange = () => { const v = parseFloat(i.value.replace(/\./g, '').replace(',', '.')); const c = i.dataset.pd; PL.serv[c] = { ...(PL.serv[c] || {}) }; if (Number.isFinite(v) && v > 0) PL.serv[c].pd = v; else delete PL.serv[c].pd; plSave(); renderPlan(); });
    // tabela mensal
    const labs = INS().labels.filter(lb => R.meses.some(m => (m.lab[lb] || 0) > 1e-6));
    const eqs = [...new Set(R.meses.flatMap(m => Object.keys(m.eqT)))].sort((x, y) => Math.max(...R.meses.map(m => m.eqT[y] || 0)) - Math.max(...R.meses.map(m => m.eqT[x] || 0)));
    $('#p-mes').innerHTML = R.meses.length ? `<table class="plm"><thead><tr><th></th>${R.meses.map(m => `<th class="n">${mesNome(m.m)}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
      <tr class="grp"><td colspan="${R.meses.length + 2}">Diesel e materiais</td></tr>
      <tr><td>Diesel (L)</td>${R.meses.map(m => `<td class="n">${NF[0].format(m.dl)}</td>`).join('')}<td class="n"><b>${NF[0].format(tot.dl)}</b></td></tr>
      ${labs.filter(lb => !/^Diesel/.test(lb)).map(lb => `<tr><td>${esc(lb)}</td>${R.meses.map(m => `<td class="n">${fQ(m.lab[lb] || 0, 0)}</td>`).join('')}<td class="n"><b>${fQ(R.meses.reduce((s, m) => s + (m.lab[lb] || 0), 0), 0)}</b></td></tr>`).join('')}
      <tr class="grp"><td colspan="${R.meses.length + 2}">Equipamentos necessários (unidades no mês)</td></tr>
      ${eqs.map(e => `<tr><td>${esc(e)}</td>${R.meses.map(m => `<td class="n">${m.eqT[e] || '–'}</td>`).join('')}<td class="n"><b>${Math.max(...R.meses.map(m => m.eqT[e] || 0))}</b> pico</td></tr>`).join('')}
      </tbody></table>` : '<p class="note">Informe a produção diária dos serviços para montar o cronograma.</p>';
    PL._last = R;
  }
  function exportPlan() {
    const R = PL._last || plCalc(); const L = [['Frente', 'Código', 'Serviço', 'Un', 'Quantidade', 'Produção diária', 'Início (dia útil)', 'Dias úteis', 'Início', 'Término']];
    for (const f of R.fr) for (const s of f.sv) L.push([f.d.titulo, s.l.c, s.l.n, s.l.u, s.q, s.pd || '', s.ini, s.dias, s.dias ? fDate(R.cal[s.ini]) : '', s.dias ? fDate(R.cal[s.fim - 1]) : '']);
    L.push([]); L.push(['Mês', 'Diesel (L)', ...INS().labels]);
    for (const m of R.meses) L.push([mesNome(m.m), m.dl, ...INS().labels.map(lb => m.lab[lb] || 0)]);
    L.push([]); const eqs = [...new Set(R.meses.flatMap(m => Object.keys(m.eqT)))]; L.push(['Equipamento', ...R.meses.map(m => mesNome(m.m))]);
    for (const e of eqs) L.push([e, ...R.meses.map(m => m.eqT[e] || 0)]);
    download(`planejamento_PR-990_${today()}.csv`, L.map(r => r.map(csvCell).join(';')).join('\n'));
  }
  function planInit() {
    $('#p-base').onchange = () => { PL.base = $('#p-base').value; plSave(); renderPlan(); };
    $('#p-ini').onchange = () => { PL.ini = $('#p-ini').value || nextMonday(); plSave(); renderPlan(); };
    $('#p-h').onchange = () => { PL.h = Math.max(1, Math.min(24, parseFloat($('#p-h').value) || 9)); plSave(); renderPlan(); };
    $('#p-dsem').onchange = () => { PL.dsem = +$('#p-dsem').value; plSave(); renderPlan(); };
    $('#p-csv').onclick = exportPlan;
    $('#p-reset').onclick = () => { if (!confirm('Voltar todas as produções diárias às das equipes das CPUs?')) return; PL.serv = {}; plSave(); renderPlan(); };
  }

  // ===================================================================== PRANCHAS (outras disciplinas)
  const DISC = [
    { id: 'pav', n: 'Pavimentação' }, { id: 'sin', n: 'Sinalização' }, { id: 'oae', n: 'OAE – ponte' }, { id: 'oc', n: 'Obras complementares' }, { id: 'cont', n: 'Contenções' }, { id: 'ilu', n: 'Iluminação' }];
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
    for (const c of M().contrato) if (norm(c.codigo + ' ' + c.servico).includes(n)) add('Contrato × projeto', `${c.codigo} · ${c.servico}`, c.grupo, () => { location.hash = '#contrato'; $('#c-q').value = c.codigo; X.renderCmp(); });
    for (const f of X.DRF) { const ty = new Set(); for (const r of [...tab('Drenagem linear'), ...tab('Drenagem pontual')]) { const d = String(r['Dispositivo'] || '').trim(); if (f.re.test(d) && norm(d + ' ' + f.n).includes(n)) ty.add(d); } if (ty.size || norm(f.n).includes(n)) add('Drenagem', f.n, [...ty].slice(0, 6).join(', '), () => { location.hash = '#drenagem'; $('#dr-q').value = q; X.renderDrenagem(); }); }
    for (const [s, t] of Object.entries(X.SHEETS)) if (norm('DR-4-' + s + ' ' + t).includes(n)) add('Pranchas', `DR-4-${s} · ${t}`, 'Drenagem – detalhe tipo', () => X.lbOpen(s));
    for (const p of D.pranchas || []) if (norm(p.id + ' ' + p.t + ' ' + DISC.find(d => d.id === p.d).n).includes(n)) add('Pranchas', `${p.id} · ${p.t}`, DISC.find(d => d.id === p.d).n, () => prOpenSheet(p.id));
    const seen = new Set(); for (const [c, rows] of Object.entries(INS().consumos)) for (const r of rows) { const k = r[0] + r[1]; if (!seen.has(k) && norm(r[1] + ' ' + r[2]).includes(n)) { seen.add(k); add('Insumos', `${r[2]}`, `${r[0]} · código ${r[1]}`, () => { location.hash = '#insumos'; $('#i-q2').value = r[2]; X.renderIns(); }); } }
    for (const l of (AV || { frentes: [] }).frentes) if (norm(l.n).includes(n)) add('Avanço', l.n, 'Frente do retigráfico', () => { location.hash = '#avanco'; });
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
  function printView(v) {
    const opened = [];
    if (v === 'painel') $$('#detail details.disc').forEach(d => { if (!d.open) { d.open = true; opened.push(d); } });
    if (v === 'planejamento') $$('#p-fr details').forEach(d => { if (!d.open) { d.open = true; opened.push(d); } });
    document.body.dataset.print = v;
    const [a, b] = trecho(); const old = document.title; document.title = `PR-990 – ${({ painel: 'Painel', insumos: 'Insumos', medicao: 'Medição', avanco: 'Retigráfico', planejamento: 'Planejamento' })[v] || v} – ${estStr(a)} a ${estStr(b)}`;
    $('#print-head').textContent = `${document.title} · emitido em ${new Date().toLocaleDateString('pt-BR')}`;
    const done = () => { opened.forEach(d => d.open = false); delete document.body.dataset.print; document.title = old; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
  }

  // ===================================================================== início
  async function load(get) {
    const [medicao, medref, avanco, eixo, pranchas] = await Promise.all(['medicao.json', 'medref.json', 'avanco.json', 'eixo.json', 'pranchas.json'].map(f => get(f)));
    Object.assign(D, { medicao, medref, avanco, eixo, pranchas });
  }
  function init() {
    medInit();
    $('#m-sel').onchange = () => { const m = medAll().find(x => x.nome === $('#m-sel').value); if (m) { medSetActive(m); medOpen = null; renderMed(); } };
    $('#m-file').onchange = e => { const f = e.target.files[0]; if (f) medUpload(f); e.target.value = ''; };
    $('#m-del').onclick = () => { if (MED === D.medicao || !confirm('Remover a ' + MED.nome + ' do aparelho?')) return; store.set(medKey, medList().filter(n => n !== MED.nome)); try { localStorage.removeItem('pr990:med:' + MED.nome); } catch { } medSetActive(D.medicao); renderMed(); };
    ['#m-q', '#m-grp', '#m-tr'].forEach(s => $(s).addEventListener('input', renderMed)); $('#m-csv').onclick = exportMed;
    avInitEvents(); campoInit(); planInit(); cmpInit(); searchInit();
    $$('[data-print]').forEach(b => b.onclick = () => printView(b.dataset.print));
  }
  return { load, init, renderMed, renderAv, renderCampo, renderPlan, renderPr, renderCmpT, printView, data: D, toUTM, project };
}
