import { useState } from 'react'
import { cantPorEnvase, cantidadConEscalon, envasesDe, totalLinea } from '@/lib/compras'
import { money } from '@/lib/format'
import type { Producto } from '@/types'
import { ProveedorLinea, StockPanel } from './StockPanel'

interface CargaLineaProps {
  producto: Producto | null
  /** Aviso de la búsqueda (sin resultados / error): ocupa el lugar del producto elegido. */
  aviso?: string
  onAdd: (cantidad: number) => void
  /** Con el crédito del proveedor excedido: deshabilita "Agregar" hasta bajar el importe. */
  bloqueado?: boolean
}

/**
 * Producto elegido, en dos filas —la misma estructura que la carga de línea de la app de ventas—:
 *
 *   · ARRIBA — a la izquierda, la ficha del producto (costo de reposición, unidad de compra y
 *     cantidad por envase); a la derecha, cuántos envases se piden, cuántas unidades son eso, el
 *     subtotal y el botón "Agregar".
 *   · ABAJO  — el stock del producto, con las cuatro métricas proyectadas por el ingreso.
 *
 * Lo que NO tiene, y a propósito: descuentos y rentabilidad. Una orden de compra pide mercadería a
 * un precio; el margen es un dato de la venta, no de la compra.
 *
 * Vive dentro de la card de búsqueda y sólo se completa cuando hay un producto seleccionado. El
 * padre la remonta al cambiar de producto (`key`), así los campos arrancan limpios.
 */
