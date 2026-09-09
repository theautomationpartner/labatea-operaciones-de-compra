import { useCallback, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { buscarProductos, siguientePaginaProductos } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Producto } from '@/types'
import {
  SIN_RESULTADOS,
  cerrado,
  conElegido,
  conPaginaSiguiente,
  conPrimeraPagina,
  cursorActual,
  enPagina,
  hayAnterior,
  haySiguiente,
  paginaActual,
  reabierto,
  sinMasPaginas,
  type ResultadosBusqueda,
} from './resultadosBusqueda'

/** Pista del campo cuando quedó una búsqueda guardada, replegada tras elegir un producto. */
const PISTA_RELISTAR = 'Hacé click para volver a ver los resultados de la última búsqueda.'

interface BuscadorProductoProps {
  /**
   * ID del proveedor de la orden. TODA búsqueda va restringida a él: no se pueden mezclar
   * productos de proveedores distintos en una misma orden (ver `services/monday/productos`).
   */
  proveedorId: string
  onSelect: (p: Producto) => void
  /**
   * Recibe el aviso de búsqueda (sin resultados / error de red) para mostrarlo donde iría el
   * producto elegido, en vez de debajo del campo.
   */
  onAviso?: (aviso: string) => void
}

/**
 * Búsqueda de producto contra el Maestro de Productos. Es el MISMO buscador del paso 2 de la app
 * de ventas: la consulta se resuelve entera del lado del servidor (reglas dinámicas +
 * `items_page`), llega de a una página y el desplegable la muestra con su barra de navegación.
 *
 * Se elige un producto por vez: al hacer click la lista se repliega y el producto se carga en
 * «Producto seleccionado», donde se ajusta la cantidad antes de agregarlo. Los resultados NO se
 * pierden: volver a hacer click en el buscador los relista donde estaban —misma página, mismo
 * cursor, filas elegidas marcadas—, así se puede tomar otro producto de esa misma búsqueda. Recién
 * una búsqueda nueva los reemplaza.
 */
