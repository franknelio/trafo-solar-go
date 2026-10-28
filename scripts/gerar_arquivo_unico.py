"""Gera dist/trafo-solar-go.html: o app inteiro num só arquivo, que abre com dois cliques (sem servidor)."""
import json
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
html = (raiz / "index.html").read_text(encoding="utf-8")
dados = raiz / "data" / "trafos.json"
if not dados.exists():
    dados = raiz / "data" / "exemplo.json"

def inline_css(nome):
    return f"<style>{(raiz / nome).read_text(encoding='utf-8')}</style>"

def inline_js(codigo):
    return "<script>" + codigo.replace("</script", "<\\/script") + "</script>"

app = (raiz / "app.js").read_text(encoding="utf-8")
app = app.replace("async function loadData(){",
                  f"async function loadData(){{ const d = {dados.read_text(encoding='utf-8')}; d.exemplo = {json.dumps(dados.name == 'exemplo.json')}; return d;", 1)
app = app.replace("if ('serviceWorker' in navigator)", "if (false)")

html = html.replace('<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', inline_css("vendor/leaflet/leaflet.css"))
html = html.replace('<link rel="stylesheet" href="style.css">', inline_css("style.css"))
html = html.replace('<script src="vendor/leaflet/leaflet.js"></script>', inline_js((raiz / "vendor/leaflet/leaflet.js").read_text(encoding="utf-8")))
html = html.replace('<script src="app.js"></script>', inline_js(app))
for linha in ('<link rel="manifest" href="manifest.webmanifest">\n',):
    html = html.replace(linha, "")

saida = raiz / "dist" / "trafo-solar-go.html"
saida.parent.mkdir(exist_ok=True)
saida.write_text(html, encoding="utf-8")
print(f"Gravado {saida} ({saida.stat().st_size / 1e6:.1f} MB)")
