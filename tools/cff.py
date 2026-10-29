"""Lê o Cronograma Físico-Financeiro (CFF) da TCE em PDF e gera privado/cff.json (cifrado depois por tools/proteger.mjs).
uso: python3 tools/cff.py <CFF.pdf> privado/cff.json"""
import json, re, subprocess, sys
src, dst = sys.argv[1], sys.argv[2]
L = subprocess.run(['pdftotext', '-layout', src, '-'], capture_output=True, text=True).stdout.split('\n')
MES = dict(jan=1, fev=2, mar=3, abr=4, mai=5, jun=6, jul=7, ago=8, set=9, out=10, nov=11, dez=12)
brl = lambda s: float(s.replace('R$', '').replace(' ', '').replace('.', '').replace(',', '.'))
meses = []
for ln in L:
    ms = re.findall(r'\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/(\d{2})\b', ln)
    if len(ms) >= 1 and 'SALDO' in ln.upper(): meses = [f'20{a}-{MES[m]:02d}' for m, a in ms]; break
gr, pend = [], None
for ln in L:
    vals = re.findall(r'-?R\$\s*-?[\d.]+,\d{2}', ln)
    m = re.match(r'^\s*(\d{1,2})\s+(.+?)\s{2,}(-?R\$\s*-?[\d.]+,\d{2})\s*$', ln)
    if m: gr.append({'i': int(m[1]), 'n': re.sub(r'\s+', ' ', m[2]).strip(), 'saldo': brl(m[3]), 'v': pend or [0] * len(meses)}); pend = None; continue
    if re.match(r'^\s*R\$\s+R\$', ln) and len(vals) == len(meses): pend = [brl(v) for v in vals]
tit = next((l.strip() for l in L if 'CRONOGRAMA' in l.upper()), 'Cronograma físico-financeiro')
nota = ' '.join(l.strip() for l in L if re.search(r'IMPOSSIBILIDADE|MEDIÇÃO NO MÊS|FATURAMENTO|DE NOVEMBRO', l)).strip()
out = {'fonte': tit, 'arquivo': src.split('/')[-1], 'meses': meses, 'grupos': gr, 'nota': nota.capitalize() if nota else ''}
assert len(gr) == 16, len(gr)
for g in gr: assert abs(sum(g['v']) - g['saldo']) < 1 or not any(g['v']), g
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(meses, len(gr), round(sum(g['saldo'] for g in gr), 2), out['nota'])
