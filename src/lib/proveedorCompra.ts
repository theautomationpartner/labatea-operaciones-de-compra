/**
 * Las validaciones que decide la etapa 1: a quién se le puede emitir una orden de compra.
 *
 * A diferencia de PAGOS, la CONDICIÓN DE PAGO no restringe la orden: se le puede comprar a un
 * proveedor de CONTADO igual que a uno de cuenta corriente. Lo que cambia según la condición es si
 * rige el límite de crédito (ver `lib/credito`), no si se puede operar.
 */
import { esProveedor } from '@/lib/personas'
import type { Proveedor } from '@/types'

/** Etiqueta de "✋️Cond Pago Habilitadas" que habilita la operación. */
const COND_PAGO_CTA_CTE = 'CUENTA CORRIENTE'

/**
 * El proveedor opera en CUENTA CORRIENTE. Se lee de "✋️Cond Pago Habilitadas"
 * (dropdown_mm54yq06), comparado sin distinguir mayúsculas ni espacios: la etiqueta del tablero
 * es texto cargado a mano y un espacio de más no debería cambiar el veredicto.
 */
export const operaEnCuentaCorriente = (proveedor: Proveedor | null): boolean =>
  (proveedor?.condicionPago ?? '').trim().toUpperCase() === COND_PAGO_CTA_CTE

/**
 * Por qué NO se puede seleccionar a esta persona, o `null` si se puede.
 *
 * Se resuelve en el momento de ELEGIRLA, no al intentar avanzar: quien no sirve para esta
 * operación no llega siquiera a mostrarse en la ficha. La condición de pago NO es motivo de
 * rechazo: cualquier proveedor puede recibir una orden de compra.
 */
export type RechazoProveedor = 'no-es-proveedor' | null

export function rechazoAlSeleccionar(persona: Proveedor): RechazoProveedor {
  if (!esProveedor(persona)) return 'no-es-proveedor'
  return null
}

/**
 * El proveedor opera en cuenta corriente pero NO tiene una asignada en el sistema: la operación se
 * frena acá, antes de hacerle cargar productos que después no va a poder imputar.
 *
 * La validación sólo corre sobre los de cuenta corriente: al que opera al contado no se le pide
 * una cuenta corriente, porque la orden no se imputa contra ella.
 */
export const proveedorSinCtaCte = (proveedor: Proveedor | null): boolean =>
  operaEnCuentaCorriente(proveedor) && !proveedor?.tieneCtaCte

export const MSG_SIN_CTA_CTE =
  'El Proveedor no tiene una cuenta corriente de proveedor asignada en el sistema'
