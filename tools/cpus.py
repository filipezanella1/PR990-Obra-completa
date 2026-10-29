"""Lê as CPUs do contrato (planilha 15.CPUs Serviços) e gera data/cpus.json: cada composição com equipamentos, mão de obra,
produção da equipe, materiais, serviços auxiliares, transportes, custo direto, BDI e preço unitário.
uso: python3 tools/cpus.py <CPUS_DO_CONTRATO.xlsx> data/cpus.json"""
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True); ws = wb['15.CPUs Serviços']
num = lambda x: round(float(x), 6) if isinstance(x, (int, float)) else None
txt = lambda x: ' '.join(str(x).split()) if x is not None else ''
code = lambda x: (str(int(x)) if isinstance(x, float) and x == int(x) else txt(x)) if x is not None else ''
cpus, cur, sec, pend = [], None, None, 0
for row in ws.iter_rows(values_only=True):
    c = list(row[:13]) + [None] * max(0, 13 - len(row))
    s1, s2, s3, s5, s6 = txt(c[1]), txt(c[2]), txt(c[3]), txt(c[5]), txt(c[6])
    has = lambda p: any(txt(x).startswith(p) for x in c[:9])
    if s3.startswith('COMPOSIÇÃO DE PREÇO UNITÁRIO'):
        cur = {'eq': [], 'mo': [], 'mat': [], 'ser': [], 'tr': []}; cpus.append(cur); sec = None; pend = 2; continue
    if cur is None: continue
    if pend == 2: pend = 1; continue                                     # cabeçalho Código | Serviço | Unidade
    if pend == 1:
        pend = 0; cur.update(c=code(c[1]), n=s2, u=txt(c[9]), pu=num(c[10])); continue
    if s1 == 'Código' and s2:
        sec = {'A': 'eq', 'B': 'mo', 'F': 'mat', 'G': 'ser', 'H': 'tr'}.get(s2[:1]); continue
    if has('A - CUSTO'): cur['eqT'] = num(c[9]); sec = None; continue
    if has('B - CUSTO'): cur['moT'] = num(c[9]); sec = None; continue
    if s2.startswith('C - ITENS'): cur['inc'] = [s5, num(c[6]), num(c[9])]; continue
    if has('C - CUSTO'): cur['moCT'] = num(c[9]); continue
    if any(txt(x).startswith('CUSTO HORARIO DE EXECU') for x in c[:9]): cur['ch'] = num(c[9]); continue
    if s2.startswith('D - PRODU'): cur['prod'] = num(c[3]); cur['ce'] = num(c[9]); continue
    if has('F - CUSTO'): cur['matT'] = num(c[9]); sec = None; continue
    if has('G - CUSTO'): cur['serT'] = num(c[9]); sec = None; continue
    if has('H - CUSTO'): cur['trT'] = num(c[9]); sec = None; continue
    if s1.startswith('CUSTO DIRETO'): cur['cd'] = num(c[9]); continue
    if s1.startswith('TAXA DO BDI'): cur['bdi'] = num(c[3]); cur['bdiV'] = num(c[9]); continue
    if s1.startswith('PREÇO UNITÁRIO'): cur['pt'] = num(c[9]); continue
    if sec and c[1] is not None and s2:
        if sec == 'eq': cur['eq'].append([code(c[1]), s2, num(c[4]), num(c[5]), num(c[6]), num(c[7]), num(c[8]), num(c[9])])
        elif sec == 'mo': cur['mo'].append([code(c[1]), s2, num(c[5]), num(c[6]), num(c[7]), num(c[8]), num(c[9])])
        elif sec == 'tr': cur['tr'].append([code(c[1]), s2, txt(c[3]), num(c[4]), num(c[5]), num(c[6]), num(c[7]), num(c[8]), num(c[9])])
        else: cur[sec].append([code(c[1]), s2, txt(c[6]), num(c[7]), num(c[8]), num(c[9])])
cpus = [x for x in cpus if x.get('c') and x.get('n')]
for x in cpus:
    for k in ('eq', 'mo', 'mat', 'ser', 'tr'):
        if not x[k]: del x[k]
seen = {}
for x in cpus: seen[x['c']] = seen.get(x['c'], 0) + 1
json.dump({'fonte': 'CPUs do contrato – 15.CPUs Serviços (data-base set/2023, sem desoneração) · TCE Engenharia', 'cpus': cpus}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(cpus), 'CPUs ·', sum(1 for v in seen.values() if v > 1), 'códigos repetidos')
