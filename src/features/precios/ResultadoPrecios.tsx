import type { CambioCosto } from '@/lib/listaExcel'
import type { ProductoActualizado, TipoActualizacion } from '@/lib/precios'
import type { AvanceEscritura } from '@/services/monday/precios'

/** Lo que una forma de actualizar le pasa a la vista para escribir en el Maestro. */
export interface PedidoConfirmacion {
  tipo: TipoActualizacion
  cambios: CambioCosto[]
  /** Los mismos productos, con todo lo que hace falta para el comprobante. */
  productos: ProductoActualizado[]
  porcentaje?: number
  /** Nombre de la lista cargada, en la actualización por Excel (va en el reporte). */
  archivo?: File | null
}

/**
 * Escribe la actualización en Monday. Devuelve `true` si se escribió (la vista se encarga del
 * aviso de fin y de pasar al comprobante) o `false` si falló (el error ya lo mostró la ventana
 * global).
 */
export type Confirmar = (pedido: PedidoConfirmacion, onAvance?: AvanceEscritura) => Promise<boolean>

/**
 * "Confirmar Actualización" de la ventana "Productos a actualizar en el maestro", igual en las dos
 * formas: "Actualizando..." mientras se escribe en Monday y "Actualización aplicada" (deshabilitado)
 * si ya se escribió.
 */
export function BotonConfirmarActualizacion({
  actualizando,
  aplicada,
  deshabilitado = false,
  onClick,
}: {
  actualizando: boolean
  aplicada: boolean
  deshabilitado?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={actualizando || aplicada || deshabilitado}
      aria-busy={actualizando}
      onClick={onClick}
    >
      {actualizando ? (
        <>
          <i className="fas fa-circle-notch spin" /> Actualizando...
        </>
      ) : aplicada ? (
        <>
          <i className="fas fa-circle-check" /> Actualización aplicada
        </>
      ) : (
        <>
          <i className="fas fa-check" /> Confirmar Actualización
        </>
      )}
    </button>
  )
}
