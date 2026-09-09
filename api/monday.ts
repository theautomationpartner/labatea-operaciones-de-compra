/**
 * Serverless Function (Vercel) — proxy de la API GraphQL de Monday.
 *
 * El navegador pega contra `/api/monday` (mismo origen, sin CORS) y esta función reenvía a
 * https://api.monday.com/v2 inyectando el token desde `MONDAY_TOKEN` (variable de entorno del
 * servidor, SIN prefijo VITE_). Así el token nunca viaja al bundle del cliente: es lo que permite
 * publicar el repo y el deploy sin publicar también la credencial.
 *
 * Equivale al proxy de Vite (`/monday-api`) que sólo existe en desarrollo.
 *
 * ── OJO: esta puerta todavía no tiene portero ──
 * "Operaciones de venta" verifica, antes de reenviar, la firma del session token del usuario y su
 * alta en una lista blanca. Acá eso NO está: cualquiera que conozca la URL del deploy puede mandar
 * GraphQL arbitrario y escribir en los tableros con el token del servidor. El token deja de estar
 * expuesto, pero la ruta que lo usa sí lo está. Antes de un uso real hay que traer el guardián de
 * venta (`api/_guard.ts` + `api/_whitelist.ts`); el punto donde se engancha es acá.
 *
 * ── Por qué la firma es (req, res) y no la web ──
 * En el runtime de Node, Vercel invoca al `export default` con los objetos de `node:http`: el `req`
 * es un `IncomingMessage`, no un `Request` del estándar web. Escrita con la firma web, la primera
 * línea que toca `req.headers.get(...)` revienta con `FUNCTION_INVOCATION_FAILED`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

const API_VERSION = '2024-10'

/** El cuerpo puede venir ya parseado por el runtime: con `application/json`, lo hace siempre. */
type Pedido = IncomingMessage & { body?: unknown }

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return responder(res, 405, { errors: [{ message: 'Method Not Allowed' }] })
  }

  const token = process.env.MONDAY_TOKEN
  if (!token) {
    return responder(res, 500, {
      errors: [{ message: 'MONDAY_TOKEN no está configurado en el servidor.' }],
    })
  }

  try {
    /* Se reenvía el body tal cual (query + variables). La Authorization que hubiera mandado el
       cliente NO se reenvía: contra la API de Monday no vale nada y sólo confundiría. */
    const body = await leerCuerpo(req)
    const upstream = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'API-Version': API_VERSION,
      },
      body,
    })

    const texto = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    res.end(texto)
  } catch (e) {
    /* El detalle del fallo queda en el log del servidor; al cliente le llega el formato de error
       que ya sabe leer (`errors[]`), no un 500 mudo de la plataforma. */
    console.error('[api/monday]', e)
    return responder(res, 502, { errors: [{ message: 'No se pudo hablar con Monday.' }] })
  }
}

/** El cuerpo crudo, tal como lo mandó el cliente. Con JSON el runtime ya lo parseó: se rearma. */
async function leerCuerpo(req: Pedido): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)

  const partes: Buffer[] = []
  for await (const trozo of req) partes.push(Buffer.from(trozo))
  return Buffer.concat(partes).toString('utf8')
}

function responder(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}
