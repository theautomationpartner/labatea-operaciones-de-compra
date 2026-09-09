import type { ReactNode } from 'react'
import { aplicaCredito, motivoCreditoIgnorado } from '@/lib/credito'
import { money } from '@/lib/format'
import { creditoPersona } from '@/lib/selectors'
import type { Persona, SaldosPersona } from '@/types'

/*
 * Los nombres de clase (`cliente-ficha`, `client-header`, `client-name`…) son los del componente
 * original de la app de cobros y pagos, y se conservan a propósito: `styles/proveedor.css` es una
 * copia verbatim de la hoja de allá, y renombrarlos rompería ese vínculo a cambio de nada visual.
 */

const colorActividad = (p: Persona) => (p.activity === 'Activo' ? 'var(--green)' : 'var(--red)')

const colorSituacion = (p: Persona) => {
  switch (p.situation) {
    case 'Liberado con crédito':
      return 'var(--yellow)'
    case 'Liberado sin crédito':
      return 'var(--green)'
    default:
      return 'var(--red)'
  }
}

/** Muestra el valor o «Sin especificar» si viene vacío. */
const oSinEsp = (v: string | null | undefined) => (v && v.trim() ? v : 'Sin especificar')

interface ProveedorFichaProps {
  /** null mientras no se buscó/eligió un proveedor: la ficha se muestra igual, en skeleton. */
  proveedor: Persona | null
  /** La consulta a Monday está en curso: se mantiene el skeleton. */
  cargando?: boolean
  /**
   * Saldos de la cuenta corriente. Viajan APARTE del proveedor porque salen de otro tablero y de
   * otra consulta: llegan después, así que sus dos cajas se resuelven solas —siguen en skeleton
   * mientras el resto de la ficha ya se ve—. `null` = todavía no llegaron.
   */
  saldos?: SaldosPersona | null
  /** Contenido opcional debajo del separador. */
  children?: ReactNode
}

/**
 * Ficha del proveedor. La ESTRUCTURA se muestra SIEMPRE: sin proveedor —o mientras se consulta—
 * cada caja queda en skeleton, y al resolverse la búsqueda se rellena con los datos reales. Así el
 * paso no salta de alto ni aparece y desaparece contenido.
 *
 * Es el MISMO componente que la ficha de cliente de las otras dos apps, pieza por pieza. Sólo se
 * quitó la caja de "Anticipos" y los datos que no rigen del lado de compras (los cheques que
 * acepta): el resto —el bloque financiero encabezado por el saldo de cuenta corriente, la barra de
 * uso de la línea y la nota de por qué el crédito no se considera— se lee igual.
 */
