"""Lê o retigráfico da obra (RETIGRAFICO OBRA 515 – PR 990 REBOUÇAS – dd.mm.aa.xlsx) e gera data/avanco.json.
Avanço por estaca = cor de preenchimento das células das linhas Atacado / Concluído de cada frente;
bueiros e galerias (OAC) = ícones do desenho (cor = situação), com o rótulo "TIPO Estaca X" e o comprimento mais próximos.
uso: python3 tools/retigrafico.py <retigrafico.xlsx> data/avanco.json"""
import json, re, sys, zipfile, datetime, openpyxl

src, dst = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src)
ws = wb.worksheets[0]
est_rows = [r for r in range(1, ws.max_row + 1) if str(ws.cell(r, 2).value or '').strip().upper() == 'ESTACA']

# data da atualização
upd = None
for row in ws.iter_rows(min_row=1, max_row=12):
    for c in row:
        if isinstance(c.value, (datetime.date, datetime.datetime)): upd = c.value
upd = (upd.date() if isinstance(upd, datetime.datetime) else upd) or datetime.date.today()

# ---------- frentes: preenchimento das células
def filled(c):
    f = c.fill
    return bool(f is not None and f.fill_type and not (f.fgColor.type == 'rgb' and f.fgColor.rgb in ('00FFFFFF', 'FFFFFFFF')))
cells = {}
prev = 0
for er in est_rows:
    rows, cur = [], None
    for r in range(prev + 1, er):
        if ws.row_dimensions[r].hidden: continue
        a = str(ws.cell(r, 2).value or '').strip(); b = str(ws.cell(r, 3).value or '').strip()
        if a: cur = a
        if b and cur: rows.append((r, cur, 'a' if b.lower().startswith('atac') else 'c'))
    for c in range(4, ws.max_column + 1):
        e = ws.cell(er, c).value
        if not isinstance(e, (int, float)): continue
        for r, fr, st in rows:
            if filled(ws.cell(r, c)): cells.setdefault(int(e), set()).add((fr, st))
    prev = er
FR = [('p0', 'Corte – aterro', 'Corte - Aterro', True, '#fcd5b5', '#e46c0a'), ('p1', 'Regularização', 'Regula', True, '#b7dee8', '#31859c'),
      ('p2', '1ª camada de reforço', '1ª C Reforço', True, '#ccc1da', '#604a7b'), ('p3', '2ª camada de reforço', '2ª C Reforço', True, '#d7e4bd', '#77933c'),
      ('p4', 'Sub-base', 'Sub - Base', True, '#e6b9b8', '#953735'), ('p5', 'Base – BGS', 'Base - BGS', True, '#948a54', '#4a452a'),
      ('p6', 'Imprimação', 'Imprimação', False, None, '#808080'), ('p7', 'CBUQ', 'CBUQ', False, None, '#0d0d0d')]
norm = lambda s: re.sub(r'[\s\-ªº°]', '', s.lower()).replace('1c', '1').replace('2c', '2')
frentes = []
for pid, n, key, hasA, ca, cc in FR:
    s = ''
    for k in range(643):
        d = cells.get(max(1, k), set())
        conc = any(norm(f) == norm(key) and st == 'c' for f, st in d)
        at = hasA and any(norm(f) == norm(key) and st == 'a' for f, st in d)
        s += '2' if conc else '1' if at else '0'
    frentes.append(dict(id=pid, n=n, a=hasA, ca=ca, cc=cc, c=s))
    print(f'{n:24s} concluído {s.count("2"):3d} · atacado {s.count("1"):3d}')

# ---------- OAC: ícones do desenho
z = zipfile.ZipFile(src)
dname = next(n for n in z.namelist() if re.match(r'xl/drawings/drawing\d+\.xml$', n))
x = z.read(dname).decode('utf-8')
anchors = re.findall(r'<xdr:(twoCellAnchor|oneCellAnchor)[^>]*>(.*?)</xdr:\1>', x, re.S)
pos = lambda a, t: (lambda m: (int(m[3]) + 1, int(m[1]) + 1) if m else None)(re.search(r'<xdr:%s><xdr:col>(\d+)</xdr:col><xdr:colOff>(-?\d+)</xdr:colOff><xdr:row>(\d+)</xdr:row>' % t, a))
def est_at(r, c):
    er = next((e for e in est_rows if e >= r), None)
    v = ws.cell(er, c).value if er else None
    return v if isinstance(v, (int, float)) else None
