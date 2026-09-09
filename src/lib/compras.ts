/**
 * La aritmética de una línea de compra. Vive acá —pura y en un solo lugar— porque la usan la
 * tarjeta de carga, la tabla y el resumen, y los tres tienen que llegar al mismo número.
 *
 * La regla de fondo, que es lo que distingue a COMPRAS de VENTAS:
 *
 *   "🤖Costo de Reposicion" es el precio de UN ENVASE, y un envase trae "✋Cant x Envase" unidades.
 *
 * O sea que el costo de reposición NO es un precio unitario. De ahí salen las dos derivaciones que
 * usa toda la etapa: el precio por unidad y el total de la línea.
 */
import { round2 } from '@/lib/format'
import type { LineaCompra, Producto } from '@/types'

/**
 * Unidades por envase, siempre usable como divisor y como escalón.
 *
 * Un producto sin "✋Cant x Envase" cargada (o con 0, o con un negativo) se compra de a UNA unidad.
 * Es el único default seguro: cualquier otro inventaría un tamaño de envase que el tablero no dice,
 * y con un 0 la división daría infinito.
 */
export const cantPorEnvase = (p: Producto): number =>
  p.cantXUnidad > 0 ? Math.floor(p.cantXUnidad) : 1

/**
 * Precio de UNA unidad: el costo del envase repartido entre las unidades que trae.
 *
 * No se redondea a dos decimales acá: con envases grandes el redondeo por unidad se multiplica por
 * la cantidad y hace que el total de la línea no coincida con la suma de los envases pedidos. El
 * redondeo se aplica una sola vez, al final (ver `totalLinea`).
 */
export const precioUnitario = (p: Producto): number => p.costoReposicion / cantPorEnvase(p)

/** Cuántos envases representa una cantidad de unidades. */
export const envasesDe = (p: Producto, cantidad: number): number => cantidad / cantPorEnvase(p)

/**
 * Total de la línea: los envases pedidos por lo que cuesta cada uno.
 *
 * Se calcula sobre el ENVASE y no sobre el precio unitario justamente para no arrastrar el error
 * de la división: pedir 3 envases de $1.000 son $3.000, aunque el precio por unidad no sea exacto.
 */
export const totalLinea = (p: Producto, cantidad: number): number =>
  round2(envasesDe(p, cantidad) * p.costoReposicion)

/**
 * La cantidad se mueve DE A UN ENVASE. Es la regla que pidió el negocio: si un producto se pide
 * cada 15 unidades, el botón de sumar lleva de 15 a 30, no a 16.
 *
 * Nunca baja del primer envase: una línea de cero unidades no es una línea, es quitarla (y para eso
 * está el tacho de la tabla).
 */
export const cantidadConEscalon = (p: Producto, cantidad: number, pasos: number): number => {
  const escalon = cantPorEnvase(p)
  /* El piso es CERO, no un envase: la tarjeta de carga arranca en 0 y el producto recién elegido
     todavía no se pidió. Bajar de ahí no significa nada —no existe una cantidad negativa que
     pedirle al proveedor— así que el botón de restar se frena solo. */
  return Math.max(0, cantidad + pasos * escalon)
}

/** Totales de la orden. Sin descuentos ni IVA: una orden de compra pide mercadería a un precio. */
export interface ResumenCompra {
  /** Cuántas líneas tiene la orden. */
  lineas: number
  /** Unidades totales pedidas, sumando todas las líneas. */
  unidades: number
  /** Envases totales pedidos. Es lo que el proveedor efectivamente prepara. */
  envases: number
  /** Importe total de la orden. */
  total: number
}

export function resumenCompra(lineas: readonly LineaCompra[]): ResumenCompra {
  let unidades = 0
  let envases = 0
  let total = 0
  for (const l of lineas) {
    unidades += l.cantidad
    envases += envasesDe(l.producto, l.cantidad)
    total += totalLinea(l.producto, l.cantidad)
  }
  return {
    lineas: lineas.length,
    unidades: round2(unidades),
    envases: round2(envases),
    total: round2(total),
  }
}
