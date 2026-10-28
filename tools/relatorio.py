"""Aplica o Relatório de Quantidades Executadas do SMO (PDF do DER/PR) sobre a medição lida da planilha.
As quantidades da medição e acumuladas passam a ser as do relatório oficial; as memórias por estaca continuam
vindo da planilha. Itens em que a planilha difere do relatório ficam marcados (campo "pl").
uso: python3 tools/relatorio.py <relatorio.pdf> data/medicao.json      (precisa do pdftotext / poppler)"""
import json, re, subprocess, sys

pdf, mj = sys.argv[1], sys.argv[2]
txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
num = lambda s: float(s.replace('.', '').replace(',', '.'))
head = txt.split('Relatório de Cálculo')[0]
rows, pend = [], None
for ln in head.splitlines():
    m4 = re.search(r'(-?[\d.]+,\d+)\s+(-?[\d.]+,\d+)\s+(-?[\d.]+,\d+)\s+(-?[\d.]+,\d+)\s*$', ln)
    mc = re.match(r'^\s{0,16}(\d{3,6}|[A-Z]{2,3}-\d{3}|\d+\.\d+)\s{2,}(\S.*)$', ln)
    if mc and not re.match(r'^[\d.]+,\d+', mc[2]):
        pend = mc[1]
    if m4 and pend:
        rows.append(dict(c=pend, liq=num(m4[1]), acum=num(m4[2]), vliq=num(m4[3]), vac=num(m4[4])))
        pend = None
g = lambda pat: (lambda m: num(m.group(1)) if m else None)(re.search(pat, txt))
med_n = re.search(r'Medição\s*:\s*(\d+)', txt)
data = re.search(r'Data de realização\s*:\s*([\d/]+)', txt)
per = re.search(r'Período da medição\s*:\s*([\d/]+ a [\d/]+)', txt)
emit = re.search(r'(\d{2}/\d{2}/\d{4}) - \d{2}:\d{2}', txt)
M = json.load(open(mj, encoding='utf-8'))
its = M['itens']; used = set(); dif = []
for r in rows:
    cand = [k for k, i in enumerate(its) if k not in used and i['c'] == r['c']] or [k for k, i in enumerate(its) if k not in used and r['c'] == '264' and i['c'] == '999999']
    if not cand:
        print('sem item na planilha:', r); continue
    k = min(cand, key=lambda k: (abs(its[k]['acum'] - r['acum']) > 1e-2, cand.index(k)))
    used.add(k); i = its[k]
    if abs(i['acum'] - r['acum']) > 5e-3 or abs(i['liq'] - r['liq']) > 5e-3:
        i['pl'] = {'liq': i['liq'], 'acum': i['acum']}
        if abs(i['acum'] - r['acum']) * i['p'] > 1: dif.append((i['c'], i['s'], i['acum'], r['acum'], (r['acum'] - i['acum']) * i['p']))
    i['liq'], i['acum'] = r['liq'], r['acum']; i['ant'] = round(r['acum'] - r['liq'], 6)
for k, i in enumerate(its):          # itens fora do relatório: nada medido
    if k not in used and (i['acum'] or i['liq']):
        i['pl'] = {'liq': i['liq'], 'acum': i['acum']}; i['liq'] = i['acum'] = i['ant'] = 0
M['oficial'] = {
    'fonte': f"Relatório de Quantidades Executadas – SMO/DER-PR, medição {med_n.group(1) if med_n else ''}" + (f", emitido em {emit.group(1)}" if emit else ''),
    'periodo': per.group(1) if per else '', 'realizacao': data.group(1) if data else '',
    'presente': g(r'Presente medição\s+([\d.]+,\d+)'), 'reajuste': g(r'Valor de reajuste\s*:R\$\s*([\d.]+,\d+)'),
    'liquido': g(r'Total da presente medição\s*:R\$\s*([\d.]+,\d+)'), 'acumulado': g(r'Total acumulado das medições\s*:R\$\s*([\d.]+,\d+)'),
    'anteriores': g(r'Medições anteriores\s+([\d.]+,\d+)'), 'saldo': g(r'Saldo\s+([\d.]+,\d+)'),
    'reajAcum': g(r'Medições acumuladas\s+[\d.]+,\d+\s+([\d.]+,\d+)'),
    'difs': [{'c': c, 's': s, 'planilha': a, 'relatorio': b, 'rs': round(v, 2)} for c, s, a, b, v in dif],
}
json.dump(M, open(mj, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'linhas do relatório ·', round(sum(r['vac'] for r in rows), 2), 'acumulado ·', round(sum(r['vliq'] for r in rows), 2), 'na medição')
print(json.dumps({k: v for k, v in M['oficial'].items() if k != 'difs'}, ensure_ascii=False))
for d in M['oficial']['difs']: print('  difere:', d)
