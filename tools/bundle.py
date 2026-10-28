"""Gera dist/painel-pr990.html: um único arquivo com CSS, JS e a base embutidos (abre offline, sem servidor).
uso: python3 tools/bundle.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'src/style.css').read_text(encoding='utf-8')
eng = (root / 'src/engine.js').read_text(encoding='utf-8')
app = (root / 'src/app.js').read_text(encoding='utf-8')
eng = re.sub(r'^export \{[^}]*\};?\s*$', '', eng, flags=re.M).replace('export class ', 'class ')
app = re.sub(r"^import .*?;\s*$", '', app, flags=re.M)
data = {k: json.loads((root / f'data/{f}.json').read_text(encoding='utf-8')) for k, f in (('model', 'model'), ('base', 'base'), ('painel', 'painel'), ('insumos', 'insumos'))}
payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = re.sub(r'<!--PWA-->.*?<!--/PWA-->', '', html, flags=re.S)
html = re.sub(r'<!--CSS-->.*?<!--/CSS-->', lambda m: '<style>\n' + css + '\n</style>', html, flags=re.S)
html = re.sub(r'<!--JS-->.*?<!--/JS-->', lambda m: '<script>window.__PR990__=' + payload + ';</script>\n<script type="module">\n' + eng + '\n' + app + '\n</script>', html, flags=re.S)
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'painel-pr990.html').write_text(html.replace('`drenagem/', '`../drenagem/').replace('"drenagem/', '"../drenagem/'), encoding='utf-8')
print('dist/painel-pr990.html', round(len(html.encode()) / 1e6, 2), 'MB')

# variante para publicação como página única (sem doctype/head/body próprios)
art = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>', '', html, flags=re.I)
art = re.sub(r'<meta charset="utf-8">\s*<meta name="viewport"[^>]*>', '', art)
art = art.replace('</head>', '').replace('<body>', '').replace('</body>', '').replace('</html>', '')
(out / 'painel-pr990.artifact.html').write_text(art.strip() + '\n', encoding='utf-8')