export function BuscadorProducto({ proveedorId, onSelect, onAviso }: BuscadorProductoProps) {
  const { filtros } = useApp()
  const dispatch = useDispatch()
  const [termino, setTermino] = useState('')
  // Toda la búsqueda paginada vive en un solo estado, con transiciones puras (ver el módulo).
  const [resultados, setResultados] = useState<ResultadosBusqueda>(SIN_RESULTADOS)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => setResultados(cerrado), [])
  // Click afuera: una de las tres únicas formas de cerrar la lista.
  useClickOutside(ref, cerrar, resultados.abierto)

  // El aviso se muestra donde lo pida el padre; si no lo maneja, queda bajo el campo.
  const avisar = (mensaje: string) => {
    if (onAviso) onAviso(mensaje)
    else setError(mensaje)
  }

  /**
   * Click en una fila: carga el producto en «Producto seleccionado» y repliega la lista para
   * dejarlo a la vista. Los resultados quedan guardados —no se consulta nada de nuevo— y vuelven
   * a listarse al hacer click en el buscador.
   */
  const elegir = (p: Producto) => {
    onSelect(p)
    setResultados((r) => conElegido(r, p))
    setError('')
    onAviso?.('')
  }

  /** Vuelta al buscador: se relistan los resultados ya traídos, si todavía hay. */
  const reabrir = () => setResultados(reabierto)
  /** Hay una búsqueda guardada que se puede volver a listar sin consultar. */
  const hayGuardados = resultados.paginas.length > 0 && !resultados.abierto

  const buscar = async () => {
    const t = termino.trim()
    /* Se puede buscar sólo por filtros: alcanza con un término O con filtros aplicados. Sin
       ninguno de los dos no hay nada que consultar —el catálogo del proveedor entero no es una
       búsqueda, es el tablero—. */
    if (!t && filtros.length === 0) {
      avisar('Ingresá un nombre o código, o aplicá filtros para buscar.')
      return
    }
    setError('')
    onAviso?.('')
    // Búsqueda nueva: es el único punto donde se descarta lo traído antes.
    setResultados(SIN_RESULTADOS)
    setCargando(true)
    try {
      const res = await buscarProductos(t, filtros, proveedorId)
      if (res.productos.length === 0) {
        /* El "sin resultados" de compras dice algo más que el de ventas, y a propósito: la causa
           más probable NO es que el producto no exista, sino que exista y no esté conectado a ESTE
           proveedor en el Maestro. Sin decirlo, el usuario buscaría de nuevo un producto que ve en
           el tablero y que la app le niega sin explicación. */
        avisar(
          t
            ? `Sin resultados para «${t}» entre los productos de este proveedor.`
            : 'Ningún producto de este proveedor cumple con los filtros aplicados.',
        )
        return
      }
      /* Coincidencia única y sin más páginas (el caso típico del código): se carga directo y no
         queda lista que sostener, así que el campo se limpia para el próximo código. */
      if (res.productos.length === 1 && !res.cursor) {
        onSelect(res.productos[0])
        setTermino('')
        return
      }
      setResultados(conPrimeraPagina(res))
    } catch {
      /* El fallo de la API lo comunica la ventana global: acá no se deja ningún aviso en línea,
         que además se confundiría con los avisos de "sin resultados" del propio buscador. */
      dispatch({ type: 'errorMonday', accion: 'buscar productos en el catálogo' })
    } finally {
      setCargando(false)
    }
  }

  const actuales = paginaActual(resultados)
  const atras = hayAnterior(resultados)
  const adelante = haySiguiente(resultados)

  /**
   * Trae la página siguiente pasando EXCLUSIVAMENTE el cursor guardado. Si ya se había traído (el
   * usuario volvió atrás), se muestra la que está en memoria y no se consulta de nuevo.
   */
  const siguiente = async () => {
    if (cargando || !adelante) return
    if (resultados.pagina < resultados.paginas.length - 1) {
      setResultados((r) => enPagina(r, r.pagina + 1))
      return
    }
    const cursor = cursorActual(resultados)
    if (!cursor) return
    setCargando(true)
    try {
      const res = await siguientePaginaProductos(cursor, proveedorId)
      // Cursor agotado: no hay más para mostrar, así que se inactiva la flecha.
      setResultados((r) =>
        res.productos.length === 0 ? sinMasPaginas(r) : conPaginaSiguiente(r, res),
      )
    } catch {
      dispatch({ type: 'errorMonday', accion: 'traer la página siguiente de productos' })
    } finally {
      setCargando(false)
    }
  }

  const anterior = () => {
    if (cargando || !atras) return
    setResultados((r) => enPagina(r, r.pagina - 1))
  }

  return (
    <div className="search-row" ref={ref}>
      <div className="search-input-wrapper">
        <i className="fas fa-search" />
        <input
          id="prod-search"
          type="text"
          className="search-input"
          placeholder="Buscar por nombre, código o filtros aplicados"
          title={hayGuardados ? PISTA_RELISTAR : undefined}
          autoComplete="off"
          value={termino}
          disabled={cargando}
          /* Volver al buscador relista lo último que se trajo, sin consultar de nuevo. */
          onFocus={reabrir}
          onClick={reabrir}
          /* Escribir NO cierra la lista: los resultados se reemplazan recién al buscar. */
          onChange={(e) => {
            setTermino(e.target.value)
            if (error) setError('')
            onAviso?.('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && !cargando && buscar()}
        />
      </div>
      <button type="button" className="btn-primary" onClick={buscar} disabled={cargando}>
        {cargando ? (
          <>
            <i className="fas fa-spinner fa-spin" /> Buscando...
          </>
        ) : (
          <>
            <i className="fas fa-search" /> Buscar
          </>
        )}
      </button>

      {resultados.abierto && actuales.length > 0 && (
        <div className="results results--paged">
          <div className="results-list">
            {actuales.map((p) => {
              const elegido = resultados.elegidos.has(p.codigo)
              return (
                <div
                  className={`ritem ${elegido ? 'ritem--elegido' : ''}`}
                  key={p.id ?? p.codigo}
                  onClick={() => elegir(p)}
                  title={
                    elegido ? 'Ya seleccionado. Volvé a hacer click para cargarlo de nuevo.' : undefined
                  }
                >
                  <span className="ritem-name">{p.nombre}</span>
                  <span className="ritem-meta">
                    <span className="ritem-code">{p.codigo}</span>
                    {elegido && (
                      <span className="ritem-tag">
                        <i className="fas fa-check" /> Seleccionado
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="results-pager">
            <button
              type="button"
              className="results-pager-btn"
              onClick={anterior}
              disabled={!atras || cargando}
              aria-label="Página anterior"
            >
              <i className="fas fa-chevron-left" /> Anterior
            </button>
            <span className="results-pager-info" aria-live="polite">
              Página {resultados.pagina + 1} · {actuales.length} productos
            </span>
            <button
              type="button"
              className="results-pager-btn"
              onClick={siguiente}
              disabled={!adelante || cargando}
              aria-label="Página siguiente"
            >
              Siguiente <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      )}
      {error && <div className="search-error">{error}</div>}
    </div>
  )
}
