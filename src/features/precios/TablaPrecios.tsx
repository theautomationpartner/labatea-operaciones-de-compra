import { useEffect, useMemo, useState } from 'react'
import { money, pctDec } from '@/lib/format'
import {
  conCondiciones,
  costoFinalDe,
  textoVariacion,
  type CondicionesNuevas,
  type ProductoPrecio,
} from '@/lib/precios'
import { ModalPreciosVenta } from './ModalPreciosVenta'

/**
 * Una fila de la tabla: el producto, su costo nuevo (`null` = no tiene uno) y las condiciones que
 * le cambia la lista (descuentos, bonificación), si le cambia alguna.
 */
export interface FilaPrecio {
  producto: ProductoPrecio
  nuevo: number | null
  condiciones?: CondicionesNuevas
}

/** Qué cambió en una fila, y con qué se calcula lo nuevo. */
function cambiosDe(f: FilaPrecio) {
  const p = f.producto
  const condiciones = f.condiciones ?? {}
  const cambiaCosto = f.nuevo !== null && Math.abs(f.nuevo - p.costo) >= 0.005
  const cambianDescuentos = condiciones.descuentos !== undefined
  const cambiaBonif = condiciones.bonif !== undefined
  return {
    cambiaCosto,
    cambianDescuentos,
    cambiaBonif,
    hayCambio: cambiaCosto || cambianDescuentos || cambiaBonif,
    /** El producto con las condiciones nuevas: con él se calculan costo final y listas. */
    nuevoProducto: conCondiciones(p, condiciones),
    costo: f.nuevo ?? p.costo,
  }
}

const textoDescuentos = (ds: readonly number[]) => (ds.length ? ds.map(pctDec).join(', ') : '—')

const POR_PAGINA = 10

interface TablaPreciosProps {
  titulo: string
  /** El proveedor de los productos: el buscador también encuentra por su nombre o código. */
  proveedor: { name: string; codigo: string }
  icono: string
  filas: readonly FilaPrecio[]
  /** Mientras se leen los productos: las filas salen en skeleton. */
  cargando?: boolean
  /** Qué decir cuando no hay filas (antes de buscar). */
  vacio: string
  /** Un dato a destacar en verde junto al título (p. ej. "12 con nuevo precio"). */
  destacado?: string
}

/** Sin acentos y en minúsculas, para que "jabon" encuentre "JABÓN". */
const normal = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * La tabla de productos de ACTUALIZAR PRECIOS, la misma en las dos formas de actualizar.
 *
 * Pagina de a 10 y SIEMPRE dibuja 10 renglones: una página incompleta se rellena con renglones
 * vacíos, así la tabla no cambia de alto al pasar de página, al buscar ni al llegar los datos (y el
 * recuadro de arrastrar y soltar de al lado la acompaña). El paginador se ve siempre, aunque haya
 * una sola página.
 *
 * Cuando el producto TIENE un precio nuevo, el anterior queda tachado y el nuevo va en verde; lo mismo
 * con los descuentos, la bonificación y el costo final que cambian. Hasta entonces se ve lo vigente.
 */
