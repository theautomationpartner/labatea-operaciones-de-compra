import type { Operacion, Paso } from '@/types'

/**
 * Nombres de las etapas del stepper. Son los MISMOS en todas las operaciones: una etapa que hace
 * lo mismo se llama igual, aunque por dentro tome los datos de otro lado.
 */
export const ETAPA = {
  proveedor: 'Seleccionar Proveedor',
  productos: 'Seleccionar Productos',
  emitir: 'Emitir y Enviar',
} as const

/**
 * El recorrido de la ORDEN DE COMPRA: tres etapas. La última crea el ítem (y sus subelementos) en
 * el tablero "🛒 Orden Compra".
 */
export const PASOS_ORDEN_COMPRA = [ETAPA.proveedor, ETAPA.productos, ETAPA.emitir] as const

/**
 * Los pasos que muestra el encabezado.
 *
 * PENDIENTE DE DEFINICIÓN: CARGAR FACTURA y CARGAR REMITO todavía no tienen recorrido propio y
 * comparten el de la orden de compra. Cuando se especifiquen, esta función se abre por operación
 * —igual que en la app de ventas— y el resto del header no se toca.
 */
export function pasosDe(_operacion: Operacion | null): readonly string[] {
  return PASOS_ORDEN_COMPRA
}

/**
 * Claves de `Paso` en el MISMO orden que las etiquetas de `pasosDe`: mapea el índice del stepper
 * a la etapa a la que se navega al hacer clic en su círculo. Debe quedar sincronizada con `pasosDe`
 * (misma cantidad y orden).
 */
export function pasosKeysDe(_operacion: Operacion | null): readonly Paso[] {
  return ['proveedor', 'productos', 'emision']
}

/**
 * En qué posición del stepper cae una etapa del recorrido en curso. Es lo que cada vista usa para
 * marcarse como actual y para numerar su título.
 *
 * Se busca por la CLAVE de `Paso`, no por la etiqueta: buscar por texto ataría la posición al
 * nombre que se muestra, y renombrar un rótulo rompería la numeración. Sin la etapa en el
 * recorrido devuelve 0: es preferible marcar la primera antes que romper.
 */
export function indiceDePaso(paso: Paso, operacion: Operacion | null): number {
  const i = pasosKeysDe(operacion).indexOf(paso)
  return i >= 0 ? i : 0
}

/** Las opciones del selector de operación, en el orden en que se muestran. */
export const OPERACIONES: readonly Operacion[] = [
  'ORDEN DE COMPRA',
  'CARGAR FACTURA',
  'CARGAR REMITO',
]
