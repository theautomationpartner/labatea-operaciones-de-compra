import type { Operacion, Paso } from '@/types'

/**
 * Nombres de las etapas del stepper. Son los MISMOS en todas las operaciones: una etapa que hace
 * lo mismo se llama igual, aunque por dentro tome los datos de otro lado.
 */
export const ETAPA = {
  proveedor: 'Seleccionar Proveedor',
  productos: 'Seleccionar Productos',
  emitir: 'Emitir y Enviar',
  precios: 'Actualizar Precios',
  comprobantePrecios: 'Comprobante y Envío',
  datosIniciales: 'Cargar Datos Iniciales',
} as const

/**
 * El recorrido de la ORDEN DE COMPRA: tres etapas. La última crea el ítem (y sus subelementos) en
 * el tablero "🛒 Orden Compra".
 */
export const PASOS_ORDEN_COMPRA = [ETAPA.proveedor, ETAPA.productos, ETAPA.emitir] as const

/**
 * El recorrido de ACTUALIZAR PRECIOS: tres etapas. La primera es la MISMA elección de proveedor de
 * la orden de compra; la segunda, la actualización (por porcentaje o con la lista en Excel); la
 * tercera, el comprobante de la actualización y su envío a Administración y Compras.
 */
export const PASOS_ACTUALIZAR_PRECIOS = [ETAPA.proveedor, ETAPA.precios, ETAPA.comprobantePrecios] as const

/**
 * El recorrido de CARGAR COMPROBANTE DE COMPRA. La primera etapa es la MISMA elección de proveedor
 * de la orden de compra; la segunda, el tipo de comprobante y el archivo, con sus datos leídos.
 *
 * PENDIENTE DE DEFINICIÓN: lo que pasa después de cargar los datos iniciales.
 */
export const PASOS_COMPROBANTE_COMPRA = [ETAPA.proveedor, ETAPA.datosIniciales] as const

/**
 * Los pasos que muestra el encabezado.
 *
 * PENDIENTE DE DEFINICIÓN: CARGAR REMITO todavía no tiene recorrido propio y comparte el de la orden
 * de compra. Cuando se especifique, se suma acá —igual que en la app de ventas— y el resto del
 * header no se toca.
 */
export function pasosDe(operacion: Operacion | null): readonly string[] {
  if (operacion === 'ACTUALIZAR PRECIOS') return PASOS_ACTUALIZAR_PRECIOS
  if (operacion === 'CARGAR COMPROBANTE DE COMPRA') return PASOS_COMPROBANTE_COMPRA
  return PASOS_ORDEN_COMPRA
}

/**
 * Claves de `Paso` en el MISMO orden que las etiquetas de `pasosDe`: mapea el índice del stepper
 * a la etapa a la que se navega al hacer clic en su círculo. Debe quedar sincronizada con `pasosDe`
 * (misma cantidad y orden).
 */
export function pasosKeysDe(operacion: Operacion | null): readonly Paso[] {
  if (operacion === 'ACTUALIZAR PRECIOS') return ['proveedor', 'precios', 'preciosComprobante']
  if (operacion === 'CARGAR COMPROBANTE DE COMPRA') return ['proveedor', 'comprobante']
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
  'CREAR ORDEN DE COMPRA',
  'CARGAR COMPROBANTE DE COMPRA',
  'CARGAR REMITO',
  'CONSULTAR ÓRDENES DE COMPRA',
  'ACTUALIZAR PRECIOS',
]

/** Operaciones reservadas a Compras/Administración (ver `lib/permisos`). */
export const OPERACIONES_RESTRINGIDAS: readonly Operacion[] = ['ACTUALIZAR PRECIOS']

/**
 * La pantalla en la que arranca cada operación al confirmarla. CONSULTAR ÓRDENES DE COMPRA es una
 * pantalla única, sin stepper; el resto —ACTUALIZAR PRECIOS incluida— arranca por la elección del
 * proveedor.
 */
export function pasoInicialDe(operacion: Operacion | null): Paso {
  if (operacion === 'CONSULTAR ÓRDENES DE COMPRA') return 'consultar'
  return 'proveedor'
}
