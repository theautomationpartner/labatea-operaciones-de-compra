/**
 * Textos del sistema que se editan en Monday, en el tablero "⚙️Configuracion - Sistema"
 * (18421035530). La app los lee en el momento de usarlos: un cambio en Monday rige desde el
 * próximo documento, sin tocar el código.
 */
import { BOARDS, COL, CONFIG_ITEM } from './columns'
import { byId, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/**
 * Leyenda del pie de la orden de compra (las condiciones de entrega): el ítem fijo "Leyendas"
 * (Tipo de Config = Leyendas), columna "✋Leyenda Orden de Compra". `''` si está vacía.
 */
export async function getLeyendaOrdenCompra(): Promise<string> {
  const data = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { id name column_values(ids: ["${COL.configuracion.leyendaOrdenCompra}"]) { id text } }
    }`,
    { ids: [CONFIG_ITEM.leyendas] },
  )
  const item = data.items[0]
  if (!item) throw new Error(`No existe el ítem de leyendas (${CONFIG_ITEM.leyendas}) en ${BOARDS.configuracion}.`)
  return (byId(item)[COL.configuracion.leyendaOrdenCompra]?.text ?? '').trim()
}
