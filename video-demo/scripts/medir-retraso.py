"""Mide el retraso de la imagen: para cada clic, busca el primer cuadro que muestra su círculo azul.
Uso: python -I scripts/medir-retraso.py grabaciones/crear-oc"""
import json, sys, pathlib
from PIL import Image
d = pathlib.Path(sys.argv[1])
g = json.loads((d / 'grabacion.json').read_text(encoding='utf8'))
esc = g['escala']
cuadros = sorted(g['cuadros'], key=lambda c: c['t'])
def tiene_circulo(img, x, y):
    # El círculo (borde azul 30,111,255) se expande de 11 a 54 px CSS alrededor del clic.
    w, h = img.size
    px = img.load()
    for r in (8, 12, 16, 20):
        for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r)):
            X, Y = int((x + dx) * esc), int((y + dy) * esc)
            if 0 <= X < w and 0 <= Y < h:
                p = px[X, Y][:3]
                if p[2] > 200 and p[0] < 120 and 70 < p[1] < 170: return True
    return False
for c in g.get('clics', []):
    if c.get('pestana'): continue
    lag = None
    for f in cuadros:
        if f['t'] < c['t'] - 0.05: continue
        if f['t'] > c['t'] + 40: break
        img = Image.open(d / 'cuadros' / f['archivo']).convert('RGB')
        if tiene_circulo(img, c['x'], c['y']):
            lag = f['t'] - c['t']; break
    print(f"{c['parte']} reloj {c['reloj']:6.2f}  retraso {('%.2f s' % lag) if lag is not None else 'no encontrado'}")