export function ProveedorFicha({
  proveedor,
  cargando = false,
  saldos = null,
  children,
}: ProveedorFichaProps) {
  const credito = proveedor ? creditoPersona(proveedor) : null
  const claseImporte = credito?.bloqueado ? 'v-gray' : ''
  const rigeCredito = proveedor ? aplicaCredito(proveedor) : false
  const motivoIgnorado = proveedor ? motivoCreditoIgnorado(proveedor) : null
  const tieneRetenciones =
    !!proveedor?.ret && proveedor.ret.trim() !== '' && proveedor.ret !== 'Ninguna'
  // Sin proveedor (o mientras consulta): las cajas van vacías, con el layout preservado.
  const vacio = !proveedor || cargando

  /** Valor de una métrica, o un skeleton si todavía no hay dato. */
  const val = (contenido: ReactNode, clase = '') =>
    vacio ? (
      <span className="skeleton skeleton--valor" />
    ) : (
      <span className={`kpi-value ${clase}`}>{contenido}</span>
    )

  /* Los saldos de cuenta corriente llegan de OTRA consulta que la ficha, así que tienen su propio
     skeleton: mientras el resto ya se ve, estas cajas siguen cargando en vez de mostrar un cero
     que después cambia solo. */
  const valSaldo = (importe: number | undefined) =>
    vacio || !saldos ? (
      <span className="skeleton skeleton--valor" />
    ) : (
      <span className={`kpi-value ${claseImporte}`}>{money(importe ?? 0)}</span>
    )

  return (
    <div
      className={`card no-radius cliente-ficha ${vacio ? 'cliente-ficha--vacio' : ''} ${
        credito?.bloqueado ? 'card--bloqueado' : ''
      }`}
    >
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <span className="skeleton skeleton--linea skeleton--medio" />
              <div className="badges">
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">Código: {proveedor.codigo}</span>
              <h2 className="client-name">{proveedor.name}</h2>

              <span className="client-address">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--c-primary)"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Dirección Fiscal: {oSinEsp(proveedor.addr)}
              </span>

              <div className="badges">
                <span className="badge badge-gray">CUIT: {oSinEsp(proveedor.cuit)}</span>
                <span className="badge badge-gray">{oSinEsp(proveedor.ptype)}</span>
                <span className="badge badge-green">{oSinEsp(proveedor.status)}</span>
                <span
                  className={`badge badge--cond ${proveedor.condicionPago ? '' : 'badge--falta'}`}
                >
                  Condicion de Pago: <strong>{proveedor.condicionPago ?? 'Sin asignar'}</strong>
                </span>
                {tieneRetenciones && (
                  <span className="badge badge-purple">Retenciones: {proveedor.ret}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Estado comercial, arriba a la derecha. */}
        <div className="status-indicators">
          {vacio ? (
            <>
              <span className="skeleton skeleton--estado" />
              <span className="skeleton skeleton--estado" />
            </>
          ) : (
            <>
              <div className="status-indicator">
                <span className="status-dot" style={{ background: colorActividad(proveedor) }} />
                {proveedor.activity}
              </div>
              <div className="status-indicator">
                <span className="status-dot" style={{ background: colorSituacion(proveedor) }} />
                {proveedor.situation}
              </div>
            </>
          )}
        </div>
      </div>

      <hr className="divider" />

      {/* Situación financiera: qué se le debe al proveedor y cuánta línea hay tomada.

          La estructura se monta SIEMPRE, tenga el proveedor sus datos cargados o no. Un proveedor
          sin movimientos no es un proveedor sin cuenta: sus saldos son CERO, y cero es un dato. Lo
          que sí varía es el TONO: en gris cuando el límite no rige en esta operación. */}
      <section className={`credito-grupo ${!vacio && !rigeCredito ? 'credito-grupo--off' : ''}`}>
        <div className="kpi-grid kpi-grid--5">
          <div className="kpi-card">
            <span className="kpi-label">Saldo Cta Cte (deuda)</span>
            {val(money(proveedor?.saldoCtaCte ?? 0), claseImporte)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Facturas Pends de Cancelar</span>
            {valSaldo(saldos?.pendienteDeCancelar)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Anticipos Pends de Aplicar</span>
            {valSaldo(saldos?.anticipos)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Límite asignado</span>
            {val(money(proveedor?.limit ?? 0), claseImporte)}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Remito Pends de Facturar</span>
            {val(money(proveedor?.remitosPendFacturar ?? 0), claseImporte)}
          </div>
        </div>

        {/* Crédito disponible · línea utilizada · barra de uso. */}
        <div className="credito-fila-inferior">
          <div className="credito-metrica">
            <span className="kpi-label">Crédito disponible</span>
            {val(money(credito?.disponible ?? 0), claseImporte || 'v-green')}
          </div>
          <div className="credito-metrica">
            <span className="kpi-label">Línea utilizada</span>
            {val(money(proveedor?.lineaUtilizada ?? 0), claseImporte || credito?.clase || '')}
          </div>

          <div className="credito-uso">
            <div className="progress-header">
              <span>Uso de límite de crédito</span>
              <strong>{vacio ? '—' : `${credito?.usadoPct ?? 0}% Utilizado`}</strong>
            </div>
            <div className="progress-track">
              {!vacio && (
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(Math.max(credito?.usadoPct ?? 0, 0), 100)}%`,
                    background: credito?.color,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Por qué el límite no va a pesar en esta operación. */}
      {motivoIgnorado && <p className="credito-nota-off">{motivoIgnorado}</p>}

      {/* Debajo del separador: contenido extra, si se pasa. */}
      {children && (
        <>
          <hr className="divider" />
          {children}
        </>
      )}
    </div>
  )
}
