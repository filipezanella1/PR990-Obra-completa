"""Lê o estudo de britagem (Planejamento Britagem Riozinho e Rebouças – dd.mm.aa.xlsx) e gera data/britagem.json
com as premissas da britagem: densidades, composição dos materiais em produtos, produtividade (t/h), horas,
furação/desmonte, estoques, saldos de dreno e concreto de Rebouças e a demanda mensal de Riozinho (obra 515.01),
que divide a mesma pedreira.
uso: python3 tools/britagem.py <planejamento_britagem.xlsx> data/britagem.json"""
import json, re, sys, datetime, openpyxl

src, dst = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
B, P = wb['Britagem'], wb['Planejamento Britagem']
v = lambda ws, a: ws[a].value
num = lambda x: float(x or 0)
PROD = [('mac', 'G'), ('bica', 'H'), ('b1', 'I'), ('ped', 'J'), ('po', 'K')]
comp = lambda r: {p: num(v(B, f'{c}{r}')) for p, c in PROD if num(v(B, f'{c}{r}'))}
mes = lambda d: d.strftime('%Y-%m') if isinstance(d, (datetime.date, datetime.datetime)) else None
ini = v(P, 'D44') or v(B, 'G45')
meses = [mes(v(P, f'{c}34')) for c in 'DEF']
rio = {p: {meses[i]: round(num(v(P, f'{c}{r}')), 3) for i, c in enumerate('DEF')} for (p, _), r in zip(PROD, range(35, 40))}
out = dict(
    fonte=f'Estudo de britagem – Pedreira Faxinal dos Francos, obras 515.01 e 515.02 ({src.split("/")[-1].split(" - ")[-1].replace(".xlsx", "") if " - " in src else "planilha"})',
    data=ini.strftime('%Y-%m-%d') if ini else None,
    dens=dict(bica=num(v(B, 'E18')), bgs=num(v(B, 'E20')), dreno=num(v(B, 'E22')), conc=num(v(B, 'E24'))),
    comp=dict(bica=comp(18), bgs=comp(20), dreno=comp(22), conc=comp(24)),
    rate={p: num(v(B, f'{c}40')) for p, c in PROD},
    pri=dict(h=num(v(B, 'B40')), t=num(v(B, 'C40')), d=num(v(B, 'D40'))),
    reb=dict(h=num(v(B, 'B41')), t=num(v(B, 'C41')), d=num(v(B, 'D41'))),
    rend=num(v(B, 'E40')),
    rocha=dict(dens=num(v(P, 'K62')), m3m=num(v(P, 'K63')), hFuro=num(v(P, 'K64')), furCap=num(v(B, 'G56')), furos=num(v(P, 'K65')), hEst=num(v(P, 'K66'))),
    estoque={p: num(v(B, f'{c}29')) for p, c in PROD},
    reb515=dict(dreno=round(num(v(B, 'D22')), 3), conc=round(num(v(B, 'D24')), 3),
                estudo_t=dict(reforco=round(num(wb['Volumes Rebouças']['G48'].value), 1), subbase=round(num(wb['Volumes Rebouças']['G49'].value), 1), base=round(num(wb['Volumes Rebouças']['G50'].value), 1))),
    riozinho=rio, meses=meses,
)
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False)[:1500])