export function TablaPrecios({
  titulo,
  proveedor,
  icono,
  filas,
  cargando = false,
  vacio,
  destacado,
}: TablaPreciosProps) {
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [verPrecios, setVerPrecios] = useState<FilaPrecio | null>(null)

  const filtradas = useMemo(() => {
    const t = normal(busqueda.trim())
    if (!t) return filas
    /* Todos los productos son del mismo proveedor: si lo que se busca es el proveedor, coinciden
       todos; si no, se busca por nombre del producto, código interno o código en la lista. */
    if (normal(proveedor.name).includes(t) || normal(proveedor.codigo) === t) return filas
    return filas.filter(
      (f) =>
        normal(f.producto.nombre).includes(t) ||
        normal(f.producto.codigo).includes(t) ||
        normal(f.producto.codigoProveedor).includes(t),
    )
  }, [filas, busqueda, proveedor])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  // Otra búsqueda u otras filas: se vuelve a la primera página.
  useEffect(() => setPagina(0), [busqueda, filas])
  const actual = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(actual * POR_PAGINA, actual * POR_PAGINA + POR_PAGINA)
  const relleno = POR_PAGINA - (cargando ? 0 : visibles.length)

  const mensaje = cargando
    ? null
    : filas.length === 0
      ? vacio
      : filtradas.length === 0
        ? `Ningún producto coincide con «${busqueda.trim()}».`
        : null

  return (
    <div className="tp-card">
      <h3 className="tp-titulo">
        <i className={`fas ${icono}`} /> {titulo}
        {!cargando && filas.length > 0 && <span className="tp-cuenta">{filas.length}</span>}
        {destacado && (
          <span className="tp-destacado">
            <i className="fas fa-circle-check" /> {destacado}
          </span>
        )}
      </h3>

      {/* El buscador de "Consultar órdenes de compra": mismo campo, misma lupa y el mismo renglón de
          ayuda con la cuenta. Va DENTRO de la card, arriba de la tabla que filtra. */}
      <div className="search-container tp-buscador">
        <div className="search-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Buscar por código, proveedor o nombre de producto"
            aria-label="Buscar productos"
            autoComplete="off"
            value={busqueda}
            disabled={cargando || filas.length === 0}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <span className="search-helper" role="status" aria-live="polite">
          {cargando
            ? 'Leyendo los productos del proveedor...'
            : `${filtradas.length} de ${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}`}
        </span>
      </div>

      <div className="tp-wrap">
        <table className="tp-tabla">
          <colgroup>
            <col className="tp-w-img" />
            <col className="tp-w-nombre" />
            <col className="tp-w-cod" />
            <col className="tp-w-precio" />
            <col className="tp-w-var" />
            <col className="tp-w-precio" />
            <col className="tp-w-desc" />
            <col className="tp-w-bonif" />
            <col className="tp-w-precio" />
            <col className="tp-w-accion" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Imagen" />
              <th>Producto</th>
              <th>Cód. Interno</th>
              <th className="ta-r">Costo Anterior</th>
              <th className="ta-r">Variación Costo</th>
              <th className="ta-r">Costo Nuevo</th>
              <th className="ta-c">Descuentos</th>
              <th className="ta-c">Bonif. Merc.</th>
              <th className="ta-r">Costo Final Nuevo</th>
              <th aria-label="Precios de venta" />
            </tr>
          </thead>
          <tbody>
            {cargando &&
              Array.from({ length: POR_PAGINA }, (_, i) => (
                <tr key={`sk${i}`} className="tp-fila tp-fila--skeleton">
                  <td colSpan={10}>
                    <span className="tp-skel" />
                  </td>
                </tr>
              ))}

            {!cargando &&
              visibles.map((f) => {
                const p = f.producto
                const c = cambiosDe(f)
                const baja = c.cambiaCosto && f.nuevo! < p.costo
                return (
                  <tr key={p.id} className={`tp-fila ${c.hayCambio ? 'tp-fila--cambio' : ''}`}>
                    <td>
                      {p.imagen ? (
                        <img className="tp-img" src={p.imagen} alt="" loading="lazy" />
                      ) : (
                        <span className="tp-img tp-img--vacia" aria-hidden="true">
                          <i className="fas fa-image" />
                        </span>
                      )}
                    </td>
                    <td className="tp-nombre" title={p.nombre}>
                      {p.nombre}
                    </td>
                    <td>
                      <span className="comp-cod">{p.codigo || '—'}</span>
                    </td>
                    {/* Con precio nuevo, el anterior queda TACHADO al lado del nuevo en verde. */}
                    <td className={`ta-r ${c.cambiaCosto ? 'tp-tachado' : ''}`}>{money(p.costo)}</td>
                    <td className={`ta-r tp-var ${c.cambiaCosto ? (baja ? 'tp-var--baja' : 'tp-var--sube') : ''}`}>
                      {c.cambiaCosto ? textoVariacion(p.costo, f.nuevo!) : '—'}
                    </td>
                    <td className="ta-r">
                      {c.cambiaCosto ? (
                        <span className="tp-nuevo">{money(f.nuevo!)}</span>
                      ) : c.hayCambio ? (
                        <span className="tp-igual">Sin cambio</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {/* Descuentos y bonificación: si la lista los cambia, va el valor NUEVO en verde
                        (el anterior, en el tooltip); si no, el vigente. */}
                    <td className="ta-c">
                      {c.cambianDescuentos ? (
                        <span className="tp-nuevo" title={`Antes: ${textoDescuentos(p.descuentos)}`}>
                          {textoDescuentos(c.nuevoProducto.descuentos)}
                        </span>
                      ) : (
                        textoDescuentos(p.descuentos)
                      )}
                    </td>
                    <td className="ta-c">
                      {c.cambiaBonif ? (
                        <span className="tp-nuevo" title={`Antes: ${p.bonif ? pctDec(p.bonif) : '—'}`}>
                          {c.nuevoProducto.bonif ? pctDec(c.nuevoProducto.bonif) : '0%'}
                        </span>
                      ) : p.bonif ? (
                        pctDec(p.bonif)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="ta-r">
                      {c.hayCambio ? (
                        <strong className="tp-nuevo">{money(costoFinalDe(c.nuevoProducto, c.costo))}</strong>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="ta-c">
                      <button
                        type="button"
                        className="tp-ver"
                        title="Ver precios de venta"
                        aria-label={`Ver precios de venta de ${p.nombre}`}
                        onClick={() => setVerPrecios(f)}
                      >
                        <i className="fas fa-tags" /> Precios
                      </button>
                    </td>
                  </tr>
                )
              })}

            {/* Renglones vacíos hasta completar los 10: la tabla mide siempre lo mismo. El mensaje
                (sin productos, sin coincidencias) va en el primero. */}
            {Array.from({ length: Math.max(0, relleno) }, (_, i) => (
              <tr key={`v${i}`} className="tp-fila tp-fila--vacia" aria-hidden={i > 0 || !mensaje}>
                <td colSpan={10}>{i === 0 && mensaje ? <span className="tp-mensaje">{mensaje}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* El paginador de "Consultar órdenes de compra" (`obras-pager`): "Anterior" y la página a la
          izquierda, "Siguiente" a la derecha. Se ve siempre, aunque haya una sola página. */}
      <div className="obras-pager">
        <button
          type="button"
          className="obras-pager-btn"
          disabled={cargando || actual === 0}
          onClick={() => setPagina(actual - 1)}
        >
          <i className="fas fa-chevron-left" /> Anterior
        </button>
        <span className="obras-pager-info" aria-live="polite">
          Página {actual + 1} de {paginas} · {cargando ? 'leyendo productos…' : `${filtradas.length} ${filtradas.length === 1 ? 'producto' : 'productos'}`}
        </span>
        <button
          type="button"
          className="obras-pager-btn"
          disabled={cargando || actual >= paginas - 1}
          onClick={() => setPagina(actual + 1)}
        >
          Siguiente <i className="fas fa-chevron-right" />
        </button>
      </div>

      {verPrecios && (
        <ModalPreciosVenta
          producto={verPrecios.producto}
          nuevo={verPrecios.nuevo}
          condiciones={verPrecios.condiciones}
          onClose={() => setVerPrecios(null)}
        />
      )}
    </div>
  )
}
