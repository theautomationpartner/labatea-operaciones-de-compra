/**
 * Las filas de la ORDEN DE COMPRA tal como las muestran el documento PDF y la card "Orden de Compra
 * a generar". Viven en un solo lugar para que la pantalla y el PDF digan exactamente lo mismo.
 *
 * Columnas (las del template de la orden):
 *   · Cantidad — los ENVASES pedidos: el "Costo Final" del Maestro es el precio de un envase, así
 *     que es la cantidad que, multiplicada por el costo, da el Total de la fila.
 *   · Código — el código interno del producto.
 *   · Descripción — el nombre del producto.
 *   · Costo neto en factura — el precio de lista con los descuentos del proveedor aplicados: lo que
 *     va a decir la factura, ANTES de la bonificación en mercadería.
 *   · Bonif. en Merc. — el % de bonificación en mercadería, o "-" si no tiene.
 *   · Total — envases × costo final (ya con la bonificación).
 */
import { desgloseCosto, envasesDe, formatoEnvases, resumenCompra, totalLinea } from '@/lib/compras'
import { pctDec, round2 } from '@/lib/format'
import type { LineaCompra } from '@/types'

export interface FilaOrden {
  id: string
  cantidad: string
  codigo: string
  descripcion: string
  costoNeto: number
  bonificacion: string
  total: number
}

export function filasOrden(lineas: readonly LineaCompra[]): FilaOrden[] {
  return lineas.map((l) => {
    const d = desgloseCosto(l.producto)
    return {
      id: l.id,
      cantidad: formatoEnvases(envasesDe(l.producto, l.cantidad)),
      codigo: l.producto.codigo,
      descripcion: l.producto.nombre,
      costoNeto: round2(d.precio - d.descuentos),
      bonificacion: l.producto.bonifMercaderia ? pctDec(l.producto.bonifMercaderia) : '-',
      total: totalLinea(l.producto, l.cantidad),
    }
  })
}

/** "OC-007" → "007": el número de la orden sin el prefijo del tablero. */
export const numeroSinPrefijo = (numero: string): string => numero.replace(/^\s*OC\s*-?\s*/i, '').trim() || numero

/** "OC-007" → "N°007": cómo se nombra la orden en los mensajes al proveedor. */
export const nroOrdenMensaje = (numero: string): string => `N°${numeroSinPrefijo(numero)}`

/** "IMPORTE TOTAL PESOS" del documento: la suma de los totales de las filas. */
export const totalOrden = (lineas: readonly LineaCompra[]): number => resumenCompra(lineas).total

/**
 * "Fecha de Recepción Estimada": la fecha de emisión ("dd/mm/yyyy") más los días del proveedor
 * ("✋️OC 100% Recibida en:"). `null` si el proveedor no tiene los días cargados.
 */
export function fechaRecepcionEstimada(fechaEmisionAR: string, dias: number | null): string | null {
  if (dias === null || !Number.isFinite(dias)) return null
  const [d, m, a] = fechaEmisionAR.split('/').map(Number)
  if (!d || !m || !a) return null
  return fechaHoyAR(new Date(a, m - 1, d + Math.round(dias)))
}

/** Fecha de hoy como "dd/mm/yyyy". */
export function fechaHoyAR(d = new Date()): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}
