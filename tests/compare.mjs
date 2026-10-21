// Compara o motor JS com os valores calculados pelo Excel/LibreOffice.
// uso: node tests/compare.mjs data/ref_painel.json [ei mi ef mf]
import fs from 'fs';
import { Workbook, isErr } from '../src/engine.js';
const base = JSON.parse(fs.readFileSync('data/base.json')); const painel = JSON.parse(fs.readFileSync('data/painel.json'));
const ref = JSON.parse(fs.readFileSync(process.argv[2]));
const wb = new Workbook(base, painel.cells);
const inp = process.argv.slice(3).map(Number);
if (inp.length === 4) { wb.set('E7', inp[0]); wb.set('F7', inp[1]); wb.set('E8', inp[2]); wb.set('F8', inp[3]); }
let n = 0, bad = 0, errs = 0; const t0 = Date.now(); const out = [];
for (const [addr, raw] of Object.entries(painel.cells)) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) continue;
  let v; try { v = wb.cell(addr); } catch (e) { errs++; if (errs < 6) console.log('EXC', addr, e.message.slice(0, 200)); continue; }
  const r = ref[addr]; n++;
  if (typeof r === 'number') { const vv = typeof v === 'boolean' ? +v : v; if (typeof vv !== 'number' || Math.abs(vv - r) > 1e-6 * Math.max(1, Math.abs(r))) { bad++; out.push([addr, r, isErr(v) ? v.code : v]); } }
  else if (typeof r === 'string' && /^#/.test(r)) { if (!isErr(v)) { bad++; out.push([addr, r, v]); } }
}
console.log(`células: ${n} · divergentes: ${bad} · exceções: ${errs} · ${Date.now() - t0} ms`);
out.slice(0, 25).forEach(x => console.log('  ', x[0], JSON.stringify(x[1]), '→', JSON.stringify(x[2]), '|', String(painel.cells[x[0]]).slice(0, 120)));
process.exit(bad || errs ? 1 : 0);
