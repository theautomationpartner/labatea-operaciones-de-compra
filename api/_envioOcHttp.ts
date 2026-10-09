/**
 * La ruta de `/api/make-envio-oc`, compartida por la función de Vercel y el servidor de Vite en
 * desarrollo: lo que se prueba en local es el mismo envío que corre en producción.
 *
 * Reenvía el cuerpo (JSON con la orden, los destinatarios y el PDF en base64) al webhook del
 * escenario de Make.com que manda la orden de compra al proveedor, y devuelve lo que contestó.
 * La dirección del webhook vive SÓLO del lado servidor (este archivo no entra al bundle): publicada
 * en el navegador, cualquiera podría disparar el escenario y gastar las operaciones de la cuenta.
 * Se lee SÓLO de `MAKE_WEBHOOK_ENVIO_OC_URL` (`.env.local` en desarrollo, variables del proyecto
 * en el servidor): el repositorio es público y la URL no puede quedar escrita en el código.
 *
 * ── OJO: igual que `api/monday.ts`, esta ruta todavía no tiene portero ──
 * Antes de un uso real hay que traer el guardián de "Operaciones de venta" (`api/_guard.ts`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

type Pedido = IncomingMessage & { body?: unknown }

/** Tope del cuerpo: el de Vercel es 4,5 MB. Un PDF de orden pesa unos KB. */
const MAX_CUERPO = 4_400_000

/** Si en un minuto el escenario no contestó, está trabado: no vale la pena seguir esperando. */
const TIMEOUT_MS = 60_000

export async function manejarEnvioOc(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Method Not Allowed' })
  /* Webhook del escenario "Envío de Orden de Compra" en Make.com. */
  const webhook = process.env.MAKE_WEBHOOK_ENVIO_OC_URL?.trim()
  if (!webhook) {
    console.error('[api/make-envio-oc] Falta la variable de entorno MAKE_WEBHOOK_ENVIO_OC_URL')
    return responder(res, 500, { error: 'El envío de la orden no está configurado en el servidor.' })
  }
  try {
    const cuerpo = await leerCuerpo(req)
    if (cuerpo.length > MAX_CUERPO) {
      return responder(res, 413, { error: 'La orden es demasiado grande para enviarla.' })
    }
    const control = new AbortController()
    const corte = setTimeout(() => control.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: cuerpo.toString('utf8'),
        signal: control.signal,
      })
      const texto = await r.text()
      res.statusCode = r.status
      res.setHeader('content-type', r.headers.get('content-type') ?? 'text/plain')
      res.setHeader('cache-control', 'no-store')
      res.end(texto)
    } finally {
      clearTimeout(corte)
    }
  } catch (e) {
    console.error('[api/make-envio-oc]', e)
    if (e instanceof Error && e.name === 'AbortError') {
      return responder(res, 504, { error: 'El escenario de envío tardó demasiado en responder.' })
    }
    return responder(res, 502, { error: 'No se pudo contactar al escenario de envío.' })
  }
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