icons, boxes = [], []
for k, a in anchors:
    txt = ''.join(re.findall(r'<a:t>([^<]*)</a:t>', a))
    m = re.match(r'^\s*([\d,]+)\s*m', txt)
    if m and 'Rede' not in txt:
        r, c = pos(a, 'from'); boxes.append((r, c, m[1])); continue
    if '<xdr:grpSp>' not in a: continue
    r0, c0 = pos(a, 'from'); r1, c1 = pos(a, 'to') or (r0, c0)
    if r0 < 12: continue                                   # legenda do cabeçalho
    fills = [re.search(r'val="(\w+)"', f).group(1) + (('/' + re.search(r'lumMod val="(\d+)"', f).group(1)) if 'lumMod' in f else '')
             for f in re.findall(r'<a:solidFill>(.*?)</a:solidFill>', a, re.S)]
    main = [f for f in fills if f not in ('bg1', 'lt1')]
    col = main[0] if main else 'bg1'
    st = 'c' if re.match(r'(tx2/75000|002060|accent1/75000|0070C0|1F3864)', col) else 'a' if re.match(r'(00B0F0|accent1$|accent1/60000|tx2/60000|accent5)', col) else 'n'
    e = est_at(r0, c0)
    if e is not None: icons.append(dict(r=r0, c=c0, e=e, st=st))
def pe(t):
    m = re.search(r'Estaca\s*(\d+)(?:\s*\+\s*([\d,]+))?', t)
    if not m: return None
    e = int(m[1]); f = m[2]
    if e > 700: return None
    fv = 0
    if f:
        fv = float(f.replace(',', '.'))
        if fv >= 20 and ',' not in f: fv /= 100
    return e + fv / 20
labs = []
for r in range(1, ws.max_row + 1):
    for c in range(3, ws.max_column + 1):
        v = ws.cell(r, c).value
        if isinstance(v, str) and re.search(r'Estaca\s*\d', v, re.I): labs.append((v.strip(), pe(v)))
B = json.load(open(re.sub(r'avanco\.json$', 'base.json', dst), encoding='utf-8'))['sheets']['Drenagem pontual']
BUE = [(r[1], r[2]) for r in B[1:] if r and isinstance(r[1], (int, float)) and re.match(r'(BSTC|BDTC|BTTC|BSCC|BTCC|BDCC)', str(r[2] or '')) and 'REMOVER' not in str(r[2])]
used, ub, oac = set(), set(), []
for ic in sorted(icons, key=lambda i: (i['e'], i['c'])):
    e = ic['e'] + 0.5
    cand = sorted((abs(v - e), k) for k, (t, v) in enumerate(labs) if v is not None and k not in used and abs(v - e) <= 2.6)
    if cand:
        k = cand[0][1]; used.add(k); t = re.sub(r'\s*Estaca.*', '', labs[k][0]); est = labs[k][1]
    else:
        bb = sorted(BUE, key=lambda b: abs(b[0] - e))
        t, est = (re.sub(r'\s*\(.*', '', bb[0][1]), bb[0][0]) if bb and abs(bb[0][0] - e) <= 1.5 else ('OAC', e)
    bc = sorted([b for b in boxes if b not in ub and abs(b[0] - ic['r']) <= 9 and abs(b[1] - ic['c']) <= 3], key=lambda b: abs(b[1] - ic['c']) + abs(b[0] - ic['r']) / 10)
    L = bc[0][2] if bc else None
    if bc: ub.add(bc[0])
    oac.append(dict(e=round(est, 3), t=t, L=L, st=ic['st']))
oac.sort(key=lambda o: o['e'])
# comprimento: quando o projeto tem o bueiro ali e o mesmo comprimento aparece numa caixa do desenho, vale esse
BL = [(r[1], r[6]) for r in B[1:] if r and isinstance(r[1], (int, float)) and isinstance(r[6], (int, float)) and re.match(r'(BSTC|BDTC|BTTC|BSCC|BTCC|BDCC)', str(r[2] or '')) and 'REMOVER' not in str(r[2])]
vals = [b[2] for b in boxes]; orphan = []
for o in oac:
    for e2, L2 in BL:
        sv = f'{L2:.2f}'.replace('.', ',')
        if abs(e2 - o['e']) <= 1 and sv in vals and o['L'] != sv:
            other = next((q for q in oac if q is not o and q['L'] == sv), None)
            if other: other['L'] = o['L']
            elif o['L']: orphan.append(o['L'])
            o['L'] = sv
for o in oac:
    if not o['L'] and orphan: o['L'] = orphan.pop(0)
    if o['t'] == 'OAC':
        lab = next((t for t, v in labs if v is None and re.search(r'Estaca\s*\d{4}', t)), None)
        if lab: o['t'] = re.sub(r'\s*Estaca.*', '', lab); o['obs'] = f'rótulo no retigráfico: "{lab}"'
print(len(oac), 'OAC:', sum(o['st'] == 'c' for o in oac), 'concluídos ·', sum(o['st'] == 'a' for o in oac), 'atacados ·', sum(o['st'] == 'n' for o in oac), 'não iniciados')
print('rótulos sem ícone:', [labs[k][0] for k in range(len(labs)) if k not in used])
try: TRAV = json.load(open(dst, encoding='utf-8')).get('travas', [])
except Exception: TRAV = []
json.dump(dict(travas=TRAV, fonte=f'Retigráfico da obra 515 – PR-990 Rebouças (TCE), atualização de {upd.strftime("%d/%m/%Y")}', data=upd.isoformat(),
               frentes=frentes, oac=oac, oae=[dict(e0=235.3, e1=237.05, n='Ponte sobre o Rio do Salto')]),
          open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
