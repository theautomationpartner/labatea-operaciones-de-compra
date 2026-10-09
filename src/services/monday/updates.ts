/**
 * Updates (la conversación de un ítem de Monday). Es donde queda el HISTORIAL de lo que la app hace
 * sobre un ítem: el envío de una orden, un reenvío, una consulta al proveedor, un cambio de costo.
 *
 * El autor del update es el dueño del token, así que el usuario de la app que hizo la acción va
 * NOMBRADO en el cuerpo.
 */
import { mondayApi } from './sdk'

/** Cuántos updates entran en una misma consulta (mismo criterio que los subelementos). */
const TAMANIO_LOTE = 20

/** Deja un update en un ítem. */
export async function crearUpdate(itemId: string, cuerpo: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $body: String!) { create_update(item_id: $id, body: $body) { id } }`,
    { id: itemId, body: cuerpo },
  )
}

/** Deja un update en cada ítem, en lotes con alias. Devuelve cuántos entraron. */
export async function crearUpdates(
  updates: readonly { itemId: string; cuerpo: string }[],
): Promise<number> {
  let creados = 0
  for (let desde = 0; desde < updates.length; desde += TAMANIO_LOTE) {
    const lote = updates.slice(desde, desde + TAMANIO_LOTE)
    const declaraciones = lote.map((_, i) => `$id${i}: ID!, $b${i}: String!`).join(', ')
    const raices = lote
      .map((_, i) => `  u${i}: create_update(item_id: $id${i}, body: $b${i}) { id }`)
      .join('\n')
    const variables: Record<string, unknown> = {}
    lote.forEach((u, i) => {
      variables[`id${i}`] = u.itemId
      variables[`b${i}`] = u.cuerpo
    })
    const data = await mondayApi<Record<string, { id: string } | null>>(
      `mutation (${declaraciones}) {\n${raices}\n}`,
      variables,
    )
    creados += lote.filter((_, i) => data[`u${i}`]?.id).length
  }
  return creados
}

/** "06/10/2026 14:05" en hora local: la que se muestra en los updates. */
export const fechaHoraLegible = (d = new Date()): string =>
  d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
