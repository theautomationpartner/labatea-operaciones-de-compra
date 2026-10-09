import { Modal } from '@/components/ui/Modal'
import { money } from '@/lib/format'
import {
  conCondiciones,
  LISTAS_VENTA,
  preciosVentaDe,
  type CondicionesNuevas,
  type ProductoPrecio,
} from '@/lib/precios'

interface ModalPreciosVentaProps {
  producto: ProductoPrecio
  /** El costo nuevo; `null` si el producto todavía no tiene uno (se muestran sólo los vigentes). */
  nuevo: number | null
  /** Descuentos y bonificación nuevos, si la lista los cambia: también mueven los precios de venta. */
  condiciones?: CondicionesNuevas
  onClose: () => void
}

/**
 * Los precios de venta sin IVA de las listas L1, L2, L3, L7 y L8 con el costo nuevo, al lado de los
 * vigentes. Se calculan con las mismas fórmulas del Maestro (ver `lib/precios`).
 */
export function ModalPreciosVenta({ producto, nuevo, condiciones, onClose }: ModalPreciosVentaProps) {
  const vigentes = preciosVentaDe(producto, producto.costo)
  const cambia = nuevo !== null || condiciones?.descuentos !== undefined || condiciones?.bonif !== undefined
  const nuevos = cambia ? preciosVentaDe(conCondiciones(producto, condiciones), nuevo ?? producto.costo) : null

  return (
    <Modal
      title={nuevos ? 'Nuevos precios de venta' : 'Precios de venta'}
      icon={<i className="fas fa-tags modal-icon--info" />}
      onClose={onClose}
      actions={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      }
    >
      <p className="pv-producto">
        <strong>{producto.nombre}</strong>
        <span className="comp-cod">{producto.codigo}</span>
      </p>
      <table className="pv-tabla">
        <thead>
          <tr>
            <th>Lista</th>
            <th className="ta-r">{nuevos ? 'Precio anterior' : 'Precio vigente'}</th>
            {nuevos && <th className="ta-r">Precio nuevo</th>}
          </tr>
        </thead>
        <tbody>
          {LISTAS_VENTA.map((l) => (
            <tr key={l}>
              <td>
                <span className="pv-lista">{l}</span>
              </td>
              <td className={`ta-r ${nuevos ? 'tp-tachado' : ''}`}>{money(vigentes[l])}</td>
              {nuevos && <td className="ta-r tp-nuevo">{money(nuevos[l])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pv-nota">Precios sin IVA, calculados con los márgenes y el flete cargados en el Maestro.</p>
    </Modal>
  )
}
