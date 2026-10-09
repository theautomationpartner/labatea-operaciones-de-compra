import { desgloseCosto } from '@/lib/compras'
import { money, pctDec } from '@/lib/format'
import type { Producto } from '@/types'

/**
 * "Detalle de Costo": cómo se llega del precio de lista del proveedor al costo final del producto.
 * Mismo bloque y mismas clases que el "Detalle" de descuentos de la app de ventas.
 *
 *   · Precio Unitario — "✋️Costo x Unid" del Maestro.
 *   · Descuentos — los "✋️Descuento 1..4" cargados, separados por coma, y lo que restan en $.
 *   · Bonif. en Mercadería — sólo si el producto la tiene, como fila aparte.
 *   · Costo Final — el resultado, que es el costo con el que se arma la orden.
 *
 * Sin producto elegido se dibuja en cero, para que la tarjeta no cambie de forma al elegir uno.
 */
export function DetalleCosto({ producto }: { producto: Producto | null }) {
  const d = producto ? desgloseCosto(producto) : null
  const descuentos = producto?.descuentos ?? []
  const bonif = producto?.bonifMercaderia ?? 0

  return (
    <section className="lindet-fin">
      <h4 className="lindet-h">
        <i className="fas fa-file-invoice-dollar lindet-h-ic" /> Detalle de Costo
      </h4>
      <div className="lindet-rows">
        <div className="lindet-row">
          <span className="lindet-lbl">Precio Unitario</span>
          <span className="lindet-mid" />
          <span className="lindet-val">{money(d?.precio ?? 0)}</span>
        </div>

        {/* Todos los descuentos del proveedor en un solo chip: "8%, 5%". */}
        <div className="lindet-row">
          <span className="lindet-lbl">Descuentos</span>
          <span className="lindet-mid">
            <span className="lindet-pct">
              {descuentos.length ? descuentos.map(pctDec).join(', ') : pctDec(0)}
            </span>
          </span>
          <span className="lindet-val">{d && d.descuentos ? `− ${money(d.descuentos)}` : money(0)}</span>
        </div>

        {bonif !== 0 && (
          <div className="lindet-row">
            <span className="lindet-lbl">Bonif. en Mercadería</span>
            <span className="lindet-mid">
              <span className="lindet-pct">{pctDec(bonif)}</span>
            </span>
            <span className="lindet-val">{d && d.bonificacion ? `− ${money(d.bonificacion)}` : money(0)}</span>
          </div>
        )}

        <div className="lindet-sep" />

        <div className="lindet-row lindet-row--fuerte">
          <span className="lindet-lbl">Costo Final</span>
          <span className="lindet-mid" />
          <span className="lindet-val">{money(d?.costoFinal ?? 0)}</span>
        </div>
      </div>
    </section>
  )
}
