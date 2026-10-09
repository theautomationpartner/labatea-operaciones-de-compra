/**
 * Cómo se llega del costo de lista del proveedor al costo final y a los precios de venta.
 *
 * Replica las fórmulas del "📦Maestro de Productos" para mostrar, ANTES de escribir nada, cómo
 * quedaría cada producto con su costo nuevo. Se verificaron contra productos reales del tablero
 * (ACICRUST FORTE: costo 69.854,57, bonif 30%, flete 1.250, margen L1 40% → costo final 53.734,28
 * y L1 76.477,99, igual que Monday). Los porcentajes se guardan como 40 = 40%.
 *
 *   Costo Final = costo × (1 − D1) × (1 − D2) × (1 − D3) × (1 − D4) / (1 + Bonif)
 *   L1 = costo final + flete + costo final × margen L1     (L7 y L8: igual, con su margen)
 *   L2 = L1 × (1 − descuento L2)                            (L3: igual, con su descuento)
 *
 * Cada paso se redondea a dos decimales, como el ROUND(…, 2) de cada fórmula del tablero.
 */
import { round2 } from '@/lib/format'
import type { ProductoCosto } from '@/lib/listaExcel'

/** Cómo se actualizó: con la lista del proveedor, con un porcentaje o un artículo suelto. */
export type TipoActualizacion = 'Excel' | 'Porcentaje' | 'Artículo'

/** Un producto del proveedor con todo lo que hace falta para mostrar su nuevo precio. */
export interface ProductoPrecio extends ProductoCosto {
  /** URL de la foto del producto, o `null` si no tiene. */
  imagen: string | null
  /** "✋️Descuento 1..4" en %, sólo los cargados (distintos de cero). */
  descuentos: number[]
  /** "✋️Bonif En Mercaderia" en %. */
  bonif: number
  /** "✋️Flete" en $. */
  flete: number
  margenL1: number
  descuentoL2: number
  descuentoL3: number
  margenL7: number
  margenL8: number
}

/**
 * Las condiciones comerciales NUEVAS que trae una lista (además del precio). `undefined` = la
 * lista no las cambia y rige lo que ya tiene el producto.
 */
export interface CondicionesNuevas {
  /** "✋️Descuento 1..4" en %, en orden de cascada, sólo los distintos de cero. */
  descuentos?: number[]
  /** "✋️Bonif En Mercaderia" en %. */
  bonif?: number
}

/** El producto con las condiciones nuevas aplicadas: es con lo que se calculan costo final y listas. */
export const conCondiciones = (p: ProductoPrecio, c: CondicionesNuevas = {}): ProductoPrecio => ({
  ...p,
  descuentos: c.descuentos ?? p.descuentos,
  bonif: c.bonif ?? p.bonif,
})

/** Dos juegos de descuentos son el mismo si coinciden uno a uno (al centésimo), sin contar los ceros. */
export const mismosDescuentos = (a: readonly number[], b: readonly number[]): boolean => {
  const x = a.filter((d) => d !== 0)
  const y = b.filter((d) => d !== 0)
  return x.length === y.length && x.every((d, i) => Math.abs(d - y[i]) < 0.005)
}

export const LISTAS_VENTA = ['L1', 'L2', 'L3', 'L7', 'L8'] as const
export type ListaVenta = (typeof LISTAS_VENTA)[number]

/** El costo final del producto para un costo de lista dado. */
export function costoFinalDe(p: ProductoPrecio, costo: number): number {
  const conDescuentos = p.descuentos.reduce((acc, d) => acc * (1 - d / 100), costo)
  return round2(p.bonif > 0 ? conDescuentos / (1 + p.bonif / 100) : conDescuentos)
}

/** Los precios de venta sin IVA de cada lista, para un costo de lista dado. */
export function preciosVentaDe(p: ProductoPrecio, costo: number): Record<ListaVenta, number> {
  const cf = costoFinalDe(p, costo)
  const conMargen = (margen: number) => round2(cf + p.flete + cf * (margen / 100))
  const l1 = conMargen(p.margenL1)
  return {
    L1: l1,
    L2: round2(l1 - l1 * (p.descuentoL2 / 100)),
    L3: round2(l1 - l1 * (p.descuentoL3 / 100)),
    L7: conMargen(p.margenL7),
    L8: conMargen(p.margenL8),
  }
}

const DEC = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const ARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * La variación del costo en % y en $: "3,4% ($ 145,67)". Una baja va con el signo menos en los dos
 * números; sin costo anterior no hay porcentaje contra qué medir.
 */
export function textoVariacion(anterior: number, nuevo: number): string {
  const dif = round2(nuevo - anterior)
  const signo = dif < 0 ? '−' : ''
  const pesos = `${signo}$ ${ARS.format(Math.abs(dif))}`
  if (anterior <= 0) return `— (${pesos})`
  return `${signo}${DEC.format(Math.abs((dif / anterior) * 100))}% (${pesos})`
}

/** Un producto actualizado: su costo nuevo y las condiciones que cambiaron. */
export interface ProductoActualizado {
  producto: ProductoPrecio
  nuevo: number
  condiciones: CondicionesNuevas
}

/**
 * Una actualización YA escrita en el Maestro. Es lo que pasa de la etapa "Actualizar Precios" a
 * "Comprobante y Envío": con esto se arma el comprobante y se lo manda.
 */
export interface ActualizacionHecha {
  tipo: TipoActualizacion
  /** Cuándo se confirmó (ISO). */
  fecha: string
  proveedor: { id: string; name: string; codigo: string }
  usuario: { id: string; name: string } | null
  porcentaje?: number
  /** Nombre de la lista original, en la actualización por Excel. */
  archivo?: string | null
  productos: ProductoActualizado[]
  /** Productos que efectivamente se escribieron. */
  actualizados: number
  /** Lo que no se pudo completar. */
  avisos: string[]
}
