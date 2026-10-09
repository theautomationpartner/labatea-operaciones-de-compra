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

/**
 * La cantidad respeta la compra mínima: es un múltiplo exacto de "✋Cant x Envase".
 *
 * Una que no lo respeta sólo puede cargarla Compras/Administración, como excepción pactada con el
 * proveedor (ver `lib/permisos`), y se marca en rojo donde aparezca.
 */
export const respetaEnvase = (p: Producto, cantidad: number): boolean =>
  cantidad % cantPorEnvase(p) === 0

/** Aviso de la cantidad que no respeta la compra mínima. Escrito una vez para carga y tabla. */
export const avisoCompraMinima = (p: Producto): string => {
  const escalon = cantPorEnvase(p)
  return `Vas a comprar con una cantidad que no respeta la unidad de compra mínima. La compra mínima es ${escalon} ${
    escalon === 1 ? 'unidad' : 'unidades'
  } por ${p.unidadCompra || 'envase'}.`
}

/** La "Cant x Envase" de la línea fue alterada para esta orden y difiere de la del Maestro. */
export const envaseModificado = (p: Producto): boolean =>
  p.cantXUnidadMaestro !== undefined && p.cantXUnidadMaestro !== p.cantXUnidad

/** Advertencia de la "Cant x Envase" alterada. Escrita una vez para la carga y la tabla. */
export const avisoEnvaseModificado = (p: Producto): string =>
  `Estás solicitando por una Cant x Envase de ${p.cantXUnidad}, que NO es la definida en el Maestro de Productos (${
    p.cantXUnidadMaestro ?? '—'
  }).`

/** Envases para mostrar: entero si lo es, con hasta dos decimales si la cantidad es una excepción. */
export const formatoEnvases = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** Cómo se llega del precio de lista al costo final, en $. */
export interface DesgloseCosto {
  precio: number
  /** Lo que restan los descuentos, en cascada. */
  descuentos: number
  /** Lo que resta la bonificación en mercadería, sobre el precio ya descontado. */
  bonificacion: number
  /** El costo final tal como lo calcula el Maestro ("🤖Costo de Reposicion"). */
  costoFinal: number
}

/**
 * Desglose del costo, con la MISMA fórmula que "🤖Costo de Reposicion" en el Maestro: el precio
 * por (1 − Dto1) × (1 − Dto2) × …, y eso dividido por (1 + Bonif. en Mercadería). La bonificación
 * divide y no resta porque es mercadería de regalo: pagás N y te llevan N × (1 + BM).
 *
 * El costo final se toma del Maestro y no de esta cuenta, para que la cifra que se muestra sea la
 * misma que se usa en la orden; la bonificación absorbe la diferencia de redondeo.
 */
export function desgloseCosto(p: Producto): DesgloseCosto {
  const precio = p.precioUnitario
  const conDescuentos = p.descuentos.reduce((acc, d) => acc * (1 - d / 100), precio)
  return {
    precio,
    descuentos: round2(precio - conDescuentos),
    bonificacion: round2(conDescuentos - p.costoReposicion),
    costoFinal: p.costoReposicion,
  }
}

/**
 * IVA de la línea, en pesos: el subtotal (envases × costo final) por la alícuota del producto
 * ("✋IVA" del Maestro). `null` si el producto no tiene la alícuota cargada.
 */
export const ivaLinea = (p: Producto, cantidad: number): number | null =>
  p.iva === null ? null : round2((totalLinea(p, cantidad) * p.iva) / 100)

/** IVA total de la orden: la suma del IVA de sus líneas (las que no tienen alícuota no suman). */
export const ivaOrden = (lineas: readonly LineaCompra[]): number =>
  round2(lineas.reduce((acc, l) => acc + (ivaLinea(l.producto, l.cantidad) ?? 0), 0))

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
