import { useCallback, useRef, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { buscarProveedores } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import type { Proveedor } from '@/types'

/** Estado de la búsqueda, compartido con la vista para renderizar el resultado. */
export type BusquedaEstado = 'idle' | 'buscando' | 'no-encontrado' | 'error'

interface BuscarProveedorProps {
  estado: BusquedaEstado
  onEstado: (estado: BusquedaEstado) => void
  /**
   * Qué hacer con el proveedor elegido. Es OBLIGATORIO, y no tiene comportamiento por defecto a
   * propósito: la vista tiene que VALIDAR que esa persona sirva para la operación antes de
   * cargarla (ver `lib/proveedorCompra`), y un `dispatch` por defecto acá dejaría que un lugar
   * nuevo se saltee esa validación sin que nada lo delate.
   */
  onElegir: (persona: Proveedor) => void
  placeholder?: string
  mensajeVacio?: string
}

/**
 * Búsqueda del proveedor contra el board de Personas (capa de servicio). Es el MISMO componente
 * del paso 1 de PAGOS, con el mismo comportamiento: detecta si se ingresó nombre, código o CUIT y
 * no exige coincidencia exacta. Si hay una sola coincidencia se carga directo; si hay varias —dos
 * proveedores con el mismo nombre— se abren como desplegable para elegir cuál.
 *
 * El loading y el «no encontrado» los muestra la vista, no acá.
 */
export function BuscarProveedor({
  estado,
  onEstado,
  onElegir,
  placeholder = 'Buscar proveedor por código, nombre o CUIT...',
  mensajeVacio = 'Ingresá un nombre, código de proveedor o CUIT.',
}: BuscarProveedorProps) {
  const dispatch = useDispatch()
  // El campo arranca (y queda) vacío: no muestra el proveedor elegido, para encadenar búsquedas.
  const [termino, setTermino] = useState('')
  const [errorInput, setErrorInput] = useState('')
  const [resultados, setResultados] = useState<Proveedor[]>([])
  /* La búsqueda trajo el tope y quedaron coincidencias afuera. Se DICE: callarlo sería el error
     —viendo una parte de los resultados, quien no encuentra al suyo concluye que no está cargado—. */
  const [truncado, setTruncado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(
    ref,
    useCallback(() => setAbierto(false), []),
    abierto,
  )
  const buscando = estado === 'buscando'

  const elegir = (p: Proveedor) => {
    // El campo queda vacío tras elegir: el resultado se ve en la ficha, no en el buscador.
    setTermino('')
    setResultados([])
    setTruncado(false)
    setAbierto(false)
    onEstado('idle')
    onElegir(p)
  }

  const buscar = async () => {
    const t = termino.trim()
    if (!t) {
      setErrorInput(mensajeVacio)
      return
    }
    setErrorInput('')
    setAbierto(false)
    onEstado('buscando')
    try {
      const { personas: encontrados, truncado: hayMas } = await buscarProveedores(t)
      setTruncado(hayMas)
      if (encontrados.length === 0) {
        onEstado('no-encontrado')
        return
      }
      /* Una sola coincidencia: se carga directo. Varias: se muestran para elegir.
         Con la lista truncada NO se auto-carga aunque haya venido una sola: puede no ser la que el
         usuario busca, y elegirla por él sería decidir con información incompleta. */
      if (encontrados.length === 1 && !hayMas) {
        elegir(encontrados[0])
        return
      }
      setResultados(encontrados)
      setAbierto(true)
      onEstado('idle')
    } catch {
      /* El fallo de la API lo comunica la ventana global (`ModalErrorMonday`); el estado 'error'
         sólo sirve para que la vista no muestre la ficha como si hubiera resultado. */
      onEstado('error')
      dispatch({ type: 'errorMonday', accion: 'buscar el proveedor' })
    }
  }

  /* Hay resultados desplegados. Se calcula una sola vez porque lo miran los dos: el campo, para
     pegarse a la lista, y la lista, para mostrarse. */
  const desplegado = abierto && resultados.length > 0

  return (
    <>
      <div className="search-container" ref={ref}>
        {/* El desplegable de resultados cuelga de ACÁ, no del contenedor: así su `top: 100%` cae
            justo en el borde de abajo del campo. Colgado del contenedor se le sumaba todo lo que
            viene después del input —el gap y el renglón del aviso—, y la lista quedaba flotando
            separada del buscador. El anclaje mide exactamente lo que mide el campo. */}
        <div className="search-anclaje">
          {/* Con la lista abierta el campo se cuadra abajo, así el borde entre los dos deja de
              leerse como el corte entre dos cajas y pasan a ser un solo panel. */}
          <div className={`search-wrapper ${desplegado ? 'search-wrapper--abierto' : ''}`}>
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
              type="text"
              className="search-input"
              placeholder={placeholder}
              autoComplete="off"
              value={termino}
              disabled={buscando}
              onChange={(e) => {
                setTermino(e.target.value)
                if (errorInput) setErrorInput('')
                if (abierto) setAbierto(false)
                // Editar la búsqueda limpia el resultado anterior (aviso / error).
                if (estado !== 'idle') onEstado('idle')
              }}
              onKeyDown={(e) => e.key === 'Enter' && !buscando && buscar()}
            />
          </div>

          {/* Varios proveedores con el mismo nombre: se elige por código. */}
          {desplegado && (
            <div className="results">
              {/* La lista vino cortada: se avisa ARRIBA de los resultados, que es donde se mira
                  antes de recorrerlos. Sin esto, el que no encuentra su proveedor entre los que ve
                  concluye que no existe. */}
              {truncado && (
                <div className="results-aviso" role="status">
                  <i className="fas fa-circle-info" aria-hidden="true" /> Se muestran los primeros{' '}
                  {resultados.length} resultados. Agregá más letras, o buscá por código o CUIT, para
                  encontrar el proveedor exacto.
                </div>
              )}
              {resultados.map((p) => (
                <div className="ritem" key={p.id} onClick={() => elegir(p)}>
                  <span className="ritem-name">{p.name}</span>
                  <span className="ritem-code">{p.codigo}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* El renglón se monta SIEMPRE, con o sin texto: es lo que reserva su lugar, así el error
            no empuja al buscador ni a la ficha de abajo al aparecer. Siempre presente, además,
            puede ser una región viva de verdad. */}
        <span
          className={`search-helper ${errorInput ? 'search-helper--error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {errorInput}
        </span>
      </div>

      <button type="button" className="btn-buscar" onClick={buscar} disabled={buscando}>
        {buscando ? (
          <>
            <i className="fas fa-spinner fa-spin" /> Buscando...
          </>
        ) : (
          <>
            <i className="fas fa-search" /> Buscar
          </>
        )}
      </button>
    </>
  )
}
