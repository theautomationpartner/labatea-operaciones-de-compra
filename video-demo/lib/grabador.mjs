/**
 * Módulo común de grabación.
 *
 * - Chrome con viewport 1600×900 y deviceScaleFactor 1,2: la página se dibuja en 1920×1080.
 * - Cuadros PNG por CDP (Page.startScreencast, con ack de cada cuadro). Chrome manda cuadros sólo
 *   cuando la pantalla cambia; el montaje repite el último.
 * - Reloj de la parte: segundos desde que empezó la parte SIN contar las cargas (que se cortan en el
 *   montaje). Así `en('palabra')` espera exactamente hasta que la voz dice esa palabra.
 * - Cursor dibujado dentro de la página (para que salga en el screencast), con easing y un círculo
 *   que se expande en cada clic.
 * - Todo lo que escribe la app se intercepta (ver `seguridad.mjs`).
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearSeguridad } from './seguridad.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
export const VIEWPORT = { width: 1600, height: 900 }
/* 1600×900 × 1,2 = 1920×1080. (Con 2,4 da 4K, pero en este equipo, con poca RAM, Chrome no llega:
   ~11 cuadros por segundo y las acciones se atrasan respecto de la voz.) */
const ESCALA = Number(process.env.ESCALA ?? 1.2)
const RETRASO_TECLA = 75
const COLA_PARTE = 0.7
/** Modo de prueba de selectores: sin esperar a la voz y sin guardar cuadros. */
const RAPIDO = Boolean(process.env.RAPIDO)

const ahora = () => Date.now() / 1000
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** El cursor y el círculo de clic, inyectados en cada documento. */
const CURSOR_JS = `(() => {
  const montar = () => {
    if (document.getElementById('__cursor')) return
    const c = document.createElement('div')
    c.id = '__cursor'
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.9 L11.6 21.6 L14.6 20.3 L11.6 13.7 L17.8 13.7 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: 'fixed', top: '0px', width: '26px', height: '26px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', left: '-100px' })
    document.documentElement.appendChild(c)
    const st = document.createElement('style')
    st.textContent = '@keyframes __ripple{from{transform:translate(-50%,-50%) scale(.2);opacity:.85}to{transform:translate(-50%,-50%) scale(1);opacity:0}}'
    document.documentElement.appendChild(st)
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      Object.assign(r.style, { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '54px', height: '54px', borderRadius: '50%', border: '3px solid rgba(30,111,255,.95)', background: 'rgba(30,111,255,.18)', zIndex: 2147483646, pointerEvents: 'none', animation: '__ripple .6s ease-out forwards' })
      document.documentElement.appendChild(r)
      setTimeout(() => r.remove(), 700)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar)
  else montar()
})()`

/**
 * Mientras se graba, Windows no tiene que suspender el equipo: una suspensión congela el reloj de la
 * voz y, al despertar, Vite recarga la página. Se pide con SetThreadExecutionState y se libera al
 * terminar (al cerrar el proceso de PowerShell).
 */
function mantenerDespierto() {
  if (process.platform !== 'win32') return { soltar() {} }
  const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `
    Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
    [W.P]::SetThreadExecutionState(0x80000003) | Out-Null
    while ($true) { Start-Sleep -Seconds 30; [W.P]::SetThreadExecutionState(0x80000003) | Out-Null }
  `], { stdio: 'ignore' })
  return { soltar: () => ps.kill() }
}

