import { Modal } from '@/components/ui/Modal'
import type { PendienteLiquidacion } from '@/services/monday/precios'

interface ModalLiquidacionPendienteProps {
  proveedor: string
  pendientes: readonly PendienteLiquidacion[]
  onClose: () => void
}

/**
 * El proveedor tiene ventas de consignación sin liquidar ("Venta Pend de Liq CYO"): la lista no se
 * puede actualizar hasta que estén 100% liquidadas. Se listan los productos con su estado.
 */
export function ModalLiquidacionPendiente({ proveedor, pendientes, onClose }: ModalLiquidacionPendienteProps) {
  return (
    <Modal
      title="NO se puede actualizar la lista de precio"
      icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Entendido
        </button>
      }
    >
      Detectamos en el sistema que para el proveedor <strong>{proveedor}</strong> existen pendientes de
      liquidar y productos sin presentar. Para actualizar las listas de precio, es necesario que dichos
      pendientes estén 100% liquidados. Luego, volvé a reintentar la actualización de precios.
      <ul className="liq-lista">
        {pendientes.map((p) => (
          <li key={`${p.producto}|${p.estado}`}>
            <span className="liq-nombre">{p.producto}</span>
            <span className={`liq-label ${/parcial/i.test(p.estado) ? 'liq-label--parcial' : 'liq-label--sin'}`}>
              {p.estado}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
