/**
 * Genera el `index.html` del proyecto HyperFrames a partir de `assets/timeline.json`.
 * Uso: node scripts/componer.mjs hyperframes/crear-oc
 *
 * - La grabación va dentro de `#camara`, que es lo único que se anima para los zooms
 *   (scale + x/y, transformOrigin 0 0). Cada zoom centra la caja del elemento sin mostrar bordes
 *   vacíos; los zooms cercanos se encadenan sin volver a 1×.
 * - Una `<audio>` con id por parte del guion.
 * - La apertura es una subcomposición (`compositions/apertura.html`).
 * - El logo de The Automation Partner está fuera de la cámara y debajo del fundido a negro.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const proyecto = process.argv[2] ?? 'hyperframes/crear-oc'
const tl = JSON.parse(readFileSync(join(proyecto, 'assets', 'timeline.json'), 'utf8'))

/* ===== Parámetros ===== */
const W = 1920
const H = 1080
const K = W / tl.viewport.width // px de página → px del lienzo
const APERTURA = 4.2 // duración de la subcomposición de apertura
const T0 = 3.2 // cuando arranca la grabación (debajo del fundido de la apertura)
const FUNDIDO_FINAL = 1.2
const TOTAL = +(T0 + tl.duracion).toFixed(3)
const ESCALA_MAX = 2.6
const MARGEN = 70 // aire alrededor de la caja, en px del lienzo
const TRANSICION = 0.7
const ENCADENAR = 1.4 // si el próximo zoom empieza antes de esto, no se vuelve a 1×

/* ===== Zooms → estados de cámara ===== */
function estado(caja) {
  const bx = caja.x * K
  const by = caja.y * K
  const bw = caja.width * K
  const bh = caja.height * K
  let s = Math.min(ESCALA_MAX, W / (bw + 2 * MARGEN), H / (bh + 2 * MARGEN))
  if (s < 1.06) return { scale: 1, x: 0, y: 0 }
  const cx = bx + bw / 2
  const cy = by + bh / 2
  // Centrar la caja y no mostrar bordes vacíos.
  const x = Math.min(0, Math.max(W - W * s, W / 2 - s * cx))
  const y = Math.min(0, Math.max(H - H * s, H / 2 - s * cy))
  return { scale: +s.toFixed(4), x: +x.toFixed(1), y: +y.toFixed(1) }
}

const zooms = tl.zooms
  .map((z) => ({ ...z, desde: z.desde + T0, hasta: z.hasta + T0, estado: estado(z.caja) }))
  .filter((z) => z.estado.scale > 1)
  .sort((a, b) => a.desde - b.desde)

const tweens = []
let enZoom = false
for (let i = 0; i < zooms.length; i++) {
  const z = zooms[i]
  const sig = zooms[i + 1]
  // El acercamiento arranca un poco antes de la palabra, para llegar cuando la voz lo nombra.
  const inicio = Math.max(T0, z.desde - 0.25)
  tweens.push({ t: inicio, d: enZoom ? 0.8 : TRANSICION, ...z.estado, ease: 'power2.inOut', nota: `${z.parte} zoom` })
  enZoom = true
  const fin = sig ? Math.min(z.hasta, sig.desde - 0.25) : z.hasta
  if (!sig || sig.desde - 0.25 - fin > ENCADENAR) {
    const vuelta = Math.min(fin, TOTAL - FUNDIDO_FINAL - TRANSICION)
    tweens.push({ t: Math.max(vuelta, inicio + TRANSICION + 0.3), d: TRANSICION, scale: 1, x: 0, y: 0, ease: 'power2.inOut', nota: `${z.parte} vuelve` })
    enZoom = false
  }
}
// Que ningún tween empiece antes de que termine el anterior.
for (let i = 1; i < tweens.length; i++) {
  const finPrev = tweens[i - 1].t + tweens[i - 1].d
  if (tweens[i].t < finPrev + 0.01) tweens[i].t = finPrev + 0.01
}

const lineasCamara = tweens
  .map(
    (t) =>
      `      tl.to("#camara", { scale: ${t.scale}, x: ${t.x}, y: ${t.y}, duration: ${t.d}, ease: "${t.ease}" }, ${t.t.toFixed(3)}); // ${t.nota}`,
  )
  .join('\n')

const audios = tl.partes
  .map(
    (p) =>
      `      <audio id="voz-${p.id}" src="audio/${p.audio}" data-start="${(T0 + p.inicio).toFixed(3)}" data-duration="${p.duracionAudio.toFixed(3)}" data-track-index="${3}" data-volume="1"></audio>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Cómo crear una orden de compra</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: #000;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #fff;
      }
      /* La cámara: lo único que se mueve en los zooms. */
      #camara {
        position: absolute;
        left: 0;
        top: 0;
        width: 1920px;
        height: 1080px;
        transform-origin: 0 0;
      }
      #grabacion {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      #marca {
        position: absolute;
        right: 48px;
        bottom: 40px;
        width: 300px;
        height: 115px;
        transform-origin: 100% 100%;
      }
      #marca img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      #negro {
        position: absolute;
        inset: 0;
        background: #000;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
      <div id="camara">
        <video id="grabacion" src="assets/${tl.video}" data-start="${T0}" data-duration="${tl.duracion.toFixed(3)}" data-track-index="0" muted playsinline></video>
      </div>

      <div
        id="apertura"
        data-composition-id="apertura"
        data-composition-src="compositions/apertura.html"
        data-start="0"
        data-duration="${APERTURA}"
        data-track-index="1"
        data-width="1920"
        data-height="1080"
      ></div>

      <!-- Logo de The Automation Partner: fuera de la cámara (no se agranda con los zooms). -->
      <div id="marca"><img src="assets/logo-tap.png" alt="The Automation Partner" /></div>

${audios}

      <!-- Fundido desde negro al principio y a negro al final: por encima de todo. -->
      <div id="negro"></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });

      // Fundido desde negro.
      tl.fromTo("#negro", { opacity: 1 }, { opacity: 0, duration: 0.9, ease: "power1.out" }, 0);

      // Logo de TAP: entra junto con el logo de la app y, terminada la apertura, pasa a marca de agua.
      tl.fromTo("#marca", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.5);
      tl.to("#marca", { scale: 0.6, opacity: 0.35, duration: 0.8, ease: "power2.inOut" }, ${APERTURA.toFixed(2)});

      // Cámara: zooms sobre lo que nombra la voz.
      tl.set("#camara", { scale: 1, x: 0, y: 0 }, 0);
${lineasCamara}

      // Fundido a negro.
      tl.to("#negro", { opacity: 1, duration: ${FUNDIDO_FINAL}, ease: "power1.in" }, ${(TOTAL - FUNDIDO_FINAL).toFixed(3)});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
writeFileSync(join(proyecto, 'index.html'), html)
console.log(`index.html: ${TOTAL} s, ${zooms.length} zooms, ${tweens.length} movimientos de cámara`)
