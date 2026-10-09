/**
 * Actividades del widget "Emails & Activities" de un ítem (su timeline). Es donde queda, en cada
 * producto del Maestro, el registro de cada actualización de precio que hace la app.
 *
 * Una actividad necesita un TIPO de actividad de la cuenta ("custom activity"). El de la app,
 * "Actualización de precio", se busca por nombre y, si no existe, se crea una sola vez: así el
 * tablero no depende de que alguien lo haya dado de alta a mano.
 */
import { mondayApi } from './sdk'

/** El tipo de actividad de las actualizaciones de precio, tal como se ve en el widget. */
export const ACTIVIDAD_PRECIO = 'Actualización de precio'

/** Cuántas actividades viajan en una misma mutation (con alias). */
const TAMANIO_LOTE = 50

let idCache: Promise<string> | null = null

/** El id del tipo de actividad "Actualización de precio"; lo crea si la cuenta no lo tiene. */
function idActividadPrecio(): Promise<string> {
  idCache ??= (async () => {
    const { custom_activity } = await mondayApi<{ custom_activity: { id: string; name: string }[] }>(
      `query { custom_activity { id name } }`,
    )
    const existente = custom_activity.find((a) => a.name.trim().toLowerCase() === ACTIVIDAD_PRECIO.toLowerCase())
    if (existente) return existente.id
    const { create_custom_activity } = await mondayApi<{ create_custom_activity: { id: string } }>(
      `mutation ($n: String!) { create_custom_activity(name: $n, icon_id: ASCENDING, color: GO_GREEN) { id } }`,
      { n: ACTIVIDAD_PRECIO },
    )
    return create_custom_activity.id
  })().catch((e) => {
    idCache = null
    throw e
  })
  return idCache
}

/**
 * Registra una actividad "Actualización de precio" en cada ítem, de a `TAMANIO_LOTE` por mutation
 * (una sola consulta si son 50 o menos). Devuelve cuántas quedaron creadas.
 */
export async function crearActividadesPrecio(
  actividades: readonly { itemId: string; contenido: string }[],
  cuando: Date,
  /** Avance: cuántas actividades van procesadas, después de cada tanda. */
  onLote?: (hechas: number) => void,
): Promise<number> {
  if (!actividades.length) return 0
  const tipo = await idActividadPrecio()
  let creadas = 0
  for (let desde = 0; desde < actividades.length; desde += TAMANIO_LOTE) {
    const lote = actividades.slice(desde, desde + TAMANIO_LOTE)
    const declaraciones = [
      '$tipo: String!',
      '$titulo: String!',
      '$ts: ISO8601DateTime!',
      ...lote.map((_, i) => `$id${i}: ID!, $c${i}: String!`),
    ].join(', ')
    const raices = lote
      .map(
        (_, i) =>
          `  a${i}: create_timeline_item(item_id: $id${i}, custom_activity_id: $tipo, title: $titulo, summary: $c${i}, content: $c${i}, timestamp: $ts) { id }`,
      )
      .join('\n')
    const variables: Record<string, unknown> = { tipo, titulo: ACTIVIDAD_PRECIO, ts: cuando.toISOString() }
    lote.forEach((a, i) => {
      variables[`id${i}`] = a.itemId
      variables[`c${i}`] = a.contenido
    })
    const data = await mondayApi<Record<string, { id: string } | null>>(
      `mutation (${declaraciones}) {\n${raices}\n}`,
      variables,
    )
    creadas += lote.filter((_, i) => data[`a${i}`]?.id).length
    onLote?.(desde + lote.length)
  }
  return creadas
}
