import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { money } from '@/lib/format'
import { numeroSinPrefijo } from '@/lib/ordenDoc'
import { casillaDeEnvio, puedeHacerExcepciones } from '@/lib/permisos'
import { enviarConsultaOrdenMake } from '@/services/make/envioOrdenCompra'
import { crearUpdate, getContactosProveedor, urlArchivo } from '@/services/monday'
import {
  cancelarOrden,
  editarCantidadesOrden,
  firma,
  getLineasOrden,
  getOrdenesEnCurso,
  ivaLineaOrden,
  ivaOrdenLineas,
  totalLineaOrden,
  totalOrdenLineas,
  urlPdfOrden,
  type CambioCantidad,
  type EstadoRecepcion,
  type LineaOrden,
  type OrdenEnCurso,
} from '@/services/monday/consultaOrdenes'
import { useApp, useDispatch } from '@/state/hooks'
import type { Contacto } from '@/types'
import { enviarOrdenEditada, ErrorOperacion, regenerarPdfOrden, type OrdenRegenerada } from './ordenEditada'

type FiltroRecepcion = 'todas' | EstadoRecepcion

const FILTROS: { valor: FiltroRecepcion; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'pendiente', etiqueta: 'Pend de Recibir' },
  { valor: 'parcial', etiqueta: 'Parcialmente Recibida' },
]

/** Órdenes por página de la tabla. */
const POR_PAGINA = 8

/** Ventana abierta sobre una orden. */
type Ventana =
  | { tipo: 'cancelar'; orden: OrdenEnCurso }
  | { tipo: 'consultar'; orden: OrdenEnCurso }
  | { tipo: 'enviar'; orden: OrdenEnCurso; regenerada: OrdenRegenerada; resumen: ResumenEdicion }

/** Lo que dejó la edición: cada producto editado con su nuevo importe, y el total de la orden. */
interface ResumenEdicion {
  productos: { subId: string; nombre: string; antes: number; ahora: number; importe: number; iva: number | null }[]
  totalAntes: number
  total: number
  ivaAntes: number
  iva: number
}

/** Cantidades pedidas en edición: `subId` → lo escrito. */
type Edicion = { ordenId: string; valores: Record<string, string>; error: string | null }

/** La pastilla del estado, con el color de la etiqueta en el tablero. */
function EstadoChip({ texto, color }: { texto: string; color: string }) {
  return (
    <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: color || '#c4c4c4' }}>
      {texto || 'Sin estado'}
    </span>
  )
}

/** Sin mayúsculas ni acentos: "Pañales Ñandú" se encuentra escribiendo "panales nandu". */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
const fechaAR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const cant = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
const sinClick = (e: MouseEvent) => e.stopPropagation()
/** "OC-005" → "N°005": el número de la orden sin el prefijo del tablero. */
const nroOrden = (numero: string) => `N°${numeroSinPrefijo(numero)}`

const textoConsultaSugerido = (o: OrdenEnCurso) =>
  `Hola, ¿cómo están? Les escribimos de La Batea para consultar por el estado de la Orden de Compra N°${
    o.numero
  }${o.fechaEmision ? ` emitida el ${fechaAR(o.fechaEmision)}` : ''}${
    o.recepcion === 'parcial' ? ', de la que todavía tenemos mercadería pendiente de recibir' : ''
  }.\n¿Nos podrían indicar la fecha estimada de entrega? Muchas gracias.`

/**
 * CONSULTAR ÓRDENES DE COMPRA: las órdenes en curso que esperan mercadería (toda o una parte).
 *
 * Arriba, un buscador que filtra mientras se escribe por número de orden o por proveedor; abajo,
 * la tabla, que además se puede acotar a las pendientes de recibir o a las parcialmente recibidas.
 * Un clic en la fila la despliega con sus productos (los pendientes de recibir de la orden). Desde
 * cada fila se abre el PDF, y la orden se edita, se cancela o se le consulta al proveedor.
 */
