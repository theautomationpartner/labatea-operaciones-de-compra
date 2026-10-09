/**
 * Serverless Function (Vercel) — análisis con Claude de la lista de precios de un proveedor.
 *
 *   POST  cuerpo: JSON { proveedor, productos, lista }  → { productos }
 *
 * Necesita `ANTHROPIC_API_KEY` en las variables del proyecto. Los prompts viajan con la función
 * (`includeFiles: "prompts/**"` en `vercel.json`).
 *
 * ── OJO: igual que `api/monday.ts`, esta ruta todavía no tiene portero ──
 * Antes de un uso real hay que traer el guardián de "Operaciones de venta" (`api/_guard.ts`): sin
 * él, cualquiera que conozca la URL puede gastar la cuenta de la API de Claude.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { manejarPreciosIa } from './_preciosIaHttp.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await manejarPreciosIa(req, res)
}
