import { useState } from 'react'
import { CompBody } from '@/features/shared/CompBody'
import { resumenCompra } from '@/lib/compras'
import { money } from '@/lib/format'
import { filasOrden } from '@/lib/ordenDoc'
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
 * Las columnas son las MISMAS que la tabla del PDF de la orden —cantidad, código, descripción,
 * costo neto en factura, bonificación en mercadería y total— y salen de la misma función
 * (`lib/ordenDoc`): lo que se ve acá es exactamente lo que recibe el proveedor.
 */
export function OrdenCompraAGenerar({ lineas, emitido = false }: OrdenCompraAGenerarProps) {
  const [abierta, setAbierta] = useState(true)
  const resumen = resumenCompra(lineas)
  const filas = filasOrden(lineas)

  return (
    <div className="comprobantes">
      <div className="comprobantes-head">
        <h3 className="resumen-title">Orden de Compra a generar</h3>
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

          {/* Check de emisión: verde cuando el PDF de la orden ya se generó. */}
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
                  <th className="ta-c">Cantidad</th>
                  <th className="ta-c">Código</th>
                  <th>Descripción</th>
                  <th className="ta-r">Costo neto en factura</th>
                  <th className="ta-r">Bonif. en Merc.</th>
                  <th className="ta-r">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    {/* Envases: la cantidad que, por el costo final de un envase, da el Total. */}
                    <td className="ta-c">{f.cantidad}</td>
                    <td className="ta-c">
                      <span className="comp-cod">{f.codigo}</span>
                    </td>
                    <td>
                      <span className="comp-nom">{f.descripcion}</span>
                    </td>
                    {/* Precio de lista con los descuentos del proveedor: lo que dirá la factura. */}
                    <td className="ta-r">{money(f.costoNeto)}</td>
                    <td className="ta-r">{f.bonificacion}</td>
                    <td className="ta-r comp-total-prod">{money(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* El total de la orden, igual que el "IMPORTE TOTAL PESOS" del PDF (precios más IVA). */}
            <div className="comp-pie">
              <div className="comp-tot">
                <div className="comp-tot-row comp-tot-row--total">
                  <span>Importe total pesos</span>
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
