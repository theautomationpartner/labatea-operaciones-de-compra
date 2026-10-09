/**
 * Montaje base de una grabación.
 * Uso: node scripts/montar.mjs <nombre> [dir-proyecto-hyperframes]
 *
 * - Corta los tramos de carga.
 * - Cada cuadro PNG dura hasta el siguiente (Chrome manda cuadros sólo cuando la pantalla cambia):
 *   se arma una lista concat con duraciones y se pasa a 30 fps parejos.
 * - Codifica un intermedio (1080p o 4K, según la escala de la grabación) (libx264 -crf 14 -tune animation).
 * - Escribe `timeline.json` con el inicio de cada audio y cada zoom, ya con los cortes aplicados.
 *
 * ffmpeg: toma FFMPEG del entorno o lo busca en la instalación de winget.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const nombre = process.argv[2] ?? 'crear-oc'
const destino = process.argv[3] ? join(RAIZ, process.argv[3]) : join(RAIZ, 'salidas', nombre)
const FPS = 30

function buscarFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  const base = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((x) => x.startsWith('Gyan.FFmpeg'))) {
      for (const sub of readdirSync(join(base, d))) {
        const exe = join(base, d, sub, 'bin', 'ffmpeg.exe')
        if (existsSync(exe)) return exe
      }
    }
  }
  return 'ffmpeg'
}

const dir = join(RAIZ, 'grabaciones', nombre)
const g = JSON.parse(readFileSync(join(dir, 'grabacion.json'), 'utf8'))
const ANCHO = Math.round(g.viewport.width * g.escala)
const ALTO = Math.round(g.viewport.height * g.escala)
const SUFIJO = ALTO >= 2160 ? '4k' : `${ALTO}p`
mkdirSync(destino, { recursive: true })

/* ===== Cortes ===== */
const cargas = [...g.cargas].sort((a, b) => a[0] - b[0])
/** Tiempo de pared → tiempo del video (desde `inicio`, sin las cargas). */
const mapa = (t) => {
  let cortado = 0
  for (const [a, b] of cargas) cortado += Math.max(0, Math.min(b, t) - Math.max(a, g.inicio))
  return Math.max(0, t - g.inicio - cortado)
}
const total = mapa(g.fin)

/* ===== Lista concat ===== */
const cuadros = g.cuadros.filter((c) => c.t <= g.fin)
// El cuadro vigente al empezar es el último anterior a `inicio`.
let desdeIdx = 0
for (let i = 0; i < cuadros.length; i++) if (cuadros[i].t <= g.inicio) desdeIdx = i
const usados = cuadros.slice(desdeIdx)
const lineas = ['ffconcat version 1.0']
let acumulado = 0
let ultimo = null
for (let i = 0; i < usados.length; i++) {
  const a = mapa(Math.max(usados[i].t, g.inicio))
  const b = i + 1 < usados.length ? mapa(usados[i + 1].t) : total
  const dur = b - a
  if (dur <= 0.0005) continue
  lineas.push(`file '${join(dir, 'cuadros', usados[i].archivo).replace(/\\/g, '/')}'`, `duration ${dur.toFixed(4)}`)
  acumulado += dur
  ultimo = usados[i].archivo
}
// El demuxer concat ignora la duración del último archivo: se repite.
lineas.push(`file '${join(dir, 'cuadros', ultimo).replace(/\\/g, '/')}'`)
const lista = join(destino, 'cuadros.ffconcat')
writeFileSync(lista, lineas.join('\n'))
console.log(`Duración del montaje: ${total.toFixed(2)} s (${cargas.length} cortes, ${(g.fin - g.inicio - total).toFixed(1)} s cortados)`)

/* ===== Intermedio 4K ===== */
const salida = join(destino, `${nombre}-base-${SUFIJO}.mp4`)
const ffmpeg = buscarFfmpeg()
console.log('Codificando', salida)
execFileSync(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error', '-stats',
    '-f', 'concat', '-safe', '0', '-i', lista,
    '-filter_threads', '1',
    // Chrome a veces redondea un píxel de menos: se completa con pad.
    '-vf', `fps=${FPS},pad=${ANCHO}:${ALTO}:0:0:white,format=yuv420p`,
    '-t', total.toFixed(3),
    '-c:v', 'libx264', '-crf', '14', '-tune', 'animation', '-preset', 'medium',
    // Poca RAM en este equipo: menos hilos y lookahead corto (la calidad la fija el crf).
    '-threads', '2', '-x264-params', 'rc-lookahead=10:sliced-threads=0',
    '-movflags', '+faststart',
    salida,
  ],
  { stdio: 'inherit' },
)

/* ===== Línea de tiempo ===== */
const partes = g.partes.map((p, i) => {
  const inicio = mapa(p.inicio)
  const fin = i + 1 < g.partes.length ? mapa(g.partes[i + 1].inicio) : total
  return { id: p.id, audio: `${p.id}.mp3`, inicio: +inicio.toFixed(3), duracionAudio: p.duracion, fin: +fin.toFixed(3) }
})
const zooms = g.zooms.map((z) => {
  const p = partes.find((x) => x.id === z.parte)
  return {
    parte: z.parte,
    desde: +(p.inicio + z.desde).toFixed(3),
    hasta: +Math.min(p.inicio + z.hasta, p.fin - 0.15).toFixed(3),
    caja: Object.fromEntries(Object.entries(z.caja).map(([k, v]) => [k, +v.toFixed(1)])),
  }
})
const timeline = { video: `${nombre}-base-${SUFIJO}.mp4`, fps: FPS, duracion: +total.toFixed(3), viewport: g.viewport, partes, zooms }
writeFileSync(join(destino, 'timeline.json'), JSON.stringify(timeline, null, 1))
console.log('Línea de tiempo:', join(destino, 'timeline.json'))
