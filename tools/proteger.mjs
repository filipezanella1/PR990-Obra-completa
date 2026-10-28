// Cifra os dados das abas protegidas (Medição, Contrato × projeto, Discrepâncias, Base de dados) em data/protegido.json.
// Os originais ficam em privado/ (fora do Git). uso: PR990_SENHA='...' node tools/proteger.mjs
import { readFileSync, writeFileSync } from 'fs';
import { webcrypto as C } from 'crypto';
const senha = process.env.PR990_SENHA; if (!senha || senha.length < 8) { console.error('defina PR990_SENHA (mínimo 8 caracteres)'); process.exit(1); }
const j = f => JSON.parse(readFileSync('privado/' + f, 'utf8'));
const { contrato, discrepancias } = j('contrato.json');
const plain = new TextEncoder().encode(JSON.stringify({ medicao: j('medicao.json'), medref: j('medref.json'), contrato, discrepancias }));
const salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12)), iter = 310000;
const base = await C.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
const key = await C.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const ct = new Uint8Array(await C.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
const b64 = u => Buffer.from(u).toString('base64');
writeFileSync('data/protegido.json', JSON.stringify({ v: 1, alg: 'PBKDF2-SHA256/AES-256-GCM', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
console.log('data/protegido.json', Math.round(ct.length / 1024), 'KB cifrados');
