import type { ReactNode } from 'react'

export interface DatoActualizacion {
  label: string
  valor: ReactNode
  /** Texto completo para el tooltip, cuando el valor se puede cortar. */
  title?: string
  /** El valor es una buena noticia (p. ej. productos con nuevo precio): va en verde. */
  ok?: boolean
}

interface DatosActualizacionProps {
  datos: readonly DatoActualizacion[]
  /** "Ver Actualización de Precios": siempre a la vista; se habilita cuando hay algo para ver. */
  verHabilitado: boolean
  verTitle?: string
  onVer: () => void
}

/**
 * La mitad derecha del bloque de carga de "Actualizar Precios": los datos de la actualización, que
 * se completan solos (no se editan), y el botón "Ver Actualización de Precios". La comparten las dos
 * formas de actualizar: con la lista en Excel y por porcentaje.
 */
export function DatosActualizacion({ datos, verHabilitado, verTitle, onVer }: DatosActualizacionProps) {
  return (
    <div className="pf-card">
      <h3 className="pf-titulo">
        <i className="fas fa-clipboard-list" /> Datos de la actualización
      </h3>
      <dl className="pf-datos">
        {datos.map((d) => (
          <div className="pf-fila" key={d.label}>
            <dt>{d.label}</dt>
            <dd className={d.ok ? 'pf-ok' : ''} title={d.title}>
              {d.valor}
            </dd>
          </div>
        ))}
      </dl>
      <button type="button" className="btn btn-primary pf-ver" disabled={!verHabilitado} title={verTitle} onClick={onVer}>
        <i className="fas fa-table-list" /> Ver Actualización de Precios
      </button>
    </div>
  )
}

export const fechaHoraActualizacion = (d: Date) =>
  d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
