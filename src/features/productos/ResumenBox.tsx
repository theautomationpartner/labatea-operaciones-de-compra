import type { ResumenCompra } from '@/lib/compras'
import { money, pct } from '@/lib/format'
import type { ImpactoCredito } from '@/lib/selectors'

interface ResumenBoxProps {
  titulo: string
  resumen: ResumenCompra
  credito: ImpactoCredito
  /** Límite de crédito que el proveedor tiene asignado en su cuenta corriente. */
  limite: number
}

/**
 * Totales de la orden en una tarjeta; el impacto en el crédito del proveedor, en la otra.
 *
 * Es el mismo `ResumenBox` de la app de ventas, con UNA diferencia deliberada: no tiene el donut de
 * rentabilidad. Una compra no tiene margen —el margen aparece cuando esa mercadería se vende—, así
 * que el anillo mostraría un cero permanente o, peor, un número inventado. El donut del crédito, que
 * sí aplica, queda solo y con el mismo tamaño.
 */
export function ResumenBox({ titulo, resumen, credito, limite }: ResumenBoxProps) {
  const colorCredito = credito.critico ? 'var(--p-danger)' : 'var(--p-success)'
  const usado = Math.min(Math.max(credito.usadoPct, 0), 100)

  return (
    <div className="totals-grid totals-grid--2" aria-label={titulo}>
      <div className="kpi-card">
        <div className="subtotal-lines">
          {/* Qué se le está pidiendo al proveedor, antes del importe: es lo que se chequea contra
              el pedido real. Los renglones se muestran SIEMPRE, aunque estén en cero. */}
          <div className="sub-row">
            <span>Productos</span>
            <span>{resumen.lineas}</span>
          </div>
          <div className="sub-row">
            <span>Envases a pedir</span>
            <span>{resumen.envases}</span>
          </div>
          <div className="sub-row">
            <span>Unidades totales</span>
            <span>{resumen.unidades}</span>
          </div>
          <div className="total-row">
            <span>TOTAL DE LA ORDEN</span>
            <span>{money(resumen.total)}</span>
          </div>
        </div>
      </div>

      {/* Impacto en la cuenta corriente del proveedor. */}
      <div className="kpi-card">
        <span className="rent-lbl">Crédito del proveedor</span>
        <div className="indicadores-layout">
          <div className="donut-container">
            <div
              className="donut-chart"
              role="meter"
              aria-valuenow={Math.round(usado)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uso del límite de crédito"
              style={{
                background: `conic-gradient(${colorCredito} 0% ${usado}%, var(--p-border) ${usado}% 100%)`,
              }}
            >
              <div className="donut-inner">
                <span className="donut-val">{pct(credito.usadoPct)}</span>
                <span className="donut-lbl">Utilizado</span>
              </div>
            </div>
            <div className="donut-footer">Del límite de crédito</div>
          </div>

          <div className="credit-details">
            <div className="credit-row">
              <span className="c-lbl">Límite asignado</span>
              <span className="c-val">{money(limite)}</span>
            </div>
            <div className="credit-row">
              <span className="c-lbl">Crédito disponible</span>
              <span className="c-val" style={{ color: colorCredito }}>
                {money(credito.disponible)}
              </span>
            </div>
          </div>
        </div>

        {/* Por qué los números de arriba están neutros: el límite no rige esta operación (ver
            `aplicaCredito`). Sin esto, un disponible que no se mueve al cargar productos se lee
            como un error de la app. */}
        {!credito.aplica && (
          <p className="credito-nota-usd">
            El límite de crédito no rige esta operación, así que la orden no lo consume. El motivo
            está en la ficha del proveedor, en la etapa anterior.
          </p>
        )}
      </div>
    </div>
  )
}
