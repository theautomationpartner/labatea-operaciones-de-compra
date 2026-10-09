import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ContactosPicker } from '@/features/shared/ContactosPicker'
import { EditarContactoModal } from '@/features/shared/EditarContactoModal'
import { useBloqueoCredito } from '@/features/shared/useBloqueoCredito'
import { casillaDeEnvio } from '@/lib/permisos'
import {
  contactosSinVia,
  faltaParaMedio,
  msgContactoSinVia,
  sinViaDeEnvio,
} from '@/lib/validaciones'
import { enviarOrdenCompraMake, type ResultadoEnvioOrden } from '@/services/make/envioOrdenCompra'
import { getContactosProveedor } from '@/services/monday'
import { fechaHoyAR, fechaRecepcionEstimada, totalOrden } from '@/lib/ordenDoc'
import { useApp, useDispatch } from '@/state/hooks'
import type { Contacto, LogEntry, MedioEnvio } from '@/types'

/** Ícono de cada tipo de aviso del envío, al lado de su detalle. */
const ICONO_LOG: Record<LogEntry['tipo'], string> = {
  ok: 'fa-circle-check',
  err: 'fa-circle-exclamation',
  info: 'fa-circle-info',
}

/** Estado del envío, que se muestra como una sola línea dentro de la card. */
type EstadoEnvio = 'idle' | 'enviando' | 'enviado' | 'error'

/** Los textos que cambian según qué documento se envía. */
export interface TextosEnvio {
  cargando: string
  sinContactosTitulo: string
  sinContactosTexto: ReactNode
  noEmitidoTitulo: string
  noEmitidoTexto: string
  errorTitulo: string
  enviadoTitulo: string
}

/**
 * QUÉ se envía, A QUIÉN y CÓMO. Sin `fuente`, el componente envía la orden de compra a los contactos
 * del proveedor (su uso original); con ella, el mismo componente —mismo layout, estados y
 * validaciones— envía otro documento, como el comprobante de una actualización de costos.
 */
export interface FuenteEnvio {
  /** El PDF a enviar. `null` = todavía no está generado: no se puede enviar. */
  pdf: File | null
  /** Identifica la lista de contactos: cuando cambia, se vuelven a pedir. */
  claveContactos: string
  cargarContactos: () => Promise<Contacto[]>
  enviar: (d: {
    pdf: File
    contactos: readonly Contacto[]
    medio: MedioEnvio
    casilla: string
  }) => Promise<ResultadoEnvioOrden>
  textos: TextosEnvio
  /** Los contactos se pueden editar en Monday (sólo los del tablero de Contactos). */
  editables: boolean
  /** Se frena si el proveedor está bloqueado (sólo para lo que se le manda AL proveedor). */
  validarCredito: boolean
}

const TEXTOS_ORDEN: TextosEnvio = {
  cargando: 'Cargando contactos del proveedor…',
  sinContactosTitulo: 'El proveedor no tiene contactos asignados',
  sinContactosTexto:
    'no tiene contactos cargados en el tablero de Contactos, así que no es posible realizar el envío. Asignale al menos un contacto y volvé a reintentar.',
  noEmitidoTitulo: 'Falta emitir el comprobante',
  noEmitidoTexto: 'No es posible realizar el envío. Primero debe emitir la orden de compra para poder enviarla.',
  errorTitulo: 'No se pudo enviar la orden',
  enviadoTitulo: 'Orden enviada',
}

/**
 * Envío de la orden de compra a los contactos del proveedor.
 *
 * Es el MISMO componente que el de la app de ventas —mismo layout, mismos estados del botón,
 * mismas validaciones y mismos textos—, con dos simplificaciones que vienen del dominio: acá hay
 * UN solo comprobante (así que no existe el catálogo `comprobantesEnviables` que allá elige entre
 * cuatro) y los contactos son los del proveedor.
 *
 * El envío sale por el escenario de Make.com, igual que el presupuesto en ventas: la orden todavía
 * NO existe en Monday —nace recién cuando el envío se confirma—, así que el PDF emitido viaja en el
 * pedido junto con los destinatarios, el medio y la CASILLA desde la que sale el correo (la de Mechi
 * para sus órdenes, la de logística para el resto: ver `lib/permisos.casillaDeEnvio`).
 *
 * Sólo se puede enviar con la orden EMITIDA (su PDF generado). Cuando el envío queda en "Enviado",
 * avisa a la vista (`onEnviado`), que es la que registra la orden en Monday.
 *
 * Con `fuente`, el MISMO componente envía otro documento a otros destinatarios: ACTUALIZAR PRECIOS
 * lo usa para mandar el reporte de la actualización a Administración y Compras.
 */