export function CargaLinea({ producto, aviso, onAdd, bloqueado = false }: CargaLineaProps) {
  /*
   * El estado guarda UNIDADES, aunque el input muestre ENVASES.
   *
   * Es la escala en la que trabaja el resto del circuito —el stock se mueve en unidades— y la que
   * viaja en la línea al estado global. Los envases se DERIVAN al dibujar: son el mismo dato en
   * otra escala, y guardar los dos números abriría la puerta a que se desincronicen.
   *
   * Arranca en CERO: elegir un producto en el buscador es traerlo a la vista para mirarlo —su
   * costo, su stock—, no pedirlo. Con una cantidad precargada, "Agregar" quedaba a un click de
   * sumar a la orden algo que el usuario todavía no decidió cuánto pedir.
   *
   * Ninguna de las dos se teclea: el producto se compra por envase cerrado, así que un número
   * escrito a mano podría no ser múltiplo del envase y la orden le pediría al proveedor algo que
   * no puede despachar. Los únicos que las mueven son los botones, y sólo producen múltiplos.
   */
  const [cantidad, setCantidad] = useState(0)

  const escalon = producto ? cantPorEnvase(producto) : 1
  /** Lo que muestra el input de "Cant de Envases": las unidades repartidas en envases cerrados. */
  const envases = producto ? envasesDe(producto, cantidad) : 0
  const subtotal = producto ? totalLinea(producto, cantidad) : 0

  const cambiarCantidad = (pasos: number) => {
    if (!producto) return
    setCantidad(cantidadConEscalon(producto, cantidad, pasos))
  }

  /* En cero no hay nada que agregar: una línea de cero unidades no le pide nada al proveedor. El
     botón se apaga y su `title` dice por qué, en vez de dejar agregar una línea vacía a la orden. */
  const puedeAgregar = Boolean(producto) && !bloqueado && cantidad > 0
  const unidades = `${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`

  return (
    <div
      className={`selected-product-box ${producto ? '' : 'selected-product-box--vacio'} ${
        !producto && aviso ? 'selected-product-box--aviso' : ''
      }`}
    >
      {/* ===== FILA 1: ficha del producto | cantidad y resumen ===== */}
      <div className="cl-top">
        <div className="cl-info">
          {/* Sin producto, este lugar informa: o invita a buscar, o explica por qué no hubo match. */}
          <span className="product-name">
            {producto ? (
              producto.nombre
            ) : aviso ? (
              <>
                <i className="fas fa-triangle-exclamation" /> {aviso}
              </>
            ) : (
              'Ningún producto seleccionado'
            )}
          </span>
          <span className="product-meta">
            {producto
              ? `Código ${producto.codigo}`
              : aviso
                ? 'Probá con otro nombre o código, o revisá los filtros aplicados.'
                : 'Buscá por nombre o código y elegí un producto para cargarlo.'}
          </span>

          {producto && (
            <div className="cl-kpis">
              <div className="cl-kpi">
                <span className="cl-kpi-l">Costo de Reposición</span>
                {/* El precio de UN envase, tal cual lo publica el Maestro. NO es el unitario. */}
                <span className="cl-kpi-v">{money(producto.costoReposicion)}</span>
              </div>
              <div className="cl-kpi">
                <span className="cl-kpi-l">Unidad de Compra</span>
                <span className="cl-kpi-v">{producto.unidadCompra || 'Sin especificar'}</span>
              </div>
              <div className="cl-kpi">
                <span className="cl-kpi-l">Cant x Envase</span>
                {/* Sin el dato cargado en el Maestro se compra de a una unidad, y se dice: el 1
                    que se muestra es un supuesto de la app, no un valor del tablero. */}
                <span
                  className="cl-kpi-v"
                  title={
                    producto.cantXUnidad > 0
                      ? undefined
                      : 'El producto no tiene "Cant x Envase" cargada en el Maestro: se compra de a 1 unidad.'
                  }
                >
                  {escalon}
                  {producto.cantXUnidad > 0 ? '' : ' *'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: la cantidad y, a su lado, el resumen de lo que se carga. */}
        <div className="cl-oper">
          <div className="cl-resumen">
            <div className="control-item">
              <label htmlFor="pqty">Cant de Envases</label>
              {/* Cuenta ENVASES: es la unidad en la que se le pide al proveedor, y es lo que
                  después viaja como "Cantidad" al subelemento de la orden. */}
              <div className="qty-input-group">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => cambiarCantidad(-1)}
                  /* Se frena en cero: desde 0 no hay envases que restar. */
                  disabled={!producto || envases <= 0}
                  aria-label="Restar un envase"
                  title={`Resta un envase (${escalon} ${escalon === 1 ? 'unidad' : 'unidades'})`}
                >
                  -
                </button>
                <input
                  id="pqty"
                  type="text"
                  inputMode="none"
                  className="qty-val"
                  value={producto ? envases : ''}
                  readOnly
                  disabled={!producto}
                  aria-label="Cantidad de envases a pedir"
                  title="Se mueve de a un envase con los botones + y −"
                />
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => cambiarCantidad(1)}
                  disabled={!producto}
                  aria-label="Sumar un envase"
                  title={`Suma un envase (${escalon} ${escalon === 1 ? 'unidad' : 'unidades'})`}
                >
                  +
                </button>
              </div>
              <span className="cl-metric-note">
                {producto
                  ? `Cada envase trae ${escalon} ${escalon === 1 ? 'unidad' : 'unidades'}`
                  : ''}
              </span>
            </div>

            {/* Cuántas unidades salen de esos envases: Cant x Envase × Cant de Envases. Es el dato
                que el resto del circuito necesita —el stock se mueve en unidades— y que el input de
                al lado, que cuenta envases, no dice. No se edita: es una cuenta, no una decisión. */}
            <div className="control-item">
              <label htmlFor="pqtytot">Cant Total a Pedir</label>
              <div className="qty-input-group qty-input-group--solo">
                <input
                  id="pqtytot"
                  type="text"
                  inputMode="none"
                  className="qty-val"
                  value={producto ? cantidad : ''}
                  readOnly
                  disabled={!producto}
                  aria-label="Cantidad total de unidades a pedir"
                  title={`${escalon} × ${envases} = ${cantidad}`}
                />
              </div>
              <span className="cl-metric-note">
                {producto ? `${escalon} × ${envases} envase${envases === 1 ? '' : 's'}` : ''}
              </span>
            </div>

            <div className="cl-metric cl-metric--sep">
              <span className="cl-metric-l">Subtotal</span>
              <span className="cl-metric-v cl-metric-v--azul cl-metric-v--sub">
                {producto ? money(subtotal) : '—'}
              </span>
              <span className="cl-metric-note">
                {producto ? `Equivale a ${unidades}` : ''}
              </span>
            </div>

            <button
              type="button"
              className="btn-primary"
              disabled={!puedeAgregar}
              title={
                bloqueado
                  ? 'Se alcanzó el límite de crédito del proveedor: quitá productos para poder cargar más.'
                  : producto && cantidad === 0
                    ? `Indicá cuántas unidades pedir con el botón + (de a ${escalon}).`
                    : ''
              }
              onClick={() => puedeAgregar && onAdd(cantidad)}
            >
              <i className="fas fa-plus" /> Agregar
            </button>
          </div>
        </div>
      </div>

      {/* ===== FILA 2: stock del producto ===== */}
      <div className="cl-bottom cl-bottom--solo-stock">
        <div className="cl-stock">
          {producto ? (
            <>
              {/* El proveedor y el tipo de mercadería acompañan al título, contra el margen
                  derecho: misma disposición que el detalle de la tabla. */}
              <div className="lindet-hrow">
                <h4 className="lindet-h">
                  <i className="fas fa-cube lindet-h-ic" /> Stock
                </h4>
                <ProveedorLinea producto={producto} />
              </div>
              <StockPanel producto={producto} cantidad={cantidad} conProveedor={false} />
            </>
          ) : (
            <div className="stock-placeholder">
              <i className="fas fa-boxes-stacked" />
              El stock del producto y el ingreso proyectado se muestran acá al elegir un producto.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
