"""Gera data/reajuste.json: grupos de serviço do contrato (faixas de linhas da planilha contratual, como na medição),
coeficiente de reajuste R de cada grupo e a ligação linha do Painel → grupo (pelo campo "painel" do contrato).
uso: python3 tools/reajuste.py privado/contrato.json data/reajuste.json
Coeficientes R: quadro de reajuste da 25ª medição (PI × R = reajuste; PI + R = valor reajustado)."""
import json, sys
src, dst = sys.argv[1], sys.argv[2]
G = [(17, 'TERRAPLENAGEM', 0.0471), (53, 'PAVIMENTAÇÃO', 0.0618), (66, 'LIGANTES BETUMINOSOS', 0.0858),
     (71, 'DRENAGEM E OBRAS DE ARTE CORRENTES', 0.0708), (143, 'OBRAS DE ARTE ESPECIAIS – SOLO GRAMPEADO', 0.0350),
     (151, 'OBRAS DE ARTE ESPECIAIS – PONTE', 0.0350), (183, 'CONTENÇÕES', 0.0471), (192, 'GALERIAS CELULARES', 0.0350),
     (201, 'PASSA FAUNA', 0.1045), (221, 'SERVIÇOS COMPLEMENTARES', 0.1045), (259, 'SINALIZAÇÃO', 0.0333),
     (280, 'SINALIZAÇÃO PROVISÓRIA', 0.0333), (291, 'MELHORIAS AMBIENTAIS', 0.0675), (300, 'ILUMINAÇÃO', 0.1045),
     (325, 'INTERFERÊNCIAS', 0.1045), (338, 'MOBILIZAÇÃO E DESMOBILIZAÇÃO', 0.0675)]
L = json.load(open(src, encoding='utf-8'))['contrato']
gi = lambda l: max(i for i, (a, _, _) in enumerate(G) if l >= a)
row = {}
for c in L:
    if c.get('painel') is not None: row[str(c['painel'])] = gi(c['linha'])
json.dump(dict(fonte='Coeficientes de reajuste (R) por grupo de serviço – 25ª medição', grupos=[dict(n=n, R=r) for _, n, r in G], row=row),
          open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(row), 'linhas do Painel ligadas a', len(G), 'grupos')
