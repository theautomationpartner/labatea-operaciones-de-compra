import { useState } from 'react'
import { ConsignadoTag } from '@/components/ui/Etiquetas'
import {
  avisoCompraMinima,
  avisoEnvaseModificado,
  cantPorEnvase,
  cantidadConEscalon,
  envaseModificado,
  envasesDe,
  formatoEnvases,
  respetaEnvase,
  totalLinea,
} from '@/lib/compras'
import { money } from '@/lib/format'
import type { Producto } from '@/types'
import { DetalleCosto } from './DetalleCosto'
import { ProveedorLinea, StockPanel } from './StockPanel'

interface CargaLineaProps {
  producto: Producto | null
  /** Aviso de la búsqueda (sin resultados / error): ocupa el lugar del producto elegido. */
  aviso?: string
  /** Agrega la línea. Recibe el producto con la "Cant x Envase" que rige en ESTA orden. */
  onAdd: (cantidad: number, producto: Producto) => void
  /** Con el crédito del proveedor excedido: deshabilita "Agregar" hasta bajar el importe. */
  bloqueado?: boolean
  /**
   * Compras/Administración: puede ESCRIBIR la cantidad total, aunque no respete el envase (con el
   * aviso en rojo). El resto sólo la mueve con los botones, que producen múltiplos.
   */
  permiteExcepcion?: boolean
  /** Administradores: pueden alterar la "Cant x Envase" del producto para esta orden. */
  permiteEditarEnvase?: boolean
}

/**
 * Producto elegido, en dos filas —la misma estructura que la carga de línea de la app de ventas—:
 *
 *   · ARRIBA — a la izquierda, la ficha del producto (costo final, tipo de envase de compra y
 *     cantidad por envase); a la derecha, cuántos envases se piden, cuántas unidades son eso, el
 *     subtotal y el botón "Agregar".
 *
 * Un administrador puede alterar la "Cant x Envase" para ESTA orden: el Maestro no se toca, la
 * línea viaja con el valor alterado y la tabla lo marca.
 *   · ABAJO  — el stock del producto, con las cuatro métricas proyectadas por el ingreso.
 *
 * Lo que NO tiene, y a propósito: descuentos y rentabilidad. Una orden de compra pide mercadería a
 * un precio; el margen es un dato de la venta, no de la compra.
 *
 * Vive dentro de la card de búsqueda y sólo se completa cuando hay un producto seleccionado. El
 * padre la remonta al cambiar de producto (`key`), así los campos arrancan limpios.
 */
