/**
 * El análisis de la lista de precios con IA, del lado del navegador.
 *
 * La clave de la API de Claude vive en el servidor: el navegador pega contra `/api/precios-ia`
 * (middleware de Vite en desarrollo, función de Vercel en producción — ver `api/_preciosIa.ts`) con
 * la lista ya pasada a texto y los productos del proveedor.
 *
 * La respuesta es un flujo NDJSON (ver `api/_preciosIaHttp.ts`): mientras la IA trabaja llegan
 * eventos de avance, que se pasan a `onProgreso`, y al final el resultado.
 */
import type { ProductoPrecio } from '@/lib/precios'

/** Un producto que, según la IA, cambió de precio en la lista. */
export interface PrecioDetectado {
  id: string
  codigo: string
  nombre: string
  precioAnterior: number
  precioNuevo: number
  /** Los descuentos nuevos, o `null` si la lista no los cambia. */
  descuentosNuevos: number[] | null
  /** La bonificación en mercadería nueva, o `null` si la lista no la cambia. */
  bonifNueva: number | null
  codigoEnLista: string
  coincidencia: 'codigo' | 'nombre'
}

/** El análisis no se pudo hacer; el mensaje ya está escrito para mostrarse. */
export class ErrorAnalisisIa extends Error {}

/** Avance que informa el servidor (ver `Progreso` en `api/_preciosIa.ts`). */
export type ProgresoIa = { fase: 'analizando' } | { fase: 'respondiendo'; hechos: number; total: number }

type Evento =
  | ({ tipo: 'progreso' } & ProgresoIa)
  | { tipo: 'latido' }
  | { tipo: 'resultado'; productos: PrecioDetectado[] }
  | { tipo: 'error'; error: string }

const FALLA = 'No se pudo analizar la lista. Probá de nuevo en unos segundos.'

export async function analizarListaConIa(
  proveedor: string,
  productos: readonly ProductoPrecio[],
  lista: string,
  onProgreso: (p: ProgresoIa) => void = () => {},
): Promise<PrecioDetectado[]> {
  let res: Response
  try {
    res = await fetch('/api/precios-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor,
        productos: productos.map((p) => ({
          id: p.id,
          codigo: p.codigo,
          codigoProveedor: p.codigoProveedor,
          nombre: p.nombre,
          precioActual: p.costo,
          descuentosActuales: p.descuentos,
          bonifActual: p.bonif,
        })),
        lista,
      }),
    })
  } catch {
    throw new ErrorAnalisisIa('No hay conexión con el servidor. Revisá la red y probá de nuevo.')
  }
  /* Un pedido rechazado antes de empezar vuelve como JSON común, con su status. */
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ErrorAnalisisIa(json.error || FALLA)
  }

  /* El flujo llega en trozos que no respetan los renglones: se acumula y se procesa cada renglón
     completo; el resto queda esperando al próximo trozo. */
  const lector = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let pendiente = ''
  const procesar = (renglon: string): PrecioDetectado[] | null => {
    if (!renglon.trim()) return null
    let e: Evento
    try {
      e = JSON.parse(renglon) as Evento
    } catch {
      return null
    }
    if (e.tipo === 'progreso') onProgreso(e)
    if (e.tipo === 'error') throw new ErrorAnalisisIa(e.error || FALLA)
    return e.tipo === 'resultado' ? e.productos : null
  }
  try {
    for (;;) {
      const { value, done } = await lector.read()
      pendiente += value ?? ''
      const renglones = pendiente.split('\n')
      pendiente = done ? '' : (renglones.pop() ?? '')
      for (const r of renglones) {
        const resultado = procesar(r)
        if (resultado) return resultado
      }
      if (done) break
    }
  } catch (e) {
    if (e instanceof ErrorAnalisisIa) throw e
    throw new ErrorAnalisisIa('Se cortó la conexión con el servidor mientras se analizaba la lista. Probá de nuevo.')
  } finally {
    lector.cancel().catch(() => {})
  }
  throw new ErrorAnalisisIa('El análisis terminó sin resultado. Probá de nuevo.')
}
