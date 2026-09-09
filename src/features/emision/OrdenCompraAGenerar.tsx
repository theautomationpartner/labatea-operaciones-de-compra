import { useState } from 'react'
import { CompBody } from '@/features/shared/CompBody'
import { envasesDe, resumenCompra, totalLinea } from '@/lib/compras'
import { money } from '@/lib/format'
import type { LineaCompra } from '@/types'

interface OrdenCompraAGenerarProps {
  lineas: readonly LineaCompra[]
  /** La orden ya se emitió en el tablero en esta sesión: tilda el check en verde. */
  emitido?: boolean
}

/**
 * La orden de compra a registrar, con el MISMO desplegable que las cards de comprobante de la app
 * de ventas: las mismas clases `comp-*`, la cabecera siempre visible —productos e importe total— y
 * el detalle por producto al desplegar.
 *
 * Las columnas son las de una compra, no las de una venta: no hay moneda (todo en pesos), ni
 * bonificaciones, ni IVA. Lo que se muestra por producto es lo que define el pedido —cuántos
 * envases se piden, a cuántas unidades equivalen y cuánto cuesta cada envase— y el total de la
 * línea. Son los mismos valores que se escriben en los subelementos en Monday.
 */
export function OrdenCompraAGenerar({ lineas, emitido = false }: OrdenCompraAGenerarProps) {
  const [abierta, setAbierta] = useState(true)
  const resumen = resumenCompra(lineas)

  return (
    <div className="comprobantes">
      <div className="comprobantes-head">
        <h3 className="resumen-title">Orden de compra a generar</h3>
      </div>

      <div className="comp-card">
        <div className="comp-head">
          <button
            type="button"
            className="comp-toggle"
            aria-expanded={abierta}
            onClick={() => setAbierta((v) => !v)}
          >
            <i className={`fas fa-chevron-down comp-chev ${abierta ? 'open' : ''}`} />
            <span className="comp-tit">Orden de Compra</span>
            {/* Qué CLASE de documento es. Va al lado del título y no en una fila propia porque es
                parte de su identidad, no un dato más de la orden. */}
            <span className="tag tag-green comp-tag">Documento de Compra</span>
          </button>

          <div className="comp-head-datos">
            <div className="comp-head-dato">
              <span className="comp-head-lbl">Productos</span>
              <span className="comp-head-val">{resumen.lineas}</span>
            </div>
            <div className="comp-head-dato">
              <span className="comp-head-lbl">Importe total</span>
              <span className="comp-head-val comp-head-val--imp">{money(resumen.total)}</span>
            </div>
          </div>

          {/* Check de emisión: verde cuando la orden ya se emitió en el tablero. */}
          <span className="comp-estado">
            <span
              className={`cobro-ok ${emitido ? 'on' : ''}`}
              title={emitido ? 'Orden de compra emitida' : 'Pendiente de emisión'}
            >
              <i className="fas fa-check" />
            </span>
          </span>
        </div>

        <CompBody abierta={abierta}>
          <div className="comp-body">
            <table className="comp-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="ta-c">Envases</th>
                  <th className="ta-c">Cant Solicitada</th>
                  <th className="ta-r">Costo</th>
                  <th className="ta-r">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.producto.codigo && <span className="comp-cod">{l.producto.codigo}</span>}
                      <span className="comp-nom">{l.producto.nombre}</span>
                    </td>
                    {/* Envases: lo que el proveedor efectivamente prepara. */}
                    <td className="ta-c">{envasesDe(l.producto, l.cantidad)}</td>
                    {/* Las unidades que salen de esos envases: es la "Cant Total a Pedir" de la
                        etapa anterior y la que viaja al subelemento como "🤖Cant Total Pedida". */}
                    <td className="ta-c">{l.cantidad}</td>
                    {/* Costo de reposición: lo que cuesta UN envase. */}
                    <td className="ta-r">{money(l.producto.costoReposicion)}</td>
                    <td className="ta-r comp-total-prod">
                      {money(totalLinea(l.producto, l.cantidad))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total de la orden, en el mismo renglón y posición que en la card de la factura. Una
                orden de compra no liquida IVA ni bonifica, así que el bloque de totales estándar
                —Subtotal / Descuento / Gravado / IVA / Total— se reduce a lo que sí tiene: cuánto
                se pide y cuánto suma. Repetir cuatro renglones idénticos al total sería ruido. */}
            <div className="comp-pie">
              <div className="comp-tot">
                <div className="comp-tot-row">
                  <span>Envases</span>
                  <b>{resumen.envases}</b>
                </div>
                <div className="comp-tot-row">
                  <span>Unidades</span>
                  <b>{resumen.unidades}</b>
                </div>
                <div className="comp-tot-row comp-tot-row--total">
                  <span>Total</span>
                  <b>{money(resumen.total)}</b>
                </div>
              </div>
            </div>
          </div>
        </CompBody>
      </div>
    </div>
  )
}
