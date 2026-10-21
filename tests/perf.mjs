import fs from 'fs'; import { Workbook } from '../src/engine.js';
const base = JSON.parse(fs.readFileSync('data/base.json')); const painel = JSON.parse(fs.readFileSync('data/painel.json'));
const wb = new Workbook(base, painel.cells); const all = Object.keys(painel.cells);
let t = Date.now(); wb.buildDeps(); console.log('deps', Date.now() - t, 'ms');
t = Date.now(); all.forEach(a => wb.cell(a)); console.log('1º cálculo', Date.now() - t, 'ms');
for (const [e1, e2] of [[100, 108], [0, 300], [300, 642]]) { t = Date.now(); wb.set('E7', e1); wb.set('E8', e2); all.forEach(a => wb.cell(a)); console.log('trecho', e1, e2, Date.now() - t, 'ms', wb.cell('J' + 478)); }
