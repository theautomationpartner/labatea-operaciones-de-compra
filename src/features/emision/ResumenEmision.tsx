import { type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import type { ResumenCompra } from '@/lib/compras'
import { money } from '@/lib/format'
import { useApp } from '@/state/hooks'

interface ResumenEmisionProps {
  resumen: ResumenCompra
  /** La orden se está emitiendo: bloquea el botón y muestra el spinner. */
  generando: boolean
  /** La orden ya se emitió: el botón queda en verde, como el de envío. */
  emitido: boolean
  onGenerar: () => void
}

interface FilaProps {
  label: string
  /** Campo que viaja al documento: se marca con asterisco. */
  requerido?: boolean
  /** Color del valor: verde (favorable), rojo (alerta) o "total" (destacado). */
  tono?: 'verde' | 'total' | 'rojo'
  children: ReactNode
}

function Fila({ label, requerido = true, tono, children }: FilaProps) {
  const clase =
    tono === 'total'
      ? 'rvalue--total'
      : tono === 'verde'
        ? 'rvalue--green'
        : tono === 'rojo'
          ? 'rvalue--red'
          : ''
  return (
    <div className="rrow">
      <span className="rlabel">
        {label}
        {requerido && <span className="rreq">*</span>}
      </span>
      <span className={`rvalue ${clase}`}>{children}</span>
    </div>
  )
}

/** Resumen final antes de emitir. Sólo lectura: todo viene de las etapas anteriores. */
export function ResumenEmision({ resumen, generando, emitido, onGenerar }: ResumenEmisionProps) {
  const { comprador, proveedor } = useApp()

  return (
    <div className="card card--flush resumen-emision">
      <h3 className="resumen-title">Resumen de la orden de compra</h3>

      <div className="rgroup">
        <Fila label="Comprador asignado">
          {comprador && (
            <>
              <Avatar ini={comprador.ini} color={comprador.color} size="sm" /> {comprador.name}
            </>
          )}
        </Fila>
        <Fila label="Proveedor">{proveedor?.name ?? '--'}</Fila>
        <Fila label="CUIT/CUIL">{proveedor?.cuit ?? '--'}</Fila>
        <Fila label="Condición de pago">{proveedor?.condicionPago ?? '--'}</Fila>
        <Fila label="Cantidad de productos">{resumen.lineas}</Fila>
      </div>

      <hr className="rsep" />

      {/* Lo que se le pide al proveedor y cuánto suma. Una orden de compra no liquida IVA ni
          bonifica, así que el importe total es la suma directa de sus líneas. */}
      <div className="rgroup">
        <Fila label="Importe total" tono="total">
          {money(resumen.total)}
        </Fila>
        {/* Sin tono: son CANTIDADES, no importes ni indicadores de salud de la operación. El verde
            de esta ficha señala un valor favorable, y "2 envases" no es ni bueno ni malo — pintarlo
            le daba un peso que compite con el único número que sí lo merece, el importe total. */}
        <Fila label="Envases a pedir">{resumen.envases}</Fila>
        <Fila label="Unidades a pedir">{resumen.unidades}</Fila>
      </div>

      <button
        type="button"
        className="btn-generar"
        onClick={onGenerar}
        disabled={generando || emitido}
        aria-busy={generando}
        // Emitida: el botón pasa a verde para confirmar, como el de "Enviado".
        style={emitido ? { backgroundColor: 'var(--green)', color: '#fff' } : undefined}
      >
        {generando ? (
          <>
            <i className="fas fa-circle-notch spin" /> Emitiendo...
          </>
        ) : emitido ? (
          <>
            <i className="fas fa-check" /> Orden de compra emitida
          </>
        ) : (
          <>
            <i className="far fa-file-pdf" /> EMITIR ORDEN DE COMPRA
          </>
        )}
      </button>
    </div>
  )
}
