/**
 * Serverless Function (Vercel) — envío de la orden de compra al proveedor por Make.com.
 *
 *   POST  cuerpo: JSON con la orden, los destinatarios y el PDF  → la respuesta del escenario
 *
 * Necesita `MAKE_WEBHOOK_ENVIO_OC_URL` en las variables del proyecto. La lógica vive en
 * `_envioOcHttp.ts`, que también usa el servidor de Vite en desarrollo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { manejarEnvioOc } from './_envioOcHttp.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await manejarEnvioOc(req, res)
}
