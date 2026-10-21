// Motor de fórmulas – subconjunto do Excel usado no Painel PR-990.
// Avalia as fórmulas exportadas da planilha sobre as abas de origem (valores) e as entradas do usuário.
// Funciona no navegador e no Node (ES module).

class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const ERR = { div0: new XErr('#DIV/0!'), value: new XErr('#VALUE!'), na: new XErr('#N/A'), ref: new XErr('#REF!'), name: new XErr('#NAME?') };
const isErr = v => v instanceof XErr;

// ---------- endereços
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function parseAddr(a) { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a); if (!m) return null; return { c: colNum(m[1]), r: +m[2] }; }

// ---------- tokenizer
function tokenize(f) {
  const t = []; let i = 0; const n = f.length;
  while (i < n) {
    const ch = f[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '"') { let j = i + 1, s = ''; while (j < n) { if (f[j] === '"') { if (f[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += f[j++]; } t.push({ k: 'str', v: s }); i = j + 1; continue; }
    if (ch === "'") { // 'Sheet name'!ref
      let j = i + 1, s = ''; while (j < n) { if (f[j] === "'") { if (f[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += f[j++]; }
      j++; if (f[j] !== '!') throw new Error('sheet ref sem !: ' + f.slice(i, j + 5));
      j++; const m = /^\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?/.exec(f.slice(j)); if (!m) throw new Error('ref inválida ' + f.slice(i, j + 10));
      t.push({ k: 'ref', sheet: s, v: m[0] }); i = j + m[0].length; continue;
    }
    if (/[0-9.]/.test(ch)) { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(f.slice(i)); t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (/[A-Za-zÀ-ú_$]/.test(ch)) {
      const rest = f.slice(i);
      let m = /^([A-Za-zÀ-ú_][A-Za-zÀ-ú0-9_.]*)!(\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?)/.exec(rest);
      if (m) { t.push({ k: 'ref', sheet: m[1], v: m[2] }); i += m[0].length; continue; }
      m = /^\$?[A-Z]+\$?\d+(:\$?[A-Z]+\$?\d+)?(?![A-Za-z0-9_(])/.exec(rest);
      if (m) { t.push({ k: 'ref', sheet: null, v: m[0] }); i += m[0].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
      if (m && f[i + m[0].length] === '(') { t.push({ k: 'fn', v: m[0].toUpperCase() }); i += m[0].length; continue; }
      if (m && /^(TRUE|FALSE)$/i.test(m[0])) { t.push({ k: 'bool', v: m[0].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
      throw new Error('token desconhecido: ' + rest.slice(0, 20));
    }
    const two = f.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>(),%'.includes(ch)) { t.push({ k: ch === '(' || ch === ')' || ch === ',' ? ch : 'op', v: ch }); i++; continue; }
    throw new Error('caractere inesperado: ' + ch + ' em ' + f.slice(i, i + 20));
  }
  return t;
}

// ---------- parser (precedência Excel)
function parse(f) {
  const t = tokenize(f); let p = 0;
  const peek = () => t[p]; const next = () => t[p++];
  const isOp = (...ops) => t[p] && t[p].k === 'op' && ops.includes(t[p].v);
  function cmp() { let a = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const o = next().v; a = { k: 'bin', o, a, b: cat() }; } return a; }
  function cat() { let a = add(); while (isOp('&')) { next(); a = { k: 'bin', o: '&', a, b: add() }; } return a; }
  function add() { let a = mul(); while (isOp('+', '-')) { const o = next().v; a = { k: 'bin', o, a, b: mul() }; } return a; }
  function mul() { let a = pow(); while (isOp('*', '/')) { const o = next().v; a = { k: 'bin', o, a, b: pow() }; } return a; }
  function pow() { let a = un(); while (isOp('^')) { next(); a = { k: 'bin', o: '^', a, b: un() }; } return a; }
  function un() { if (isOp('-')) { next(); return { k: 'neg', a: un() }; } if (isOp('+')) { next(); return un(); } return pct(); }
  function pct() { let a = prim(); while (isOp('%')) { next(); a = { k: 'bin', o: '/', a, b: { k: 'num', v: 100 } }; } return a; }
  function prim() {
    const tk = next(); if (!tk) throw new Error('fim inesperado em ' + f);
    if (tk.k === 'num' || tk.k === 'str' || tk.k === 'bool') return { k: tk.k, v: tk.v };
    if (tk.k === 'ref') return { k: 'ref', sheet: tk.sheet, v: tk.v };
    if (tk.k === '(') { const e = cmp(); if (next().k !== ')') throw new Error(') esperado em ' + f); return e; }
    if (tk.k === 'fn') {
      next(); const args = [];
      if (peek().k !== ')') { for (;;) { if (peek().k === ',') { args.push({ k: 'empty' }); } else args.push(cmp()); if (peek().k === ',') { next(); continue; } break; } }
      if (next().k !== ')') throw new Error(') esperado após args em ' + f);
      return { k: 'fn', f: tk.v, args };
    }
    throw new Error('token inesperado ' + JSON.stringify(tk) + ' em ' + f.slice(0, 80));
  }
  const e = cmp(); if (p !== t.length) throw new Error('sobra de tokens em ' + f.slice(0, 80)); return e;
}

// ---------- valores matriciais
class Arr { constructor(rows, cols, data) { this.rows = rows; this.cols = cols; this.data = data; } }
const toNum = v => { if (v === null || v === undefined || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (isErr(v)) return v; const x = Number(v); return Number.isFinite(x) ? x : ERR.value; };
const toStr = v => { if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return numToStr(v); return String(v); };
function numToStr(x) { if (Number.isInteger(x)) return String(x); let s = x.toPrecision(15); if (s.includes('e')) return String(x); s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; }
function cmpVals(a, b) { // ordem Excel: números < texto < lógicos; vazio = 0 ou ""
  const ta = a === null || a === undefined ? 'e' : typeof a, tb = b === null || b === undefined ? 'e' : typeof b;
  if (ta === 'e' && tb === 'e') return 0;
  if (ta === 'e') a = tb === 'string' ? '' : tb === 'boolean' ? false : 0;
  if (tb === 'e') b = ta === 'string' ? '' : ta === 'boolean' ? false : 0;
  const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return a < b ? -1 : a > b ? 1 : 0;
}
function binScalar(o, a, b) {
  if (isErr(a)) return a; if (isErr(b)) return b;
  if (o === '&') return toStr(a) + toStr(b);
  if (['=', '<>', '<', '>', '<=', '>='].includes(o)) { const c = cmpVals(a, b); return o === '=' ? c === 0 : o === '<>' ? c !== 0 : o === '<' ? c < 0 : o === '>' ? c > 0 : o === '<=' ? c <= 0 : c >= 0; }
  const x = toNum(a), y = toNum(b); if (isErr(x)) return x; if (isErr(y)) return y;
  switch (o) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return y === 0 ? ERR.div0 : x / y; case '^': return Math.pow(x, y); }
}
function bin(o, a, b) {
  if (a instanceof Arr || b instanceof Arr) {
    const A = a instanceof Arr ? a : null, B = b instanceof Arr ? b : null;
    const rows = Math.max(A ? A.rows : 1, B ? B.rows : 1), cols = Math.max(A ? A.cols : 1, B ? B.cols : 1);
    const out = new Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const av = A ? A.data[(A.rows === 1 ? 0 : r) * A.cols + (A.cols === 1 ? 0 : c)] : a;
      const bv = B ? B.data[(B.rows === 1 ? 0 : r) * B.cols + (B.cols === 1 ? 0 : c)] : b;
      out[r * cols + c] = binScalar(o, av, bv);
    }
    return new Arr(rows, cols, out);
  }
  return binScalar(o, a, b);
}
function flat(v) { if (v instanceof Arr) return v.data; return [v]; }
function critFn(crit) {
  if (isErr(crit)) return () => false;
  if (typeof crit === 'number') return v => typeof v === 'number' && v === crit;
  let s = toStr(crit), op = '=';
  const m = /^(<=|>=|<>|<|>|=)/.exec(s); if (m) { op = m[1]; s = s.slice(m[1].length); }
  const num = s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null;
  if (num !== null) {
    return v => { if (typeof v !== 'number') return op === '<>' ; switch (op) { case '=': return v === num; case '<>': return v !== num; case '<': return v < num; case '>': return v > num; case '<=': return v <= num; case '>=': return v >= num; } };
  }
  const low = s.toLowerCase();
  if (/[*?]/.test(low) && (op === '=' || op === '<>')) {
    const re = new RegExp('^' + low.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 's');
    return v => { const ok = typeof v === 'string' && re.test(v.toLowerCase()); return op === '=' ? ok : !ok; };
  }
  return v => { const c = cmpVals(typeof v === 'string' ? v : (v === null || v === undefined ? '' : v), s); if (op === '=') return typeof v === 'string' || v === null || v === undefined ? c === 0 && (s !== '' || v === null || v === undefined || v === '') : false; if (op === '<>') return !(typeof v === 'string' && c === 0); if (typeof v !== 'string') return false; return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; };
}
const fmtFixed = (x, d) => { x = toNum(x); if (isErr(x)) return x; d = d === undefined ? 2 : d; return x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); };

// ---------- planilha
export class Workbook {
  constructor(base, painelCells) {
    this.sheets = base.sheets;          // { nome: [[...linhas]] } (linha 1 = índice 0)
    this.cells = painelCells;           // { 'A1': fórmula ou valor }
    this.ast = new Map(); this.cache = new Map(); this.inputs = {};
  }
  set(addr, v) {
    this.inputs[addr] = v;
    if (!this.deps) this.buildDeps();
    for (const d of (this.deps.get(addr) || [])) this.cache.delete(d);
    this.cache.delete(addr);
  }
  // grafo de dependências entre células do Painel: ao mudar uma entrada, só os dependentes são recalculados
  buildDeps() {
    const direct = new Map();
    const refsOf = n => { const out = []; (function walk(x) { if (!x) return; if (x.k === 'ref' && (!x.sheet || x.sheet === 'Painel')) {
        const [a, b] = x.v.replace(/\$/g, '').split(':'); const A = parseAddr(a), B = b ? parseAddr(b) : A;
        for (let r = A.r; r <= B.r; r++) for (let c = A.c; c <= B.c; c++) out.push(colName(c) + r); }
      if (x.a) walk(x.a); if (x.b) walk(x.b); if (x.args) x.args.forEach(walk); })(n); return out; };
    for (const [addr, raw] of Object.entries(this.cells)) {
      if (typeof raw !== 'string' || !raw.startsWith('=')) continue;
      let ast = this.ast.get(addr); if (!ast) { ast = parse(raw.slice(1)); this.ast.set(addr, ast); }
      for (const r of refsOf(ast)) { if (!direct.has(r)) direct.set(r, new Set()); direct.get(r).add(addr); }
    }
    this.deps = new Map(); const memo = new Map();
    const close = a => { if (memo.has(a)) return memo.get(a); const out = new Set(); memo.set(a, out); for (const d of (direct.get(a) || [])) { out.add(d); for (const e of close(d)) out.add(e); } return out; };
    for (const k of direct.keys()) this.deps.set(k, close(k));
  }
  // avalia uma fórmula avulsa (ex.: quantidades do comparativo, que referenciam o Painel)
  evalFormula(f) { const key = '§' + f; let ast = this.ast.get(key); if (!ast) { ast = parse(f.startsWith('=') ? f.slice(1) : f); this.ast.set(key, ast); } const v = this.ev(ast); return v instanceof Arr ? v.data[0] : v; }
  sheetVal(sheet, r, c) { const s = this.sheets[sheet]; if (!s) return ERR.ref; const row = s[r - 1]; if (!row) return null; const v = row[c - 1]; return v === undefined ? null : v; }
  cell(addr) {
    if (addr in this.inputs) return this.inputs[addr];
    if (this.cache.has(addr)) return this.cache.get(addr);
    const raw = this.cells[addr];
    let v;
    if (typeof raw === 'string' && raw.startsWith('=')) {
      let ast = this.ast.get(addr); if (!ast) { ast = parse(raw.slice(1)); this.ast.set(addr, ast); }
      this.cache.set(addr, ERR.ref); // proteção contra ciclos
      try { v = this.ev(ast); } catch (e) { e.message = addr + ': ' + e.message; throw e; }
      if (v instanceof Arr) v = v.data[0];
    } else v = raw === undefined ? null : raw;
    this.cache.set(addr, v); return v;
  }
  range(sheet, ref) {
    const [a, b] = ref.split(':'); const A = parseAddr(a), B = b ? parseAddr(b) : A;
    const rows = B.r - A.r + 1, cols = B.c - A.c + 1, data = new Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      data[r * cols + c] = (!sheet || sheet === 'Painel') ? this.cell(colName(A.c + c) + (A.r + r)) : this.sheetVal(sheet, A.r + r, A.c + c);
    }
    return new Arr(rows, cols, data);
  }
  ev(n) {
    switch (n.k) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'empty': return null;
      case 'neg': { const v = this.ev(n.a); return v instanceof Arr ? bin('*', v, -1) : (isErr(v) ? v : -toNum(v)); }
      case 'bin': return bin(n.o, this.ev(n.a), this.ev(n.b));
      case 'ref': {
        if (n.v.includes(':')) return this.range(n.sheet, n.v.replace(/\$/g, ''));
        const A = parseAddr(n.v); const addr = colName(A.c) + A.r;
        if (!n.sheet || n.sheet === 'Painel') return this.cell(addr);
        return this.sheetVal(n.sheet, A.r, A.c);
      }
      case 'fn': return this.fn(n.f, n.args);
    }
    throw new Error('nó desconhecido ' + n.k);
  }
  fn(f, args) {
    const E = a => this.ev(a);
    switch (f) {
      case 'IF': { const c = E(args[0]); if (isErr(c)) return c; const t = c instanceof Arr ? c.data[0] : c; const cond = typeof t === 'string' ? t !== '' : !!toNum(t); return cond ? E(args[1]) : (args.length > 2 ? E(args[2]) : false); }
      case 'IFERROR': { const v = E(args[0]); return isErr(v) ? E(args[1]) : v; }
      case 'ISERROR': { const v = E(args[0]); if (v instanceof Arr) return new Arr(v.rows, v.cols, v.data.map(isErr)); return isErr(v); }
      case 'AND': return args.every(a => !!toNum(E(a))); case 'OR': return args.some(a => !!toNum(E(a)));
      case 'ABS': { const v = toNum(E(args[0])); return isErr(v) ? v : Math.abs(v); }
      case 'N': { const v = E(args[0]); return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; }
      case 'LEFT': { const v = E(args[0]); if (v instanceof Arr) { const k = toNum(E(args[1])); return new Arr(v.rows, v.cols, v.data.map(x => toStr(x).slice(0, k))); } return toStr(v).slice(0, args.length > 1 ? toNum(E(args[1])) : 1); }
      case 'FIXED': return fmtFixed(E(args[0]), args.length > 1 ? toNum(E(args[1])) : 2);
      case 'HYPERLINK': return args.length > 1 ? E(args[1]) : E(args[0]);
      case 'MIN': case 'MAX': {
        let best = null;
        for (const a of args) { const v = E(a); for (const x of flat(v)) { if (isErr(x)) return x; if (typeof x !== 'number') { if (!(v instanceof Arr) && typeof x === 'boolean') { } else continue; } const y = toNum(x); if (best === null || (f === 'MIN' ? y < best : y > best)) best = y; } }
        return best === null ? 0 : best;
      }
      case 'SUM': { let s = 0; for (const a of args) { const v = E(a); for (const x of flat(v)) { if (isErr(x)) return x; if (typeof x === 'number') s += x; else if (!(v instanceof Arr)) { const y = toNum(x); if (isErr(y)) return y; s += y; } } } return s; }
      case 'COUNT': { let c = 0; for (const a of args) for (const x of flat(E(a))) if (typeof x === 'number') c++; return c; }
      case 'SUMPRODUCT': {
        const arrs = args.map(E); for (const v of arrs) if (isErr(v)) return v;
        if (arrs.length === 1) { let s = 0; for (const x of flat(arrs[0])) { if (isErr(x)) return x; s += typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0; } return s; }
        const n = flat(arrs[0]).length; let s = 0;
        for (let i = 0; i < n; i++) { let p = 1; for (const v of arrs) { const x = flat(v)[i]; if (isErr(x)) return x; p *= typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0; } s += p; }
        return s;
      }
      case 'COUNTIF': case 'COUNTIFS': case 'SUMIFS': {
        let sum = null, k = 0; if (f === 'SUMIFS') { sum = E(args[0]); k = 1; }
        const pairs = []; for (; k < args.length; k += 2) pairs.push([E(args[k]), critFn(E(args[k + 1]))]);
        const n = flat(pairs[0][0]).length; let acc = 0;
        for (let i = 0; i < n; i++) {
          if (pairs.every(([r, fn]) => fn(flat(r)[i]))) { if (sum) { const x = flat(sum)[i]; if (typeof x === 'number') acc += x; } else acc++; }
        }
        return acc;
      }
      case 'MATCH': {
        const x = E(args[0]); const r = flat(E(args[1])); const type = args.length > 2 ? toNum(E(args[2])) : 1;
        if (isErr(x)) return x;
        if (type === 0) { for (let i = 0; i < r.length; i++) if (cmpVals(r[i], x) === 0) return i + 1; return ERR.na; }
        let ans = -1; // vetor crescente: último valor do mesmo tipo <= x
        for (let i = 0; i < r.length; i++) { const v = r[i]; if (v === null || v === undefined || typeof v !== typeof x) continue; if (cmpVals(v, x) <= 0) ans = i; else break; }
        return ans < 0 ? ERR.na : ans + 1;
      }
      case 'INDEX': {
        const a = E(args[0]); const r = toNum(E(args[1])); const c = args.length > 2 ? toNum(E(args[2])) : 1;
        if (isErr(r)) return r; if (!(a instanceof Arr)) return a;
        if (a.cols === 1 || a.rows === 1) { const i = (a.cols === 1 ? r : (args.length > 2 ? c : r)) - 1; const v = a.data[i]; return v === undefined ? ERR.ref : v; }
        const v = a.data[(r - 1) * a.cols + (c - 1)]; return v === undefined ? ERR.ref : v;
      }
    }
    throw new Error('função não suportada: ' + f);
  }
}
export { parse, tokenize, isErr, XErr };