export function ConsultarOrdenesView() {
  const { usuarioActual, comprador } = useApp()
  const dispatch = useDispatch()
  const [ordenes, setOrdenes] = useState<OrdenEnCurso[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroRecepcion>('todas')
  const [pagina, setPagina] = useState(0)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  /** Productos de cada orden ya leídos. Sin entrada = todavía se están leyendo. */
  const [detalles, setDetalles] = useState<Record<string, LineaOrden[] | 'error'>>({})
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [ventana, setVentana] = useState<Ventana | null>(null)
  /**
   * La orden sobre la que se está escribiendo en Monday. `enFila`: el avance se ve sólo en la fila
   * ("Actualizando…" y el parpadeo) y el resto de la pantalla queda bloqueado; sin él, con la
   * ventana de carga.
   */
  const [trabajando, setTrabajando] = useState<{
    ordenId: string
    titulo: string
    detalle: string
    enFila?: boolean
  } | null>(null)

  const cargar = useCallback(async () => {
    try {
      setOrdenes(await getOrdenesEnCurso())
    } catch {
      dispatch({ type: 'errorMonday', accion: 'traer las órdenes de compra en curso' })
      setOrdenes((o) => o ?? [])
    }
  }, [dispatch])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const conteo = useMemo(() => {
    const lista = ordenes ?? []
    return {
      todas: lista.length,
      pendiente: lista.filter((o) => o.recepcion === 'pendiente').length,
      parcial: lista.filter((o) => o.recepcion === 'parcial').length,
    }
  }, [ordenes])

  const filtradas = useMemo(() => {
    const t = norm(busqueda)
    return (ordenes ?? []).filter(
      (o) =>
        (filtro === 'todas' || o.recepcion === filtro) &&
        (!t || norm(o.numero).includes(t) || norm(o.proveedorNombre).includes(t)),
    )
  }, [ordenes, busqueda, filtro])

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const enPagina = Math.min(pagina, paginas - 1)
  const visibles = filtradas.slice(enPagina * POR_PAGINA, (enPagina + 1) * POR_PAGINA)
  useEffect(() => setPagina(0), [busqueda, filtro])

  /** Los productos de la orden; se leen una vez y quedan guardados hasta que la orden cambie. */
  const cargarDetalle = useCallback(
    async (o: OrdenEnCurso, forzar = false): Promise<LineaOrden[] | null> => {
      const ya = detalles[o.id]
      if (!forzar && Array.isArray(ya)) return ya
      setDetalles((d) => {
        const { [o.id]: _, ...resto } = d
        return resto
      })
      try {
        const lineas = await getLineasOrden(o)
        setDetalles((d) => ({ ...d, [o.id]: lineas }))
        return lineas
      } catch {
        setDetalles((d) => ({ ...d, [o.id]: 'error' }))
        return null
      }
    },
    [detalles],
  )

  const abrirFila = (o: OrdenEnCurso) => {
    setAbiertas((s) => new Set(s).add(o.id))
    void cargarDetalle(o)
  }
  const alternarFila = (o: OrdenEnCurso) => {
    if (edicion?.ordenId === o.id) return
    if (abiertas.has(o.id)) {
      setAbiertas((s) => {
        const n = new Set(s)
        n.delete(o.id)
        return n
      })
    } else abrirFila(o)
  }

  /**
   * Abre el PDF de la orden en una pestaña nueva, con el visor del navegador (desde ahí se imprime o
   * se descarga).
   *
   * La pestaña se abre EN el clic, todavía vacía: abrirla después de las consultas la haría pasar
   * por ventana emergente y el navegador la bloquearía. El archivo NO se abre por su URL de Monday,
   * porque ésta lo sirve como adjunto y el navegador lo descarga: se traen los bytes por el proxy
   * del mismo origen (`urlArchivo`) y se muestran como PDF desde memoria.
   */
  const verOrden = async (o: OrdenEnCurso) => {
    const pestana = window.open('', '_blank')
    if (!pestana) {
      setAviso({
        tipo: 'error',
        texto: 'El navegador bloqueó la pestaña del PDF. Permití las ventanas emergentes de este sitio y volvé a hacer clic.',
      })
      return
    }
    const titulo = `Orden de Compra N°${o.numero}`
    pestana.document.title = titulo
    pestana.document.body.style.cssText = 'margin:0;font:14px sans-serif;color:#676879'
    pestana.document.body.textContent = 'Cargando la orden de compra…'
    try {
      const url = await urlPdfOrden(o.id)
      if (!url) {
        pestana.close()
        setAviso({ tipo: 'error', texto: `La orden N°${o.numero} no tiene el PDF cargado en el sistema.` })
        return
      }
      const res = await fetch(urlArchivo(url))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const pdf = new Blob([await res.blob()], { type: 'application/pdf' })
      const enlace = URL.createObjectURL(pdf)
      // El visor ocupa toda la pestaña; el título de la pestaña es el de la orden, no el del blob.
      const visor = pestana.document.createElement('iframe')
      visor.src = enlace
      visor.title = titulo
      visor.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
      pestana.document.body.replaceChildren(visor)
      // Se suelta al cerrar la pestaña: antes, imprimir o descargar desde el visor tiene que seguir andando.
      pestana.addEventListener('pagehide', () => URL.revokeObjectURL(enlace))
    } catch {
      pestana.close()
      dispatch({ type: 'errorMonday', accion: 'abrir el PDF de la orden de compra' })
    }
  }

  /* ===== Editar ===== */

  const editar = async (o: OrdenEnCurso) => {
    setAviso(null)
    setAbiertas((s) => new Set(s).add(o.id))
    const lineas = await cargarDetalle(o)
    if (!lineas) return
    setEdicion({
      ordenId: o.id,
      valores: Object.fromEntries(lineas.map((l) => [l.subId, String(l.pedida)])),
      error: null,
    })
  }

  /** Lo escrito en edición, validado. Devuelve los cambios o el motivo por el que no se puede guardar. */
  const validar = (lineas: LineaOrden[], valores: Record<string, string>): CambioCantidad[] | string => {
    const excepciones = puedeHacerExcepciones(usuarioActual)
    const cambios: CambioCantidad[] = []
    let quedan = 0
    for (const l of lineas) {
      const texto = (valores[l.subId] ?? '').trim()
      if (!/^\d+$/.test(texto)) return `«${l.nombre}»: la cantidad pedida tiene que ser un número entero.`
      const n = Number(texto)
      if (n < l.recibida) return `«${l.nombre}»: no se puede pedir menos de lo ya recibido (${cant(l.recibida)}).`
      if (!excepciones && Number.isInteger(l.cantXEnvase) && n % l.cantXEnvase !== 0) {
        return `«${l.nombre}»: se compra de a ${cant(l.cantXEnvase)} unidades por ${l.unidad || 'envase'}. Sólo Compras o Administración pueden pedir otra cantidad.`
      }
      if (n > 0) quedan++
      // También se reescribe si el pendiente quedó distinto del subelemento, aunque no se haya tocado.
      if (n !== l.pedida || (l.pendId && l.pedidaPend !== n)) cambios.push({ linea: l, pedida: n })
    }
    if (quedan === 0) return 'La orden tiene que quedar con al menos un producto. Para darla de baja, cancelala.'
    return cambios
  }

  const guardar = async (o: OrdenEnCurso) => {
    const lineas = detalles[o.id]
    if (!edicion || !Array.isArray(lineas)) return
    const r = validar(lineas, edicion.valores)
    if (typeof r === 'string') {
      setEdicion({ ...edicion, error: r })
      return
    }
    if (r.length === 0) {
      setEdicion(null)
      return
    }

    let guardadas = false
    try {
      setTrabajando({
        ordenId: o.id,
        titulo: 'Guardando los cambios en el sistema...',
        detalle: 'Se actualizan las cantidades pedidas en la orden y en sus pendientes de recibir.',
        enFila: true,
      })
      const nuevas = await editarCantidadesOrden(o, lineas, r)
      guardadas = true
      setDetalles((d) => ({ ...d, [o.id]: nuevas }))
      setEdicion(null)

      setTrabajando({
        ordenId: o.id,
        titulo: 'Generando la orden de compra actualizada...',
        detalle: 'Se arma el PDF con las cantidades nuevas y se reemplaza el registrado en el sistema.',
        enFila: true,
      })
      const regenerada = await regenerarPdfOrden(o, nuevas)
      const resumen: ResumenEdicion = {
        productos: r
          .filter(({ linea, pedida }) => pedida !== linea.pedida)
          .map(({ linea, pedida }) => {
            const nueva = nuevas.find((l) => l.subId === linea.subId)!
            return {
              subId: linea.subId,
              nombre: linea.nombre,
              antes: linea.pedida,
              ahora: pedida,
              importe: totalLineaOrden(nueva),
              iva: ivaLineaOrden(nueva),
            }
          }),
        totalAntes: totalOrdenLineas(lineas),
        total: totalOrdenLineas(nuevas),
        ivaAntes: ivaOrdenLineas(lineas),
        iva: ivaOrdenLineas(nuevas),
      }
      setVentana({ tipo: 'enviar', orden: o, regenerada, resumen })
    } catch (e) {
      if (e instanceof ErrorOperacion) {
        setAviso({
          tipo: 'error',
          texto: guardadas ? `Se guardaron las cantidades, pero no se pudo generar el PDF: ${e.message}` : e.message,
        })
      } else {
        dispatch({
          type: 'errorMonday',
          accion: guardadas ? 'generar el PDF de la orden editada' : 'guardar las cantidades de la orden',
        })
      }
    } finally {
      setTrabajando(null)
      void cargar()
    }
  }

  /* ===== Acciones de las ventanas ===== */

  /** Corre una acción con la pantalla tapada, avisa el resultado y vuelve a leer la lista. */
  const ejecutar = async (
    o: OrdenEnCurso,
    titulo: string,
    hacer: () => Promise<void>,
    hecho: string,
    queHacia: string,
  ) => {
    setVentana(null)
    setTrabajando({ ordenId: o.id, titulo, detalle: 'Esperá unos segundos.' })
    try {
      await hacer()
      setAviso({ tipo: 'ok', texto: hecho })
      await cargar()
    } catch (e) {
      if (e instanceof ErrorOperacion) setAviso({ tipo: 'error', texto: e.message })
      else dispatch({ type: 'errorMonday', accion: queHacia })
    } finally {
      setTrabajando(null)
    }
  }

  const total = ordenes?.length ?? 0
  const orden1 = (n: number) => (n === 1 ? 'orden' : 'órdenes')
  const ocupado = trabajando !== null

  return (
    <section className="view paso-layout consultar-v">
      <PasoHeader />

      <PasoTitulo
        numero={1}
        titulo="Consultar órdenes de compra"
        descripcion="Las órdenes en curso con mercadería total o parcialmente recibida."
      />

      <div className="card unified-toolbar consulta-buscador">
        <div className="search-container">
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
              placeholder="Buscar por número de orden o proveedor"
              aria-label="Buscar órdenes de compra"
              autoComplete="off"
              value={busqueda}
              disabled={ordenes === null}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <span className="search-helper" role="status" aria-live="polite">
            {ordenes === null
              ? 'Leyendo las órdenes de compra...'
              : `${filtradas.length} de ${total} ${orden1(total)}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <div className="ag-filtros">
            <div className="ag-tabs" role="tablist" aria-label="Filtrar por recepción">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.valor}
                  className={`ag-tab ${filtro === f.valor ? 'ag-tab--on' : ''}`}
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.etiqueta}
                  {ordenes !== null && <span className="ag-tab-n">{conteo[f.valor]}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija ag-tabla cons-tabla">
              <colgroup>
                <col className="cons-w-nro" />
                <col className="cons-w-prov" />
                <col className="cons-w-ver" />
                <col className="cons-w-estado" />
                <col className="cons-w-fecha" />
                <col />
                <col className="cons-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>N° Orden</th>
                  <th>Proveedor</th>
                  <th>Orden</th>
                  <th>Estado</th>
                  <th>Fecha de emisión</th>
                  <th aria-hidden="true" />
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Leyendo las órdenes de compra...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {busqueda.trim()
                        ? `Ninguna orden coincide con «${busqueda.trim()}».`
                        : total === 0
                          ? 'No hay órdenes de compra en curso pendientes de recibir.'
                          : 'No hay órdenes con este filtro.'}
                    </td>
                  </tr>
                ) : (
                  visibles.map((o) => {
                    const abierta = abiertas.has(o.id)
                    const enEdicion = edicion?.ordenId === o.id
                    const enCurso = trabajando?.ordenId === o.id
                    return (
                      <Fragment key={o.id}>
                        <tr
                          className={`ant-row cons-fila ${abierta ? 'cons-fila--abierta' : ''} ${enCurso ? 'ant-row--cancelando' : ''}`}
                          aria-expanded={abierta}
                          title={abierta ? 'Clic para plegar los productos' : 'Clic para ver los productos de la orden'}
                          onClick={() => alternarFila(o)}
                        >
                          <td>
                            <div className="cons-nro">
                              <i className={`fas fa-chevron-down vid-chev ${abierta ? 'vid-chev--on' : ''}`} />
                              <span className="ant-nro">{nroOrden(o.numero)}</span>
                              <EstadoChip texto={o.estado} color={o.colorEstado} />
                            </div>
                          </td>
                          <td className="ag-turno" title={o.proveedorNombre}>
                            <span className="ag-turno-cli">{o.proveedorNombre}</span>
                          </td>
                          <td onClick={sinClick}>
                            <button type="button" className="ant-ver" onClick={() => void verOrden(o)}>
                              <i className="fas fa-file-pdf" /> Ver Orden
                            </button>
                          </td>
                          <td>
                            <EstadoChip texto={o.recepcionTexto} color={o.colorRecepcion} />
                          </td>
                          <td>
                            {o.fechaEmision ? fechaAR(o.fechaEmision) : <span className="ant-sd">Sin fecha</span>}
                          </td>
                          <td aria-hidden="true" />
                          <td className="ant-col-cen ag-col-acc" onClick={sinClick}>
                            {enCurso ? (
                              <span className="ag-trabajando">
                                <i className="fas fa-circle-notch spin" /> Actualizando…
                              </span>
                            ) : enEdicion ? (
                              <div className="ag-acciones">
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--ok"
                                  disabled={ocupado}
                                  onClick={() => void guardar(o)}
                                >
                                  <i className="fas fa-floppy-disk" /> Guardar cambios
                                </button>
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--neutro"
                                  disabled={ocupado}
                                  onClick={() => setEdicion(null)}
                                >
                                  <i className="fas fa-xmark" /> Descartar
                                </button>
                              </div>
                            ) : (
                              <div className="ag-acciones">
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--rep"
                                  disabled={ocupado || edicion !== null}
                                  onClick={() => void editar(o)}
                                >
                                  <i className="fas fa-pen" /> Editar
                                </button>
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--cancel"
                                  disabled={ocupado || edicion !== null}
                                  onClick={() => {
                                    setAviso(null)
                                    void cargarDetalle(o)
                                    setVentana({ tipo: 'cancelar', orden: o })
                                  }}
                                >
                                  <i className="fas fa-ban" /> Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--ok"
                                  disabled={ocupado || edicion !== null}
                                  onClick={() => {
                                    setAviso(null)
                                    setVentana({ tipo: 'consultar', orden: o })
                                  }}
                                >
                                  <i className="fas fa-envelope" /> Enviar Consulta
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {abierta && (
                          <tr className="vid-detalle">
                            <td colSpan={7}>
                              <DetalleOrden
                                lineas={detalles[o.id]}
                                edicion={enEdicion ? edicion : null}
                                onEscribir={(subId, valor) =>
                                  setEdicion((e) => (e ? { ...e, error: null, valores: { ...e.valores, [subId]: valor } } : e))
                                }
                                onReintentar={() => void cargarDetalle(o, true)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {ordenes !== null && (
            <div className="obras-pager">
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina === 0}
                onClick={() => setPagina(enPagina - 1)}
              >
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {filtradas.length} {orden1(filtradas.length)}
              </span>
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina >= paginas - 1}
                onClick={() => setPagina(enPagina + 1)}
              >
                Siguiente <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}

          <div className="cobro-card-acts">
            {aviso && (
              <span className={`cobro-bloqueo-inline ${aviso.tipo === 'ok' ? 'cobro-bloqueo-inline--ok' : ''}`}>
                <i className={`fas ${aviso.tipo === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{' '}
                {aviso.texto}
              </span>
            )}
          </div>
        </div>
      </div>

      {ventana?.tipo === 'enviar' && (
        <ModalEnviarEditada
          orden={ventana.orden}
          resumen={ventana.resumen}
          onClose={() => {
            setVentana(null)
            setAviso({ tipo: 'ok', texto: `Se guardaron los cambios de la orden N°${ventana.orden.numero}.` })
          }}
          onEnviar={() => {
            const { orden, regenerada } = ventana
            void ejecutar(
              orden,
              'Enviando la orden de compra editada...',
              () => enviarOrdenEditada(orden, regenerada, comprador),
              `Se guardaron los cambios y se envió la orden N°${orden.numero} al proveedor.`,
              'enviar la orden de compra editada',
            )
          }}
        />
      )}

      {ventana?.tipo === 'cancelar' && (
        <ModalCancelar
          orden={ventana.orden}
          lineas={detalles[ventana.orden.id]}
          onClose={() => setVentana(null)}
          onConfirmar={() => {
            const { orden } = ventana
            void ejecutar(
              orden,
              'Cancelando la orden de compra...',
              () => cancelarOrden(orden, usuarioActual),
              `La orden N°${orden.numero} quedó Cancelada.`,
              'cancelar la orden de compra',
            )
          }}
        />
      )}

      {ventana?.tipo === 'consultar' && (
        <ModalConsulta
          orden={ventana.orden}
          onClose={() => setVentana(null)}
          onEnviar={(texto, contactos) => {
            const { orden } = ventana
            void ejecutar(
              orden,
              'Enviando la consulta al proveedor...',
              async () => {
                const r = await enviarConsultaOrdenMake({
                  numero: orden.numero,
                  proveedor: { id: orden.proveedorId ?? '', nombre: orden.proveedorNombre },
                  comprador,
                  casilla: casillaDeEnvio(comprador),
                  contactos,
                  texto,
                })
                if (!r.ok) throw new ErrorOperacion(r.mensaje)
                await crearUpdate(
                  orden.id,
                  `Consulta enviada al proveedor (${contactos.map((c) => c.email).join(', ')}):\n${texto}\n${firma(usuarioActual)}`,
                )
              },
              `Se envió la consulta por la orden N°${orden.numero}.`,
              'registrar la consulta en la orden',
            )
          }}
        />
      )}

      {trabajando &&
        (trabajando.enFila ? (
          /* Tapa transparente: la fila se sigue viendo, pero nada de la pantalla responde. */
          <div className="cons-bloqueo" role="status" aria-live="polite">
            <span className="sr-only">{trabajando.titulo}</span>
          </div>
        ) : (
          <ModalCargando titulo={trabajando.titulo} detalle={trabajando.detalle} />
        ))}
    </section>
  )
}

/* ===== Fila desplegada: los pendientes de recibir de la orden ===== */

interface DetalleOrdenProps {
  lineas: LineaOrden[] | 'error' | undefined
  edicion: Edicion | null
  onEscribir: (subId: string, valor: string) => void
  onReintentar: () => void
}

function DetalleOrden({ lineas, edicion, onEscribir, onReintentar }: DetalleOrdenProps) {
  if (lineas === undefined) {
    return (
      <p className="cons-detalle-aviso cons-detalle-aviso--centro">
        <i className="fas fa-spinner fa-spin" /> Leyendo los productos de la orden...
      </p>
    )
  }
  if (lineas === 'error') {
    return (
      <p className="cons-detalle-aviso cons-detalle-aviso--centro">
        <i className="fas fa-triangle-exclamation" /> No se pudieron leer los productos de la orden.{' '}
        <button type="button" className="cobro-reintentar" onClick={onReintentar}>
          Volver a intentar
        </button>
      </p>
    )
  }
  if (lineas.length === 0) {
    return (
      <p className="cons-detalle-aviso cons-detalle-aviso--centro">
        <i className="fas fa-circle-info" /> La orden no tiene productos cargados.
      </p>
    )
  }
  return (
    <>
      <table className="vid-sub cons-sub">
        <colgroup>
          <col />
          <col className="cons-sub-w-cod" />
          <col className="cons-sub-w-uni" />
          <col className="cons-sub-w-cant" />
          <col className="cons-sub-w-cant" />
          <col className="cons-sub-w-cant" />
          <col className="cons-sub-w-estado" />
        </colgroup>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Código</th>
            <th>Unidad</th>
            <th>Cant. Pedida</th>
            <th>Recibida</th>
            <th>Pend. de Recibir</th>
            <th>Estado de Recepción</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const escrito = edicion?.valores[l.subId]
            const n = Number(escrito)
            const mal = escrito !== undefined && (!/^\d+$/.test(escrito.trim()) || n < l.recibida)
            const pendiente = escrito !== undefined && !mal ? Math.max(0, n - l.recibida) : l.pendiente
            return (
              <tr key={l.subId}>
                <td className="cons-sub-prod" title={l.nombre}>
                  {l.nombre}
                </td>
                <td className="vid-num-c">{l.codigo || <span className="ant-sd">—</span>}</td>
                <td className="vid-num-c">{l.unidad || <span className="ant-sd">—</span>}</td>
                <td className="vid-num-c">
                  {escrito !== undefined ? (
                    /* Sólo dígitos, y lo recibido es el PISO: la tecla que deja un número menor se
                       rechaza en el momento. Lo único que se deja pasar es un número con MENOS cifras
                       que lo recibido, porque es el paso intermedio para escribir uno mayor (con 15
                       recibidos, el "2" de "20"); queda en rojo y, si se sale así, sube a lo recibido. */
                    <input
                      className={`vid-input ${mal ? 'vid-input--mal' : ''}`}
                      inputMode="numeric"
                      value={escrito}
                      aria-label={`Cantidad pedida de ${l.nombre}`}
                      aria-invalid={mal}
                      title={l.recibida > 0 ? `Mínimo ${cant(l.recibida)}: es lo que ya se recibió.` : undefined}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '')
                        if (v.length > 1 && v.startsWith('0')) return
                        const cifrasMin = String(l.recibida).length
                        if (v !== '' && Number(v) < l.recibida && v.length >= cifrasMin) return
                        onEscribir(l.subId, v)
                      }}
                      onBlur={() => {
                        const v = escrito.trim()
                        if (v === '') onEscribir(l.subId, String(l.pedida))
                        else if (Number(v) < l.recibida) onEscribir(l.subId, String(l.recibida))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          const actual = Number(escrito) || 0
                          const paso = e.key === 'ArrowUp' ? 1 : -1
                          onEscribir(l.subId, String(Math.max(l.recibida, actual + paso)))
                        }
                      }}
                    />
                  ) : (
                    cant(l.pedida)
                  )}
                </td>
                <td className="vid-num-c">{cant(l.recibida)}</td>
                <td className="vid-num-c cons-sub-falta">{cant(pendiente)}</td>
                <td className="vid-num-c">
                  <EstadoChip texto={l.estado} color={l.colorEstado} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {edicion && (
        <p className={`cons-detalle-aviso ${edicion.error ? 'cons-detalle-aviso--error' : ''}`}>
          <i className={`fas ${edicion.error ? 'fa-triangle-exclamation' : 'fa-circle-info'}`} />{' '}
          {edicion.error ??
            'Editá las cantidades pedidas y tocá «Guardar cambios». No se puede pedir menos de lo ya recibido.'}
        </p>
      )}
    </>
  )
}

