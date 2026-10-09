interface ModalCargandoProps {
  titulo: string
  detalle: string
}

/**
 * Tapa la pantalla mientras se escribe en Monday. Se usa en las secuencias que no conviene
 * interrumpir ni disparar dos veces —registrar la orden de compra—, y el texto dice en qué paso va.
 * Es el mismo componente que el de "Operaciones de venta" (estilos globales `.modal-cargando`).
 */
export function ModalCargando({ titulo, detalle }: ModalCargandoProps) {
  return (
    <div className="modal-cargando" role="status" aria-live="polite">
      <div className="modal-cargando-box">
        <i className="fas fa-circle-notch spin" />
        <strong>{titulo}</strong>
        <span>{detalle}</span>
      </div>
    </div>
  )
}
