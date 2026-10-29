"""Gera data/memorias.json com o texto pesquisável da Memória Justificativa (Volume 3, Tomos I, II e III, e Anexo 3A – Estudos geotécnicos),
página a página (texto do PDF; páginas escaneadas pelo OCR em pasta à parte) e o sumário de cada tomo.
uso: python3 tools/memorias.py <pasta com t1.txt … t4.txt (pdftotext -layout) e ocr/> data/memorias.json"""
import json, re, subprocess, sys, pathlib
src, dst = pathlib.Path(sys.argv[1]), sys.argv[2]
DOCS = [('t1', 'Tomo I – Estudos', 'memorias/volume3-tomo1-estudos.pdf'), ('t2', 'Tomo II – Projetos', 'memorias/volume3-tomo2-projetos.pdf'), ('t3', 'Tomo III – Anexos', 'memorias/volume3-tomo3-anexos.pdf'), ('t4', 'Anexo 3A – Estudos geotécnicos', 'memorias/anexo3a-estudos-geotecnicos.pdf')]
OFF = {'t4': 3}   # página do PDF = página impressa + deslocamento (1 nos tomos, 3 no anexo 3A)
HEAD = re.compile(r'Projeto Executivo de Implanta[çc][ãa]o da PR-990( entre a)?\s*\n?\s*(entre a )?Rodovia PR-364 e a cidade de\s*\n?\s*Rebou[çc]as', re.I)
def clean(s):
    s = HEAD.sub('', s); s = re.sub(r'[ \t]{2,}', '  ', s); s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()
out = []
for d, n, f in DOCS:
    txt = (src / f'{d}.txt').read_text(encoding='utf-8', errors='ignore').split('\f')[:-1]
    pages = []
    for i, p in enumerate(txt):
        o = src / 'ocr' / f'{d}-{i + 1}.txt'
        ocr = len(re.sub(r'\s', '', p)) < 80 and o.exists()
        pages.append(clean(o.read_text(encoding='utf-8', errors='ignore')) if ocr else clean(p))
    toc = []
    for ln in '\n'.join(txt[:6]).split('\n'):
        m = re.match(r'^\s*(\d+(?:\.\d+)*\.?)\s+(.+?)\s*\.{4,}\s*(\d+)\s*$', ln)
        if m: toc.append({'s': m[1].rstrip('.'), 't': re.sub(r'\s+', ' ', m[2]).strip(), 'p': int(m[3]) + OFF.get(d, 1)})
    ocrn = sum(1 for i, p in enumerate(txt) if len(re.sub(r'\s', '', p)) < 80 and (src / 'ocr' / f'{d}-{i + 1}.txt').exists())
    out.append({'id': d, 'n': n, 'file': f, 'pages': pages, 'toc': toc, 'ocr': ocrn})
    print(d, len(pages), 'páginas ·', len(toc), 'itens no sumário ·', ocrn, 'por OCR')
json.dump({'titulo': 'Projeto Executivo de Implantação da PR-990 entre a PR-364 e Rebouças – Volume 3: Memória Justificativa (jan/2024) e Anexo 3A – Estudos geotécnicos (nov/2023)', 'docs': out}, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