/* ===== Ventanas ===== */

/** ¿Enviar la orden editada? Los cambios ya están guardados: "No" sólo cierra. */
function ModalEnviarEditada({
  orden,
  resumen,
  onClose,
  onEnviar,
}: {
  orden: OrdenEnCurso
  resumen: ResumenEdicion
  onClose: () => void
  onEnviar: () => void
}) {
  return (
    <Modal
      title="¿Enviar la orden editada al proveedor?"
      icon={<i className="fas fa-paper-plane" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            No, gracias
          </button>
          <button type="button" className="btn btn-primary" onClick={onEnviar}>
            Sí, enviar orden
          </button>
        </>
      }
    >
      Los cambios de la orden <strong>N°{orden.numero}</strong> quedaron guardados y su PDF ya está
      registrado en el sistema.
      {resumen.productos.length > 0 && (
        <table className="pend-tabla cons-modal-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="ta-c">Cantidad pedida</th>
              <th className="ta-r">Nuevo importe</th>
              <th className="ta-r">Nuevo IVA</th>
            </tr>
          </thead>
          <tbody>
            {resumen.productos.map((p) => (
              <tr key={p.subId}>
                <td>
                  <span className="pend-prod">{p.nombre}</span>
                </td>
                <td className="ta-c">
                  {cant(p.antes)} <i className="fas fa-arrow-right cons-flecha" /> <strong>{cant(p.ahora)}</strong>
                </td>
                <td className="ta-r">
                  <strong>{money(p.importe)}</strong>
                </td>
                <td className="ta-r">{p.iva === null ? <span className="ant-sd">Sin IVA</span> : money(p.iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="cons-total-orden">
        <p>
          <span>Nuevo importe total de la orden</span>
          <span>
            {resumen.totalAntes !== resumen.total && (
              <span className="cons-total-antes">{money(resumen.totalAntes)}</span>
            )}
            <strong>{money(resumen.total)}</strong>
          </span>
        </p>
        <p>
          <span>Nuevo IVA total de la orden</span>
          <span>
            {resumen.ivaAntes !== resumen.iva && <span className="cons-total-antes">{money(resumen.ivaAntes)}</span>}
            <strong>{money(resumen.iva)}</strong>
          </span>
        </p>
      </div>
      ¿Querés enviarle la orden de compra editada a <strong>{orden.proveedorNombre}</strong>?
    </Modal>
  )
}

/** Cancelar: confirmación formal, con lo que se recibió de cada producto. */
function ModalCancelar({
  orden,
  lineas,
  onClose,
  onConfirmar,
}: {
  orden: OrdenEnCurso
  lineas: LineaOrden[] | 'error' | undefined
  onClose: () => void
  onConfirmar: () => void
}) {
  return (
    <Modal
      title={`¿Está seguro que desea cancelar la orden de compra N°${orden.numero}?`}
      icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="btn btn-primary cons-btn-peligro" onClick={onConfirmar}>
            Sí, cancelar orden
          </button>
        </>
      }
    >
      La orden de <strong>{orden.proveedorNombre}</strong> pasa a <strong>Cancelada</strong> y deja de
      esperarse. Esto es lo que se recibió de cada producto:
      {lineas === undefined ? (
        <p className="cons-detalle-aviso">
          <i className="fas fa-spinner fa-spin" /> Leyendo los productos de la orden...
        </p>
      ) : lineas === 'error' ? (
        <p className="cons-detalle-aviso cons-detalle-aviso--error">
          <i className="fas fa-triangle-exclamation" /> No se pudieron leer los productos de la orden.
        </p>
      ) : (
        <table className="pend-tabla cons-modal-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="ta-c">Pedido</th>
              <th className="ta-c">Recibido</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.subId}>
                <td>
                  {l.codigo && <span className="comp-cod">{l.codigo}</span>}
                  <span className="pend-prod">{l.nombre}</span>
                </td>
                <td className="ta-c">{cant(l.pedida)}</td>
                <td className="ta-c">
                  <strong>{cant(l.recibida)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}

/**
 * `onClose` es una función nueva en cada render del padre: si entrara en las dependencias de la
 * carga de un modal, la carga se repetiría sin fin. Se lee siempre la última desde una ref.
 */
function useUltima<T>(valor: T) {
  const ref = useRef(valor)
  ref.current = valor
  return ref
}

/**
 * Enviar Consulta: el mensaje prearmado, editable. Va a los contactos del proveedor que aceptan
 * órdenes de compra (o, si ninguno lo tiene marcado, a todos los que tienen correo).
 */
function ModalConsulta({
  orden,
  onClose,
  onEnviar,
}: {
  orden: OrdenEnCurso
  onClose: () => void
  onEnviar: (texto: string, contactos: Contacto[]) => void
}) {
  const dispatch = useDispatch()
  const [texto, setTexto] = useState(() => textoConsultaSugerido(orden))
  const [contactos, setContactos] = useState<Contacto[] | null>(null)
  const cerrar = useUltima(onClose)

  useEffect(() => {
    if (!orden.proveedorId) {
      setContactos([])
      return
    }
    let vivo = true
    getContactosProveedor(orden.proveedorId)
      .then((cs) => {
        if (!vivo) return
        const conEmail = cs.filter((c) => c.email.trim())
        const aceptan = conEmail.filter((c) => c.ok)
        setContactos(aceptan.length ? aceptan : conEmail)
      })
      .catch(() => {
        if (!vivo) return
        cerrar.current()
        dispatch({ type: 'errorMonday', accion: 'traer los contactos del proveedor' })
      })
    return () => {
      vivo = false
    }
  }, [orden.proveedorId, dispatch, cerrar])

  return (
    <Modal
      title={`Enviar consulta a ${orden.proveedorNombre}`}
      icon={<i className="fas fa-envelope" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-out" onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!texto.trim() || !contactos?.length}
            onClick={() => onEnviar(texto.trim(), contactos ?? [])}
          >
            Enviar consulta
          </button>
        </>
      }
    >
      Esta es la consulta que se le va a enviar al proveedor por la orden <strong>N°{orden.numero}</strong>.
      Podés editarla antes de enviarla.
      <textarea
        className="pend-textarea"
        rows={7}
        value={texto}
        aria-label="Texto de la consulta"
        onChange={(e) => setTexto(e.target.value)}
      />
      <p className="cons-destinatarios">
        {contactos === null ? (
          <>
            <i className="fas fa-spinner fa-spin" /> Buscando los contactos del proveedor...
          </>
        ) : contactos.length === 0 ? (
          <span className="cons-destinatarios--error">
            <i className="fas fa-triangle-exclamation" /> El proveedor no tiene contactos con correo cargado.
          </span>
        ) : (
          <>
            <i className="fas fa-at" /> Se envía a: {contactos.map((c) => `${c.name} (${c.email})`).join(', ')}
          </>
        )}
      </p>
    </Modal>
  )
}
