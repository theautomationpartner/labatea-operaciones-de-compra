/**
 * Saldos de la cuenta corriente: tablero "💵Cta Cte" (18421858736).
 *
 * La cuenta es UN ítem por persona, y los dos totales que muestra la ficha son columnas de ESE
 * ítem —ya calculadas por el tablero—:
 *
 *   · PENDIENTE DE CANCELAR · "Fact Vent pend de Aplciar", lo que todavía se debe.
 *   · ANTICIPOS PENDS DE APLICAR · "Anticipo pend de Aplicar", el saldo a favor sin usar.
 *
 * La DEUDA de la cuenta NO se lee acá: ya viene con el proveedor, calculada sobre las mismas
 * mirrors de este ítem (ver `mapPersona`), y es la que muestra la ficha. Leerla otra vez dejaría el
 * mismo número en dos lugares que pueden discrepar.
 *
 * La app los LEE, no los suma: son totales que el propio tablero publica, así que recorrer los
 * subelementos para recalcularlos sólo abriría la puerta a que los dos números difieran.
 *
 * OJO con el id en la regla de `board_relation`: va como NÚMERO. Con el mismo id entre comillas la
 * consulta devuelve 0 ítems en vez de fallar, así que el error no se nota hasta que la ficha
 * aparece con los saldos en cero.
 */
import { round2 } from '@/lib/format'
import type { SaldosPersona } from '@/types'
import { BOARDS, COL } from './columns'
import { byId, num, valor, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/** Saldos en cero: es lo que devuelve una cuenta que no existe, y NUNCA `null` ni `NaN`. */
export const SALDOS_EN_CERO: SaldosPersona = { pendienteDeCancelar: 0, anticipos: 0 }

/**
 * Importe de una columna de la cuenta. Monday devuelve los números como TEXTO, así que se parsea
 * siempre; una columna vacía —o con algo que no es un número— vale 0 y no `NaN`: la ficha muestra
 * un importe, y "no hay saldo" es un cero, no un hueco.
 */
const importe = (cols: ReturnType<typeof byId>, columna: string): number =>
  round2(num(valor(cols[columna])))

/** Los dos saldos del proveedor. Sin id devuelve ceros: no hay cuenta que mirar. */
export async function getSaldosPersona(personaId: string): Promise<SaldosPersona> {
  if (!personaId) return SALDOS_EN_CERO

  const data = await mondayApi<{ boards: { items_page: { items: MondayItem[] } }[] }>(
    `query {
      boards(ids: [${BOARDS.ctaCte}]) {
        items_page(
          limit: 1,
          query_params: {rules: [
            {column_id: "${COL.ctaCte.persona}", compare_value: [${Number(personaId)}], operator: any_of}
          ]}
        ) {
          items {
            id
            column_values(ids: ["${COL.ctaCte.ventasPendCancelar}","${COL.ctaCte.anticiposPendAplicar}"]) {
              id text
            }
          }
        }
      }
    }`,
  )

  /* Sin cuenta para esa persona no hay error que reportar: todavía no operó, así que sus saldos
     son cero. */
  const cuenta = data.boards?.[0]?.items_page.items?.[0]
  if (!cuenta) return SALDOS_EN_CERO

  const cols = byId(cuenta)
  return {
    pendienteDeCancelar: importe(cols, COL.ctaCte.ventasPendCancelar),
    anticipos: importe(cols, COL.ctaCte.anticiposPendAplicar),
  }
}
