"""Lê o resumo do estudo de aditivo e supressão (aba Resumo) e gera data/aditivo.json com acréscimos e supressões por grupo de serviço.
uso: python3 tools/aditivo.py <Estudo_de_aditivo_e_supressão.xlsx> data/aditivo.json"""
import json, re, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True); ws = wb['Resumo']
hdr = None; gr = []
for row in ws.iter_rows(values_only=True):
    if hdr is None:
        if row and any(str(x).strip() == 'Grupo' for x in row if x is not None):
            hdr = {str(x).strip(): j for j, x in enumerate(row) if x is not None}
        continue
    g = row[hdr['Grupo']]
    if not g or str(g).startswith('Total'): continue
    m = re.match(r'(\d+)\s*·\s*(.+)', str(g))
    if not m: continue
    col = lambda k: float(row[next(j for h, j in hdr.items() if h.startswith(k))] or 0)
    gr.append({'i': 16 if m[1] == '99' else int(m[1]), 'n': m[2].strip(), 'contrato': round(col('Contrato'), 2), 'acr': round(col('(1)'), 2), 'sup': round(col('(2)'), 2)})
gr.sort(key=lambda g: g['i'])
assert [g['i'] for g in gr] == list(range(1, 17)), [g['i'] for g in gr]
out = {'fonte': 'Estudo de aditivo e supressão – PR-990 (subsídios para o aditivo)', 'arquivo': sys.argv[1].split('/')[-1], 'grupos': gr,
       'acr': round(sum(g['acr'] for g in gr), 2), 'sup': round(sum(g['sup'] for g in gr), 2)}
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(gr), out['acr'], out['sup'])
