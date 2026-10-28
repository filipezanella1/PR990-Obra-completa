// uso: node tools/medicao.mjs <medição.xlsx> [saida.json]
import { readFileSync, writeFileSync } from 'fs';
import { parseMedicao } from '../src/medparse.js';
const f = process.argv[2]; const out = process.argv[3] || 'privado/medicao.json';
const t0 = Date.now();
const m = await parseMedicao(readFileSync(f), f.split('/').pop());
writeFileSync(out, JSON.stringify(m));
console.log(m.nome, m.itens.length, 'itens', m.itens.reduce((s, i) => s + i.r.length, 0), 'registros c/ estaca', (Date.now() - t0) + ' ms');
