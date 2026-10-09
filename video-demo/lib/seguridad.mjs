/**
 * Reglas de seguridad de la grabación: NADA de lo que escribe la app llega a destino.
 *
 * - `/monday-api` (GraphQL): las `query` pasan (y se guardan en caché en disco, así las tomas
 *   siguientes no vuelven a pegarle a Monday); las `mutation` se contestan con un ok falso que tiene
 *   la forma que espera la app (`{ data: { <alias>: { id } } }`).
 * - `/monday-api-file` (subida de archivos), `/api/make-envio-oc` (envío por Make) y
 *   `/api/precios-ia` (IA): se bloquean con un ok falso.
 * - Cualquier otro pedido que no sea GET a un host externo se bloquea por las dudas.
 *
 * Todo lo bloqueado queda en `bloqueados` para el informe de cada toma.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(RAIZ, 'cache', 'monday')
mkdirSync(CACHE, { recursive: true })

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/** Los campos raíz de una mutation (con su alias, si tiene): `s0: create_subitem(` → "s0". */
function raicesDe(query) {
  const cuerpo = query.slice(query.indexOf('{') + 1)
  const raices = []
  let nivel = 0
  for (const linea of cuerpo.split('\n')) {
    if (nivel === 0) {
      const m = /^\s*(?:(\w+)\s*:\s*)?(\w+)\s*\(/.exec(linea)
      if (m) raices.push(m[1] ?? m[2])
    }
    for (const c of linea) {
      if (c === '{') nivel++
      else if (c === '}') nivel--
    }
  }
  return raices
}

let idFalso = 900000000
const okFalso = (query) =>
  Object.fromEntries(raicesDe(query).map((r) => [r, { id: String(++idFalso) }]))

export function crearSeguridad({ log = console.log } = {}) {
  const bloqueados = []
  const lecturas = { cache: 0, red: 0, r429: 0 }

  const bloquear = async (route, motivo, cuerpo) => {
    const req = route.request()
    bloqueados.push({ hora: new Date().toISOString(), metodo: req.method(), url: req.url(), motivo })
    log(`  ⛔ bloqueado: ${motivo}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  }

  async function instalar(context) {
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

      if (local && url.pathname.startsWith('/monday-api-file')) {
        return bloquear(route, 'subida de archivo a Monday', { data: { add_file_to_column: { id: String(++idFalso) } } })
      }
      if (local && url.pathname.startsWith('/api/make-envio-oc')) {
        return bloquear(route, 'envío de la orden por Make.com', {
          operacion: 'simulada', medio: 'email', mensajeError: '', enviosEmail: [], enviosWhatsapp: [],
        })
      }
      if (local && url.pathname.startsWith('/api/precios-ia')) {
        return bloquear(route, 'análisis de precios con IA', { ok: true })
      }
      if (local && url.pathname.startsWith('/monday-api')) {
        const cuerpo = req.postData() ?? ''
        let query = ''
        try {
          query = JSON.parse(cuerpo).query ?? ''
        } catch {}
        if (/^\s*mutation\b/.test(query)) {
          const nombre = raicesDe(query).join(', ')
          return bloquear(route, `mutation de Monday (${nombre})`, { data: okFalso(query) })
        }
        // Lectura: caché en disco por el cuerpo exacto del pedido.
        const clave = createHash('sha1').update(cuerpo).digest('hex')
        const archivo = join(CACHE, `${clave}.json`)
        if (existsSync(archivo)) {
          lecturas.cache++
          return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(archivo, 'utf8') })
        }
        for (let intento = 0; intento < 6; intento++) {
          const res = await route.fetch()
          if (res.status() === 429) {
            lecturas.r429++
            const seg = Number(res.headers()['retry-after']) || 30
            log(`  ⚠️ Monday respondió 429: espero ${seg}s`)
            await espera(seg * 1000)
            continue
          }
          const texto = await res.text()
          lecturas.red++
          if (res.ok()) {
            try {
              const json = JSON.parse(texto)
              if (json.data && !json.errors) writeFileSync(archivo, texto)
            } catch {}
          }
          return route.fulfill({ status: res.status(), contentType: 'application/json', body: texto })
        }
        return route.abort()
      }
      // Fuera de las rutas conocidas: lecturas (GET/HEAD/OPTIONS) pasan; cualquier escritura se bloquea.
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue()
      return bloquear(route, `pedido ${req.method()} no previsto`, { ok: true, data: {} })
    })
  }

  return { instalar, bloqueados, lecturas }
}