export function EnviarDocumento({
  onEnviado,
  fuente: fuenteExterna,
}: {
  onEnviado?: (cuando: Date) => void
  fuente?: FuenteEnvio
}) {
  const {
    medioEnvio,
    contactos,
    proveedor,
    comprador,
    nroOrden,
    ordenPdf,
    lineas,
    documentoEmitido,
    documentoEnviado,
    log,
  } = useApp()
  const dispatch = useDispatch()
  const casilla = casillaDeEnvio(comprador)

  /* Sin fuente externa: la orden de compra, a los contactos del proveedor, por su escenario. */
  const fuenteOrden = useMemo<FuenteEnvio>(
    () => ({
      pdf: documentoEmitido ? ordenPdf : null,
      claveContactos: proveedor?.id ?? '',
      cargarContactos: () => (proveedor ? getContactosProveedor(proveedor.id) : Promise.resolve([])),
      enviar: ({ pdf, contactos: cs, medio, casilla: desde }) =>
        enviarOrdenCompraMake({
          numero: nroOrden ?? '',
          fechaEmision: fechaHoyAR(),
          fechaRecepcionEstimada: proveedor ? fechaRecepcionEstimada(fechaHoyAR(), proveedor.diasRecepcion) : null,
          proveedor: proveedor!,
          comprador,
          casilla: desde,
          medio,
          contactos: cs,
          total: totalOrden(lineas),
          pdf,
        }),
      textos: TEXTOS_ORDEN,
      editables: true,
      validarCredito: true,
    }),
    [documentoEmitido, ordenPdf, proveedor, nroOrden, comprador, lineas],
  )
  const fuente = fuenteExterna ?? fuenteOrden
  const textos = fuente.textos
  /* La carga de contactos se lee por ref: la función cambia en cada render, la lista no. */
  const cargarRef = useRef(fuente.cargarContactos)
  cargarRef.current = fuente.cargarContactos
  // Aviso al intentar enviar sin haber emitido la orden todavía.
  const [avisoNoEmitido, setAvisoNoEmitido] = useState(false)
  // Si se sale del paso mientras se espera el envío, no se actualiza un componente desmontado.
  const activo = useRef(true)
  useEffect(() => {
    activo.current = true
    return () => {
      activo.current = false
    }
  }, [])
  /* El envío no consume línea nueva: el bloqueo sólo mira el estado del proveedor, no un importe
     (por eso va con cero). */
  const bloqueo = useBloqueoCredito(0)
  // Estado del envío: gobierna íntegramente el botón (idle / loading / success / error).
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvio>('idle')
  const enviando = estadoEnvio === 'enviando'
  /* Éxito PERSISTENTE: el envío ya se completó (bandera global) o se acaba de completar (estado
     local). Sobrevive a la navegación con el stepper, así el botón NO vuelve a habilitarse ni
     pierde su color de éxito al volver a esta etapa. */
  const enviadoOk = documentoEnviado || estadoEnvio === 'enviado'

  /**
   * Vuelve a foja cero tras un intento fallido. Se llama cuando el usuario TOCA algo que puede
   * haber resuelto el problema —quitar un contacto, cambiar el medio—: dejar el botón en rojo y el
   * motivo viejo a la vista haría dudar de si el aviso es de antes o de ahora.
   *
   * No toca un envío YA hecho: ahí no hay nada que reintentar y el verde tiene que quedarse.
   */
  const limpiarIntento = () => {
    if (documentoEnviado) return
    setEstadoEnvio('idle')
    dispatch({ type: 'setLog', entries: null })
  }

  /**
   * Los contactos del proveedor se traen al entrar al paso, así ya están listos cuando el usuario
   * elige enviar. Se reparten según su clasificación: los que aceptan el documento quedan
   * seleccionados de entrada, y los que no, disponibles en el buscador por si igual se los quiere
   * sumar.
   */
  const [disponibles, setDisponibles] = useState<Contacto[]>([])
  // Contacto abierto en la ventana de edición.
  const [editando, setEditando] = useState<Contacto | null>(null)
  const [cargando, setCargando] = useState(false)
  // Si el proveedor no tiene ningún contacto en el tablero, el envío no es posible.
  const [sinContactos, setSinContactos] = useState(false)
  /* La selección elegida vive en el estado global y sobrevive a la navegación. Se lee por ref para
     no meterla en las deps del efecto (la pisaría en cada cambio). */
  const contactosRef = useRef(contactos)
  contactosRef.current = contactos
  useEffect(() => {
    if (!fuente.claveContactos) {
      setDisponibles([])
      return
    }
    let vivo = true
    setCargando(true)
    /* La consulta está CACHEADA por proveedor: al volver a esta etapa con el stepper resuelve al
       instante y no se le pega de nuevo a Monday ni parpadea el "Cargando contactos…". */
    cargarRef.current()
      .then((cs) => {
        if (!vivo) return
        setSinContactos(cs.length === 0)
        /* El buscador conserva a todos: el picker ya descarta los que están seleccionados, así que
           arranca mostrando sólo los que no aceptan, y un contacto quitado a mano vuelve a quedar
           disponible. */
        setDisponibles(cs)
        /* La selección se siembra UNA sola vez: si ya hay contactos elegidos —porque el usuario los
           ajustó y navegó con el stepper— no se los pisa con la lista por defecto. */
        if (contactosRef.current.length === 0) {
          dispatch({ type: 'setContactos', contactos: cs.filter((c) => c.ok) })
        }
      })
      .catch(() => {
        if (!vivo) return
        setDisponibles([])
        setSinContactos(true)
        dispatch({ type: 'errorMonday', accion: 'traer los contactos para el envío' })
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [fuente.claveContactos, dispatch])

  /**
   * Frena el envío cuando algún contacto elegido no tiene el dato que el medio necesita, y explica
   * cuál y por qué. UNA entrada de log por contacto: con dos o tres en falta, un solo mensaje que
   * los enumere obliga a leerlo entero para saber a quién quitar.
   *
   * Se valida ACÁ y no al elegir el contacto: el medio se puede cambiar después de armar la lista,
   * y lo que era válido con "Ambos" deja de serlo al pasar a "Email".
   *
   * Devuelve `true` si frenó. Con "Ambos" NUNCA frena: ver `contactosSinVia`.
   */
  const frenarPorContactoSinVia = (): boolean => {
    const sinVia = contactosSinVia(contactos, medioEnvio)
    if (sinVia.length === 0) return false
    dispatch({
      type: 'setLog',
      entries: sinVia.map((c) => ({
        id: `sin-via-${c.id}`,
        tipo: 'err' as const,
        titulo: `${c.name} no puede recibirlo por ${medioEnvio.toLowerCase()}`,
        detalle: `${msgContactoSinVia(c.name, medioEnvio)} Quitalo de la lista para enviarles al resto, o cargale el dato en Monday y reintentá.`,
      })),
    })
    setEstadoEnvio('error')
    return true
  }

  const confirmar = () => {
    // Anti-duplicado: si el envío ya se ejecutó con éxito, la acción se anula internamente.
    if (enviando || enviadoOk) return
    /* Sin la orden emitida NO se envía: early return sin tocar la API de Monday, y se avisa por
       modal que primero hay que emitirla. */
    if (!fuente.pdf) {
      setAvisoNoEmitido(true)
      return
    }
    /* Antes de tocar la API: si alguno de los elegidos no tiene por dónde recibirlo con el medio
       actual, no se manda nada. Que la mitad de la lista quede afuera en silencio es peor que
       frenar y decir quién falta. */
    if (frenarPorContactoSinVia()) return
    // El envío al proveedor es una salida del sistema: no sale nada de un proveedor bloqueado.
    if (fuente.validarCredito && bloqueo.frenar()) return
    void despachar(fuente.pdf)
  }

  /**
   * Manda el PDF emitido por el escenario de Make.com y espera su respuesta. Enviado, la bandera
   * global queda arriba y se le avisa a la vista para que registre la orden en Monday.
   */
  const despachar = async (pdf: File) => {
    setEstadoEnvio('enviando')
    dispatch({ type: 'setLog', entries: null })
    const resultado = await fuente.enviar({ pdf, contactos, medio: medioEnvio, casilla })
    if (!activo.current) return
    if (!resultado.ok) {
      setEstadoEnvio('error')
      dispatch({
        type: 'setLog',
        entries: [
          {
            id: 'envio-err',
            tipo: 'err',
            titulo: textos.errorTitulo,
            detalle: `${resultado.mensaje} Reintentá cuando esté resuelto.`,
          },
        ],
      })
      return
    }
    setEstadoEnvio('enviado')
    dispatch({ type: 'setDocumentoEnviado', value: true })
    dispatch({
      type: 'setLog',
      entries: [
        {
          id: 'envio-ok',
          tipo: 'ok',
          titulo: textos.enviadoTitulo,
          detalle: `Salió desde ${casilla} a ${contactos.length} contacto${contactos.length === 1 ? '' : 's'}.`,
        },
        /* Envío parcial: la orden ya le llegó a alguien, así que se da por enviada (reintentar se la
           mandaría dos veces a los que sí la recibieron), pero se dice a quién no le llegó. */
        ...(resultado.aviso
          ? [{ id: 'envio-parcial', tipo: 'info' as const, titulo: 'Envío parcial', detalle: resultado.aviso }]
          : []),
      ],
    })
    // "Enviado": la vista registra la orden en Monday.
    onEnviado?.(new Date())
  }

  return (
    <div className="card card--neutral card--flush">
      {/* El envío es obligatorio post-emisión: la card queda SIEMPRE abierta y fija (sin pregunta
          "¿Desea enviar?" ni toggle SI/NO). Con el envío YA hecho nunca se tapa el bloque: el
          "Enviado exitosamente" tiene que seguir a la vista aunque se vuelva a entrar a la etapa. */}
      {cargando && !enviadoOk ? (
        <div className="contactos-cargando">
          <i className="fas fa-spinner fa-spin" /> {textos.cargando}
        </div>
      ) : sinContactos && !enviadoOk ? (
        /* Sin contactos en el tablero no hay a quién enviarle: se explica y no se ofrece envío. */
        <div className="envio-sin-contactos" role="alert">
          <i className="fas fa-triangle-exclamation" />
          <div>
            <div className="envio-sin-contactos-t">{textos.sinContactosTitulo}</div>
            <p>
              {fuenteExterna ? (
                textos.sinContactosTexto
              ) : (
                <>
                  {proveedor?.name ? <strong>{proveedor.name}</strong> : 'Este proveedor'} {textos.sinContactosTexto}
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* El medio no se elige: la orden sale siempre por Email. Se muestra fijo para que se sepa
              por dónde sale. */}
          <div className="igp">
            <div className="envio-medio-linea">
              <span className="envio-medio-lbl">Medio de Envío por defecto:</span>
              <div className="envio-medio-fijo">
                <i className="fas fa-envelope" aria-hidden="true" /> Email
              </div>
            </div>
          </div>

          <ContactosPicker disponibles={disponibles} />

          <div className="font-b" style={{ fontSize: 14, marginTop: 24 }}>
            Contactos seleccionados ({contactos.length})
          </div>
          <div className="selc">
            {contactos.map((c) => {
              const falta = faltaParaMedio(c, medioEnvio)
              /* Sólo se marca al contacto que NO tiene por dónde recibirlo. Con "Ambos", que le
                 falte uno de los dos datos no es un problema: se envía por el que tenga. */
              const incompleto = sinViaDeEnvio(c, medioEnvio)
              /* Rojo únicamente cuando el envío no puede llegarle. Si sigue siendo alcanzable por
                 el otro canal, el dato ausente se informa en gris oscuro: no es un error. */
              const claseFalta = incompleto ? 'citem-sub--falta' : 'citem-sub--aviso'
              return (
                <div className={`citem ${incompleto ? 'citem--sin-dato' : ''}`} key={c.id}>
                  <div className="cinfo">
                    <div className="cava" style={{ background: c.color }}>
                      {c.ini}
                    </div>
                    <div>
                      <div className="citem-name">{c.name}</div>
                      {/* Falta el dato del medio elegido: se avisa acá, en rojo o en gris oscuro
                          según si el contacto queda o no sin vía de envío. */}
                      <div className={`citem-sub ${falta.telefono ? claseFalta : ''}`}>
                        {falta.telefono ? 'SIN TELEFONO' : c.phone}
                      </div>
                      <div className={`citem-sub ${falta.email ? claseFalta : ''}`}>
                        {falta.email ? 'SIN EMAIL' : c.email}
                      </div>
                    </div>
                  </div>
                  <div className="citem-right">
                    {/* Editar el email del contacto y si acepta la orden de compra, en Monday. Con el
                        envío en curso o hecho no se toca: cambiaría a quién se le mandó. */}
                    {fuente.editables && !enviando && !enviadoOk && c.itemId && (
                      <button type="button" className="citem-editar" onClick={() => setEditando(c)}>
                        Editar
                      </button>
                    )}
                    {/* El color del badge ya dice si acepta o no: no hace falta rótulo ni ícono. */}
                    <span className={`cbadge ${c.ok ? 'ok' : 'no'}`}>{c.status}</span>
                    <button
                      type="button"
                      className="del"
                      aria-label={`Quitar ${c.name}`}
                      onClick={() => {
                        // Quitar al contacto en falta es justamente cómo se destraba el envío.
                        limpiarIntento()
                        dispatch({ type: 'removeContacto', id: c.id })
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* El botón dice EN QUÉ estado está (idle / enviando / enviado / error) y el detalle va a
              su derecha: qué salió mal y qué hacer. */}
          <div className="enviar-row">
            <button
              type="button"
              className="btn-block btn-block--enviar"
              /* El `opacity: 1` del éxito NO es decorativo: enviado el botón queda `disabled`, y
                 `.btn-block:disabled` lo baja al 50%, que dejaba este verde lavado al lado del
                 "Orden emitida" —el mismo `var(--green)`, en un botón que no se atenúa—. Acá el
                 gris no significa "no disponible" sino "listo", así que se pisa. En los otros
                 estados apagados (sin contactos, enviando) el 50% sí corresponde y se deja. */
              style={{
                background: enviadoOk
                  ? 'var(--green)'
                  : estadoEnvio === 'error'
                    ? 'var(--red)'
                    : 'var(--primary-blue)',
                ...(enviadoOk ? { opacity: 1 } : {}),
              }}
              disabled={contactos.length === 0 || enviando || enviadoOk}
              aria-busy={enviando}
              onClick={confirmar}
            >
              {enviando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando...
                </>
              ) : enviadoOk ? (
                <>
                  <i className="fas fa-check" /> Enviado exitosamente
                </>
              ) : estadoEnvio === 'error' ? (
                <>
                  <i className="fas fa-xmark" /> Error de Envío
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane" /> Confirmar y Enviar
                </>
              )}
            </button>

            {/* Detalle de lo último que pasó. `role="status"` y no `alert`: acompaña a una acción
                que el usuario acaba de hacer, no interrumpe. */}
            {log && log.length > 0 && (
              <div className="enviar-avisos" role="status" aria-live="polite">
                {log.map((e) => (
                  <p key={e.id} className={`enviar-aviso enviar-aviso--${e.tipo}`}>
                    <i className={`fas ${ICONO_LOG[e.tipo]}`} aria-hidden="true" />
                    <span>
                      <strong>{e.titulo}.</strong> {e.detalle}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {bloqueo.modal}

      {editando && proveedor && (
        <EditarContactoModal
          contacto={editando}
          proveedorId={proveedor.id}
          onClose={() => setEditando(null)}
          onGuardado={(actualizado) => {
            // Lo que se editó puede ser justo lo que frenaba el envío: el aviso viejo ya no aplica.
            limpiarIntento()
            dispatch({ type: 'actualizarContacto', contacto: actualizado })
            setDisponibles((cs) => cs.map((c) => (c.id === actualizado.id ? actualizado : c)))
            setEditando(null)
          }}
        />
      )}

      {/* Aviso al intentar enviar sin haber emitido la orden. */}
      {avisoNoEmitido && (
        <AvisoModal titulo={textos.noEmitidoTitulo} onClose={() => setAvisoNoEmitido(false)}>
          {textos.noEmitidoTexto}
        </AvisoModal>
      )}

    </div>
  )
}
