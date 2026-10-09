/**
 * Etiquetas informativas de un producto. Ninguna bloquea nada: avisan al lado del nombre.
 */

/** Producto consignado ("✋Tipo de Venta" = CO): etiqueta dorada a la derecha del nombre. */
export function ConsignadoTag() {
  return (
    <span className="tag-consignado" title="Producto consignado (Tipo de Venta CO en el Maestro)">
      Consignado
    </span>
  )
}
