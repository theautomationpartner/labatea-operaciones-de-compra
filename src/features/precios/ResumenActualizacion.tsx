import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { pctDec } from '@/lib/format'
import type { ActualizacionHecha } from '@/lib/precios'
import { useApp } from '@/state/hooks'

/** Cuánto vive el enlace al PDF abierto en otra pestaña antes de liberarlo. */
const VIDA_ENLACE_MS = 60_000

function Fila({ label, tono, children }: { label: string; tono?: 'verde' | 'rojo' | 'total'; children: ReactNode }) {
  const clase = tono === 'total' ? 'rvalue--total' : tono === 'verde' ? 'rvalue--green' : tono === 'rojo' ? 'rvalue--red' : ''
  return (
    <div className="rrow">
      <span className="rlabel">{label}</span>
      <span className={`rvalue ${clase}`}>{children}</span>
    </div>
  )
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface ResumenActualizacionProps {
  actualizacion: ActualizacionHecha
  /** El reporte PDF; `null` mientras se genera. */
  reporte: File | null
  /** No se pudo generar el reporte: el botón ofrece reintentar. */
  errorReporte: boolean
  onReintentar: () => void
}

/**
 * La card de resumen de la actualización de costos, con la MISMA forma que el resumen de la orden de
 * compra en la emisión (`ResumenEmision`): quién, a qué proveedor, cuándo y por qué vía, y los
 * números de la actualización. Su única acción es ver el reporte.
 */
export function ResumenActualizacion({ actualizacion: a, reporte, errorReporte, onReintentar }: ResumenActualizacionProps) {
  const { comprador } = useApp()
  const [bloqueado, setBloqueado] = useState(false)

  const variaciones = a.productos
    .filter((p) => p.producto.costo > 0)
    .map((p) => ((p.nuevo - p.producto.costo) / p.producto.costo) * 100)
  const suben = variaciones.filter((v) => v > 0.005).length
  const bajan = variaciones.filter((v) => v < -0.005).length
  const promedio = variaciones.length ? variaciones.reduce((s, v) => s + v, 0) / variaciones.length : 0
  const conCondiciones = a.productos.filter((p) => p.condiciones.descuentos || p.condiciones.bonif !== undefined).length

  const via =
    a.tipo === 'Excel'
      ? 'Lista de precios (Excel)'
      : a.tipo === 'Porcentaje'
        ? `Porcentual sobre toda la lista`
        : 'Artículo individual'

  const verReporte = () => {
    if (errorReporte) {
      onReintentar()
      return
    }
    if (!reporte) return
    setBloqueado(false)
    const url = URL.createObjectURL(reporte)
    const pestana = window.open(url, '_blank')
    if (!pestana) {
      URL.revokeObjectURL(url)
      setBloqueado(true)
      return
    }
    setTimeout(() => URL.revokeObjectURL(url), VIDA_ENLACE_MS)
  }

  return (
    <div className="card card--flush resumen-emision">
      <h3 className="resumen-title">Resumen de la actualización de costos</h3>

      <div className="rgroup">
        <Fila label="Responsable">
          {comprador && comprador.id === a.usuario?.id ? (
            <>
              <Avatar ini={comprador.ini} color={comprador.color} size="sm" /> {a.usuario.name}
            </>
          ) : (
            (a.usuario?.name ?? '--')
          )}
        </Fila>
        <Fila label="Proveedor">{a.proveedor.name}</Fila>
        <Fila label="Fecha de actualización">{fechaHora(a.fecha)}</Fila>
        <Fila label="Tipo de actualización">{via}</Fila>
        {a.tipo === 'Excel' && <Fila label="Lista cargada">{a.archivo ?? '--'}</Fila>}
        {a.tipo === 'Porcentaje' && a.porcentaje !== undefined && (
          <Fila label="Porcentaje aplicado">{`${a.porcentaje > 0 ? '+' : ''}${pctDec(a.porcentaje)}`}</Fila>
        )}
      </div>

      <hr className="rsep" />

      <div className="rgroup">
        <Fila label="Productos actualizados" tono="total">
          {a.actualizados}
        </Fila>
        <Fila label="Suben de costo" tono={suben ? 'rojo' : undefined}>
          {suben}
        </Fila>
        <Fila label="Bajan de costo" tono={bajan ? 'verde' : undefined}>
          {bajan}
        </Fila>
        <Fila label="Variación promedio">{`${promedio > 0 ? '+' : ''}${pctDec(Math.round(promedio * 100) / 100)}`}</Fila>
        {conCondiciones > 0 && <Fila label="Con descuentos o bonificación nuevos">{conCondiciones}</Fila>}
      </div>

      {a.avisos.length > 0 && (
        <ul className="modal-faltantes ra-avisos">
          {a.avisos.map((x) => (
            <li key={x}>
              <i className="fas fa-triangle-exclamation" /> {x}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn-generar"
        onClick={verReporte}
        disabled={!reporte && !errorReporte}
        aria-busy={!reporte && !errorReporte}
        style={errorReporte ? { backgroundColor: 'var(--red)', color: '#fff' } : undefined}
      >
        {errorReporte ? (
          <>
            <i className="fas fa-rotate" /> Reintentar el reporte
          </>
        ) : reporte ? (
          <>
            <i className="far fa-file-pdf" /> Ver reporte de actualización
          </>
        ) : (
          <>
            <i className="fas fa-circle-notch spin" /> Generando reporte...
          </>
        )}
      </button>
      {bloqueado && (
        <div className="pres-pdf-aviso" role="alert">
          <i className="fas fa-triangle-exclamation" /> El navegador bloqueó la pestaña del reporte. Permití las
          ventanas emergentes de este sitio y volvé a hacer clic.
        </div>
      )}
    </div>
  )
}
