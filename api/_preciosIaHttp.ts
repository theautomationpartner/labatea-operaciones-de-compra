/**
 * La ruta de `/api/precios-ia`, compartida por la función de Vercel y el servidor de Vite en
 * desarrollo: lo que se prueba en local es el mismo análisis que corre en producción.
 *
 *   POST  cuerpo: JSON { proveedor, productos, lista }
 *         → un flujo NDJSON (un evento JSON por línea) mientras la IA trabaja:
 *             {"tipo":"progreso","fase":"analizando"}
 *             {"tipo":"progreso","fase":"respondiendo","hechos":42,"total":157}
 *             {"tipo":"latido"}                       cada 5 s, mantiene viva la conexión
 *             {"tipo":"resultado","productos":[…]}    al final, o
 *             {"tipo":"error","error":"…"}
 *
 * Un pedido mal armado se rechaza ANTES de abrir el flujo, con su status y `{ error }`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { analizarLista, ErrorAnalisis, type PedidoAnalisis } from './_preciosIa.js'

const LATIDO_MS = 5000

type Pedido = IncomingMessage & { body?: unknown }

/** Tope del cuerpo: el de Vercel es 4,5 MB. */
const MAX_CUERPO = 4_400_000

export async function manejarPreciosIa(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
  let pedido: Partial<PedidoAnalisis>
  try {
    const cuerpo = await leerCuerpo(req)
    if (cuerpo.length > MAX_CUERPO) {
      return responder(res, 413, { error: 'La lista es demasiado grande para analizarla de una vez.' })
    }
    pedido = JSON.parse(cuerpo.toString('utf8') || '{}') as Partial<PedidoAnalisis>
  } catch {
    return responder(res, 400, { error: 'El pedido no es un JSON válido.' })
  }
  if (!Array.isArray(pedido.productos) || typeof pedido.lista !== 'string') {
    return responder(res, 400, { error: 'Faltan los productos o la lista.' })
  }

  /* Desde acá la respuesta es un flujo: cada evento sale apenas ocurre. `no-transform` y
     `x-accel-buffering` evitan que un proxy lo junte y lo entregue todo al final. */
  res.statusCode = 200
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('cache-control', 'no-store, no-transform')
  res.setHeader('x-accel-buffering', 'no')
  const enviar = (evento: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(evento)}\n`)
  }
  const latido = setInterval(() => enviar({ tipo: 'latido' }), LATIDO_MS)
  try {
    const productos = await analizarLista(
      { proveedor: String(pedido.proveedor ?? ''), productos: pedido.productos, lista: pedido.lista },
      (progreso) => enviar({ tipo: 'progreso', ...progreso }),
    )
    enviar({ tipo: 'resultado', productos })
  } catch (e) {
    console.error('[api/precios-ia]', e)
    enviar({ tipo: 'error', error: mensajeDeError(e) })
  } finally {
    clearInterval(latido)
    res.end()
  }
}

/** Lo que falló, dicho para quien mira la pantalla. */
function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorAnalisis) return e.message
  if (e instanceof Anthropic.RateLimitError) return 'La IA está saturada en este momento. Probá de nuevo en un minuto.'
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de la API de Claude no es válida.'
  if (e instanceof Anthropic.APIError) return 'La IA no pudo analizar la lista. Probá de nuevo en unos segundos.'
  return 'No se pudo analizar la lista.'
}

/** El cuerpo, tal cual. En Vercel, con `application/json`, puede venir ya parseado en `req.body`. */
async function leerCuerpo(req: Pedido): Promise<Buffer> {
  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  const cuerpo = Buffer.concat(partes)
  if (cuerpo.length) return cuerpo
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body))
  return cuerpo
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}