export async function iniciarGrabacion({ nombre, url = 'http://localhost:5182/', listo }) {
  const despierto = mantenerDespierto()
  const dir = join(RAIZ, 'grabaciones', nombre)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'cuadros'), { recursive: true })

  const seg = crearSeguridad()
  /* El screencast de Chrome headless captura al tamaño de la vista en px CSS e ignora el
     deviceScaleFactor emulado: con la escala forzada al lanzar Chrome, los cuadros salen en 4K. */
  const browser = await chromium.launch({ channel: 'chrome', args: [`--force-device-scale-factor=${ESCALA}`] })
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: ESCALA })
  await seg.instalar(context)
  await context.addInitScript(CURSOR_JS)
  const page = await context.newPage()

  const duraciones = Object.fromEntries(
    JSON.parse(readFileSync(join(RAIZ, 'audio', 'duraciones.json'), 'utf8')).map((d) => [d.id, d]),
  )

  // Carga inicial: fuera de la grabación.
  await page.goto(url, { timeout: 120000 })
  await page.waitForLoadState('networkidle', { timeout: 120000 })
  if (listo) await listo(page)
  await page.mouse.move(VIEWPORT.width * 0.55, VIEWPORT.height * 0.55)
  await page.waitForTimeout(800)

  /* ===== Screencast ===== */
  const cuadros = [] // { t, archivo }
  const escrituras = []
  let n = 0
  let sesionActiva = null
  async function filmar(pg) {
    if (sesionActiva) await sesionActiva.send('Page.stopScreencast').catch(() => {})
    const s = await pg.context().newCDPSession(pg)
    s.on('Page.screencastFrame', (f) => {
      s.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
      if (sesionActiva !== s || RAPIDO) return
      const archivo = `${String(n++).padStart(6, '0')}.png`
      cuadros.push({ t: f.metadata.timestamp, archivo })
      escrituras.push(writeFile(join(dir, 'cuadros', archivo), Buffer.from(f.data, 'base64')))
    })
    sesionActiva = s
    await s.send('Page.startScreencast', { format: 'png', maxWidth: Math.round(VIEWPORT.width * ESCALA), maxHeight: Math.round(VIEWPORT.height * ESCALA), everyNthFrame: 1 })
  }
  await filmar(page)
  await espera(400)
  const inicio = ahora()

  /* ===== Línea de tiempo ===== */
  const cargas = [] // [desde, hasta] en tiempo de pared
  const partes = [] // { id, inicio (pared), duracion }
  const zooms = [] // { parte, desde, hasta (reloj de la parte), caja }
  let parteActual = null

  const cortadoDesde = (t0) =>
    cargas.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(b, ahora()) - Math.max(a, t0)), 0)
  const reloj = () => (parteActual ? ahora() - parteActual.inicio - cortadoDesde(parteActual.inicio) : 0)
  /**
   * Con poca RAM, Windows pagina y la página se congela unos segundos mientras la voz sigue: al
   * volver, la imagen queda atrasada. Se mide que la página siga dibujando (doble
   * requestAnimationFrame); si tarda, ese tramo se marca como carga y se corta en el montaje, así la
   * voz y la imagen no se desfasan.
   */
  const trabas = []
  async function sondear() {
    if (RAPIDO) return
    const t = ahora()
    try {
      // Con tope de 8 s: el visor de PDF de la pestaña puede no responder a evaluate.
      await Promise.race([
        pagina.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))),
        espera(8000),
      ])
    } catch {}
    const d = ahora() - t
    if (d > 0.25) {
      cargas.push([t + 0.1, ahora()])
      trabas.push(+d.toFixed(2))
      console.log(`  ⏸ la página se trabó ${d.toFixed(1)} s (se corta)`)
    }
  }
  const esperarReloj = async (seg) => {
    if (RAPIDO) return
    while (reloj() < seg) {
      await sondear()
      if (reloj() < seg) await espera(Math.min(80, (seg - reloj()) * 1000 + 1))
    }
  }

  /** Marca una carga: lo que dura `fn` se corta en el montaje (salvo un instante al principio). */
  async function carga(fn) {
    const a = ahora() + 0.3
    /* Durante la carga (que se corta) se pausa el screencast: codificar PNG 4K le roba CPU a la
       página, y hay cargas pesadas (el PDF de la orden se arma en el hilo principal). */
    await espera(300)
    const pausada = sesionActiva
    if (!RAPIDO) await pausada?.send('Page.stopScreencast').catch(() => {})
    await fn()
    if (!RAPIDO && pausada === sesionActiva) await pausada.send('Page.startScreencast', { format: 'png', maxWidth: Math.round(VIEWPORT.width * ESCALA), maxHeight: Math.round(VIEWPORT.height * ESCALA), everyNthFrame: 1 })
    await espera(150)
    const b = ahora()
    if (b > a) cargas.push([a, b])
  }

  /* ===== Cursor ===== */
  let pos = { x: VIEWPORT.width * 0.55, y: VIEWPORT.height * 0.55 }
  let pagina = page
  async function moverA(x, y, ms) {
    const desde = { ...pos }
    const dist = Math.hypot(x - desde.x, y - desde.y)
    const dur = ms ?? Math.min(900, Math.max(280, dist * 0.9))
    const pasos = Math.max(8, Math.round(dur / 16))
    for (let i = 1; i <= pasos; i++) {
      const k = easeInOut(i / pasos)
      await pagina.mouse.move(desde.x + (x - desde.x) * k, desde.y + (y - desde.y) * k)
      await espera(dur / pasos)
    }
    pos = { x, y }
  }

  async function cajaDe(objetivo) {
    if (objetivo && typeof objetivo.then === 'function') objetivo = await objetivo
    if (!objetivo) throw new Error('objetivo vacío')
    if ('x' in objetivo && 'width' in objetivo) return objetivo
    const loc = objetivo
    await loc.waitFor({ state: 'visible', timeout: 30000 })
    const caja = await loc.boundingBox()
    if (!caja) throw new Error(`sin caja: ${loc}`)
    return caja
  }

  /** Une varias cajas (o locators) en una sola. */
  async function unir(...objetivos) {
    const cs = await Promise.all(objetivos.map(cajaDe))
    const x = Math.min(...cs.map((c) => c.x))
    const y = Math.min(...cs.map((c) => c.y))
    const x2 = Math.max(...cs.map((c) => c.x + c.width))
    const y2 = Math.max(...cs.map((c) => c.y + c.height))
    return { x, y, width: x2 - x, height: y2 - y }
  }

  async function mover(objetivo, { dx = 0.5, dy = 0.5 } = {}) {
    const c = await cajaDe(objetivo)
    await moverA(c.x + c.width * dx, c.y + c.height * dy)
  }

  /** Registro de clics (hora de pared y posición): sirve para medir el retraso de la imagen. */
  const clics = []
  async function clic(objetivo, opts = {}) {
    await mover(objetivo, opts)
    await espera(120)
    clics.push({ t: ahora(), x: pos.x, y: pos.y, parte: parteActual?.id, reloj: +reloj().toFixed(2), pestana: pagina !== page })
    await pagina.mouse.down()
    await espera(70)
    await pagina.mouse.up()
    await espera(150)
    await sondear()
  }

  async function tipear(texto) {
    for (const ch of texto) {
      await pagina.keyboard.type(ch)
      await espera(RETRASO_TECLA)
    }
    await sondear()
  }

  /** Deja el cursor justo debajo de la caja, para que no tape lo que se remarca. */
  async function apartarCursor(c) {
    const margen = 10
    const dentro = pos.x >= c.x - 30 && pos.x <= c.x + c.width + 30 && pos.y >= c.y - 30 && pos.y <= c.y + c.height + margen
    if (!dentro) return
    const y = Math.min(VIEWPORT.height - 30, c.y + c.height + margen)
    const x = Math.min(Math.max(pos.x, c.x + 8), c.x + c.width - 8)
    await moverA(x, y, 320)
  }

  /**
   * Zoom sobre `objetivo` desde ahora hasta `hasta` (palabra de la voz o segundos del reloj de la
   * parte). No espera: sólo deja la marca (y aparta el cursor).
   */
  async function zoom(objetivo, { hasta, apartar = true } = {}) {
    const caja = await cajaDe(objetivo)
    if (apartar) await apartarCursor(caja)
    const desde = reloj()
    const fin = typeof hasta === 'string' ? tiempoDe(hasta, true) : hasta ?? desde + 2.5
    zooms.push({ parte: parteActual.id, desde: +desde.toFixed(3), hasta: +Math.max(fin, desde + 1).toFixed(3), caja })
  }

  /* ===== Voz ===== */
  let indicePalabra = 0
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  /** Tiempo (en el audio de la parte) de la próxima aparición de la palabra. `@2` = segunda aparición. */
  function tiempoDe(clave, sinAvanzar = false) {
    const [palabra, vez = '1'] = clave.split('@')
    const ps = duraciones[parteActual.id].palabras
    let cuenta = 0
    for (let i = indicePalabra; i < ps.length; i++) {
      if (norm(ps[i].w) === norm(palabra) && ++cuenta === Number(vez)) {
        if (!sinAvanzar) indicePalabra = i + 1
        return ps[i].t
      }
    }
    throw new Error(`La palabra "${clave}" no está (desde el índice ${indicePalabra}) en ${parteActual.id}`)
  }
  /** Espera a que la voz llegue a la palabra (y le da `antes` segundos de anticipación). */
  const en = async (clave, antes = 0) => esperarReloj(tiempoDe(clave) - antes)

  async function parte(id, fn) {
    const d = duraciones[id]
    parteActual = { id, inicio: ahora() }
    indicePalabra = 0
    partes.push({ id, inicio: parteActual.inicio, duracion: d.duracion })
    console.log(`▶ ${id} (${d.duracion.toFixed(1)} s)`)
    await fn()
    if (reloj() > d.duracion + COLA_PARTE) console.log(`  ⚠️ las acciones de ${id} duran más que su audio (${reloj().toFixed(1)} s)`)
    await esperarReloj(d.duracion + COLA_PARTE)
  }

  /** Pasa la filmación a otra pestaña (y vuelve con `volver`). */
  async function filmarPestana(pg) {
    pagina = pg
    await filmar(pg)
  }
  async function volverA(pg) {
    pagina = pg
    await pg.bringToFront()
    await filmar(pg)
  }

  async function terminar() {
    await espera(600)
    const fin = ahora()
    await sesionActiva?.send('Page.stopScreencast').catch(() => {})
    await Promise.all(escrituras)
    const datos = {
      nombre,
      viewport: VIEWPORT,
      escala: ESCALA,
      inicio,
      fin,
      cuadros,
      cargas,
      trabas,
      clics,
      partes,
      zooms,
      bloqueados: seg.bloqueados,
      lecturas: seg.lecturas,
    }
    writeFileSync(join(dir, 'grabacion.json'), JSON.stringify(datos, null, 1))
    await page.screenshot({ path: join(dir, 'captura-final.png') }).catch(() => {})
    await browser.close()
    despierto.soltar()
    /* Un salto de más de 20 s entre cuadros sin cargas que lo expliquen es una suspensión o un cuelgue. */
    const saltos = cuadros.slice(1).filter((c, i) => c.t - cuadros[i].t > 20).length
    if (saltos) console.log(`  ⚠️ hay ${saltos} saltos de más de 20 s entre cuadros: revisar la toma`)
    if (trabas.length) console.log(`  ⏸ ${trabas.length} trabas de la página, ${trabas.reduce((a, b) => a + b, 0).toFixed(1)} s en total (cortadas)`)
    console.log(`■ ${cuadros.length} cuadros en ${(fin - inicio).toFixed(1)} s · cargas cortadas: ${cargas.length}`)
    console.log('Bloqueado durante la grabación:')
    for (const b of seg.bloqueados) console.log(`  · ${b.metodo} ${new URL(b.url).pathname} — ${b.motivo}`)
    if (!seg.bloqueados.length) console.log('  (nada)')
    console.log('Lecturas:', seg.lecturas)
    return datos
  }

  return {
    page,
    context,
    parte,
    en,
    reloj,
    esperarReloj,
    carga,
    clic,
    mover,
    moverA,
    tipear,
    zoom,
    unir,
    cajaDe,
    filmarPestana,
    volverA,
    terminar,
    espera,
    get pos() {
      return pos
    },
  }
}