export function CargaLinea({
  producto: productoMaestro,
  aviso,
  onAdd,
  bloqueado = false,
  permiteExcepcion = false,
  permiteEditarEnvase = false,
}: CargaLineaProps) {
  /* "Cant x Envase" alterada por un administrador. `null` = rige la del Maestro. */
  const [envaseOrden, setEnvaseOrden] = useState<number | null>(null)
  /* El producto con el que se calcula TODO en esta tarjeta: el del Maestro, o el mismo con la
     "Cant x Envase" alterada. Así el escalón, los envases y el subtotal siguen al valor de la orden. */
  const producto =
    productoMaestro && envaseOrden !== null && envaseOrden !== productoMaestro.cantXUnidad
      ? { ...productoMaestro, cantXUnidad: envaseOrden, cantXUnidadMaestro: productoMaestro.cantXUnidad }
      : productoMaestro

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
   * Los ENVASES los puede escribir cualquiera (o moverlos con − y +): son enteros no negativos, y
   * las unidades salen de multiplicarlos por el envase, así que siempre son múltiplo exacto. La
   * cantidad TOTAL, en cambio, no se teclea para la mayoría de los usuarios: un número escrito a
   * mano podría no ser múltiplo del envase y la orden le pediría al proveedor algo que no puede
   * despachar.
   *
   * La EXCEPCIÓN es Compras/Administración (`permiteExcepcion`): pueden escribir la cantidad total
   * —una compra pactada con el proveedor por debajo del envase, por ejemplo—, y si no respeta el
   * envase el campo se marca en rojo con el aviso debajo. No se bloquea.
   */
  const [cantidad, setCantidad] = useState(0)

  const escalon = producto ? cantPorEnvase(producto) : 1
  /** Lo que muestra el input de "Cant de Envases": las unidades repartidas en envases cerrados. */
  const envases = producto ? envasesDe(producto, cantidad) : 0
  const subtotal = producto ? totalLinea(producto, cantidad) : 0
  /* Sólo se marca una cantidad YA cargada: el cero inicial no es una compra que incumpla nada. */
  const fueraDeEnvase = Boolean(producto) && cantidad > 0 && !respetaEnvase(producto!, cantidad)

  /* Texto del input de envases MIENTRAS se escribe. `null` = no se está editando y se muestra la
     cuenta (unidades ÷ envase). Hace falta porque un campo vacío a mitad de tipeo no es un número. */
  const [envasesTxt, setEnvasesTxt] = useState<string | null>(null)

  const cambiarCantidad = (pasos: number) => {
    if (!producto) return
    setEnvasesTxt(null)
    setCantidad(cantidadConEscalon(producto, cantidad, pasos))
  }

  /* Envases escritos a mano: sólo dígitos, así que no hay negativos ni decimales posibles. Las
     unidades se derivan siempre del envase vigente, por lo que el resultado es múltiplo exacto. */
  const escribirEnvases = (texto: string) => {
    if (!producto) return
    const digitos = texto.replace(/\D/g, '')
    /* Se RECHAZA la tecla (el campo queda como estaba) si el número pasa de 3 dígitos o si arranca
       con 0 y se le quiere agregar otro dígito ("04", "004"): el 0 sólo vale solo. */
    if (digitos.length > 3 || (digitos.length > 1 && digitos.startsWith('0'))) return
    setEnvasesTxt(digitos)
    setCantidad((digitos ? Number(digitos) : 0) * escalon)
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
              <>
                {producto.nombre}
                {producto.consignado && <ConsignadoTag />}
              </>
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
                <span className="cl-kpi-l">Costo Final</span>
                {/* El precio de UN envase, tal cual lo publica el Maestro. NO es el unitario. */}
                <span className="cl-kpi-v">{money(producto.costoReposicion)}</span>
              </div>
              <div className="cl-kpi">
                <span className="cl-kpi-l">Tipo Envase Compra</span>
                <span className="cl-kpi-v">{producto.unidadCompra || 'Sin especificar'}</span>
              </div>
              <div className="cl-kpi">
                <span className="cl-kpi-l">Cant x Envase</span>
                {permiteEditarEnvase ? (
                  /* Administradores: el valor se puede alterar para esta orden. */
                  <span className="cl-kpi-v">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`cl-kpi-input ${envaseModificado(producto) ? 'cl-kpi-input--modificado' : ''}`}
                      aria-invalid={envaseModificado(producto) || undefined}
                      aria-label="Cant x Envase para esta orden"
                      title="Podés cambiar la Cant x Envase para esta orden. El Maestro no se modifica."
                      value={envaseOrden ?? escalon}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''))
                        setEnvaseOrden(Number.isFinite(n) ? n : 0)
                      }}
                      onBlur={() => {
                        // Vacío o cero no es un envase: vuelve al del Maestro.
                        if (!envaseOrden || envaseOrden <= 0) setEnvaseOrden(null)
                      }}
                    />
                    {producto.cantXUnidadMaestro !== undefined && (
                      <span className="cl-kpi-nota">Maestro: {producto.cantXUnidadMaestro}</span>
                    )}
                  </span>
                ) : (
                  /* Sin el dato cargado en el Maestro se compra de a una unidad, y se dice: el 1
                     que se muestra es un supuesto de la app, no un valor del tablero. */
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
                )}
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
                {/* Se puede ESCRIBIR (de 0 a 45 son dos teclas) o mover con − y +. Nunca negativo:
                    el campo sólo acepta dígitos. */}
                <input
                  id="pqty"
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  className="qty-val"
                  value={producto ? (envasesTxt ?? formatoEnvases(envases)) : ''}
                  disabled={!producto}
                  aria-label="Cantidad de envases a pedir"
                  title="Escribí la cantidad de envases o usá los botones − y +"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => escribirEnvases(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === '.' || e.key === ',') {
                      e.preventDefault()
                    }
                  }}
                  onBlur={() => setEnvasesTxt(null)}
                />
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => cambiarCantidad(1)}
                  /* Mismo tope que el campo: 999 envases (3 dígitos). */
                  disabled={!producto || envases >= 999}
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
              <div
                className={`qty-input-group qty-input-group--solo ${
                  fueraDeEnvase ? 'qty-input-group--fuera' : ''
                }`}
              >
                <input
                  id="pqtytot"
                  type="text"
                  inputMode={permiteExcepcion ? 'numeric' : 'none'}
                  className="qty-val"
                  value={producto ? cantidad : ''}
                  readOnly={!permiteExcepcion}
                  disabled={!producto}
                  aria-label="Cantidad total de unidades a pedir"
                  aria-invalid={fueraDeEnvase || undefined}
                  title={
                    permiteExcepcion
                      ? 'Podés escribir la cantidad: si no respeta el envase, queda marcada.'
                      : `${escalon} × ${formatoEnvases(envases)} = ${cantidad}`
                  }
                  onChange={(e) => {
                    if (!permiteExcepcion) return
                    const n = Number(e.target.value.replace(/\D/g, ''))
                    setCantidad(Number.isFinite(n) ? n : 0)
                  }}
                />
              </div>
              <span className="cl-metric-note">
                {producto
                  ? `${escalon} × ${formatoEnvases(envases)} envase${envases === 1 ? '' : 's'}`
                  : ''}
              </span>
              {/* Fuera de la compra mínima: el aviso va DEBAJO del campo, sin ventana emergente. */}
              {producto && fueraDeEnvase && (
                <span className="cl-aviso-minima" role="alert">
                  <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
                  {avisoCompraMinima(producto)}
                </span>
              )}
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
              onClick={() => puedeAgregar && producto && onAdd(cantidad, producto)}
            >
              <i className="fas fa-plus" /> Agregar
            </button>
          </div>
        </div>
      </div>

      {/* ===== FILA 2: detalle del costo | stock del producto ===== */}
      <div className="cl-bottom">
        <DetalleCosto producto={producto} />

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

      {/* Cant x Envase alterada: la advertencia va debajo del Detalle de Costo y del Stock. */}
      {producto && envaseModificado(producto) && (
        <p className="cl-aviso-envase" role="alert">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
          {avisoEnvaseModificado(producto)}
        </p>
      )}
    </div>
  )
}
