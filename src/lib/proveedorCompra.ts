/**
 * Las dos validaciones que decide la etapa 1: a quién se le puede emitir una orden de compra.
 *
 * Son las MISMAS que aplica el paso 1 de PAGOS (`lib/pagosProveedor` de la app de cobros y
 * recibos), con los mismos textos: quien no sirve para pagarle una factura tampoco sirve para
 * emitirle una orden, y hacer que las dos apps rechacen distinto sería una fuente de confusión.
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
 * operación no llega siquiera a mostrarse en la ficha. Mostrarle al usuario los datos de alguien
 * con quien no va a poder operar —y recién avisárselo dos clicks después— es hacerle leer una
 * pantalla entera para nada.
 *
 * El orden importa: primero QUIÉN es y después CÓMO opera. A un cliente no tiene sentido
 * reclamarle su condición de pago, porque el problema no es esa columna.
 */
export type RechazoProveedor = 'no-es-proveedor' | 'condicion-de-pago' | null

export function rechazoAlSeleccionar(persona: Proveedor): RechazoProveedor {
  if (!esProveedor(persona)) return 'no-es-proveedor'
  if (!operaEnCuentaCorriente(persona)) return 'condicion-de-pago'
  return null
}

/**
 * El proveedor opera en cuenta corriente pero NO tiene una asignada en el sistema: la operación se
 * frena acá, antes de hacerle cargar productos que después no va a poder imputar.
 *
 * La validación sólo corre sobre los de cuenta corriente: al que opera al contado ni siquiera se
 * le pregunta, porque de entrada quedó afuera (ver `MSG_SOLO_CTA_CTE`).
 */
export const proveedorSinCtaCte = (proveedor: Proveedor | null): boolean =>
  operaEnCuentaCorriente(proveedor) && !proveedor?.tieneCtaCte

/**
 * RESTRICCIÓN DE NEGOCIO: sólo se consideran válidos los proveedores cuya condición de pago sea
 * explícitamente "CUENTA CORRIENTE". Cualquier otra —contado, proveed 45/90 días— queda afuera.
 */
export const MSG_SOLO_CTA_CTE =
  'Sólo se pueden emitir órdenes de compra a proveedores cuya condición de pago sea CUENTA CORRIENTE.'

export const MSG_SIN_CTA_CTE =
  'El Proveedor no tiene una cuenta corriente de proveedor asignada en el sistema'
