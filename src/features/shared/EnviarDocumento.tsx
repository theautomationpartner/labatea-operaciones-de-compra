import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ContactosPicker } from '@/features/shared/ContactosPicker'
import { useBloqueoCredito } from '@/features/shared/useBloqueoCredito'
import {
  contactosSinVia,
  faltaParaMedio,
  msgContactoSinVia,
  sinViaDeEnvio,
} from '@/lib/validaciones'
import { DOCUMENTO_ORDEN_COMPRA, getContactosProveedor } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Contacto, LogEntry, MedioEnvio } from '@/types'

const MEDIOS: readonly MedioEnvio[] = ['Email', 'WhatsApp', 'Ambos']

/** Ícono de cada tipo de aviso del envío, al lado de su detalle. */
const ICONO_LOG: Record<LogEntry['tipo'], string> = {
  ok: 'fa-circle-check',
  err: 'fa-circle-exclamation',
  info: 'fa-circle-info',
}

/**
 * Un <option> nativo sólo admite texto, así que el ícono va como emoji.
 * 'Ambos' no tiene app propia: lleva el sobre y el chat juntos.
 */
const ICONO_MEDIO: Record<MedioEnvio, string> = {
  Email: '📧',
  WhatsApp: '💬',
  Ambos: '📧💬',
}

/** Estado del envío, que se muestra como una sola línea dentro de la card. */
type EstadoEnvio = 'idle' | 'enviando' | 'enviado' | 'error'

/**
 * Envío de la orden de compra a los contactos del proveedor.
 *
 * Es el MISMO componente que el de la app de ventas —mismo layout, mismos estados del botón,
 * mismas validaciones y mismos textos—, con dos simplificaciones que vienen del dominio: acá hay
 * UN solo comprobante (así que no existe el catálogo `comprobantesEnviables` que allá elige entre
 * cuatro) y los contactos son los del proveedor.
 *
 * ── PENDIENTE · el envío todavía no se dispara ──
 * El tablero "🛒 Orden Compra" no tiene dónde guardar los destinatarios (no hay relación al board
 * de Contactos) ni el medio elegido (no hay dropdown Email/WhatsApp). Sin esas dos columnas, poner
 * su "🤖Medio de Envío" en "Enviar" largaría una automatización que no sabe a quién escribirle.
 * Mandar a ciegas es peor que no mandar, así que el botón arma todo y frena con una explicación.
 * Cuando las columnas existan, se completa `despachar()` y se saca el freno.
 */
export function EnviarDocumento() {
  const { medioEnvio, contactos, proveedor, documentoEmitido, documentoEnviado, log } = useApp()
  const dispatch = useDispatch()
  // Aviso al intentar enviar sin haber emitido la orden todavía.
  const [avisoNoEmitido, setAvisoNoEmitido] = useState(false)
  // Aviso de las columnas que le faltan al tablero para poder despachar.
  const [avisoSinColumnas, setAvisoSinColumnas] = useState(false)
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
  const [cargando, setCargando] = useState(false)
  // Si el proveedor no tiene ningún contacto en el tablero, el envío no es posible.
  const [sinContactos, setSinContactos] = useState(false)
  /* La selección elegida vive en el estado global y sobrevive a la navegación. Se lee por ref para
     no meterla en las deps del efecto (la pisaría en cada cambio). */
  const contactosRef = useRef(contactos)
  contactosRef.current = contactos
  useEffect(() => {
    if (!proveedor) {
      setDisponibles([])
      return
    }
    let vivo = true
    setCargando(true)
    /* La consulta está CACHEADA por proveedor: al volver a esta etapa con el stepper resuelve al
       instante y no se le pega de nuevo a Monday ni parpadea el "Cargando contactos…". */
    getContactosProveedor(proveedor.id)
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
        dispatch({ type: 'errorMonday', accion: 'traer los contactos del proveedor' })
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [proveedor, dispatch])

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
    if (!documentoEmitido) {
      setAvisoNoEmitido(true)
      return
    }
    /* Antes de tocar la API: si alguno de los elegidos no tiene por dónde recibirlo con el medio
       actual, no se manda nada. Que la mitad de la lista quede afuera en silencio es peor que
       frenar y decir quién falta. */
    if (frenarPorContactoSinVia()) return
    // El envío es una salida del sistema: no sale nada de un proveedor bloqueado.
    if (bloqueo.frenar()) return
    /* Última parada: el tablero todavía no puede recibir ni los destinatarios ni el medio. Ver la
       nota del encabezado del archivo. */
    setAvisoSinColumnas(true)
  }

  return (
    <div className="card card--neutral card--flush">
      {/* El envío es obligatorio post-emisión: la card queda SIEMPRE abierta y fija (sin pregunta
          "¿Desea enviar?" ni toggle SI/NO). Con el envío YA hecho nunca se tapa el bloque: el
          "Enviado exitosamente" tiene que seguir a la vista aunque se vuelva a entrar a la etapa. */}
      {cargando && !enviadoOk ? (
        <div className="contactos-cargando">
          <i className="fas fa-spinner fa-spin" /> Cargando contactos del proveedor…
        </div>
      ) : sinContactos && !enviadoOk ? (
        /* Sin contactos en el tablero no hay a quién enviarle: se explica y no se ofrece envío. */
        <div className="envio-sin-contactos" role="alert">
          <i className="fas fa-triangle-exclamation" />
          <div>
            <div className="envio-sin-contactos-t">El proveedor no tiene contactos asignados</div>
            <p>
              {proveedor?.name ? <strong>{proveedor.name}</strong> : 'Este proveedor'} no tiene
              contactos cargados en el tablero de Contactos, así que no es posible realizar el
              envío. Asignale al menos un contacto y volvé a reintentar.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="igp">
            <label htmlFor="medio">Medio de envío *</label>
            <select
              id="medio"
              className="full w-medio"
              style={{ cursor: 'pointer' }}
              value={medioEnvio}
              onChange={(e) => {
                /* Cambiar el medio puede resolver el problema —o crear otro—: en los dos casos el
                   aviso anterior ya no aplica. */
                limpiarIntento()
                dispatch({ type: 'setMedioEnvio', value: e.target.value as MedioEnvio })
              }}
            >
              {/* El value queda limpio: el emoji es sólo la etiqueta. */}
              {MEDIOS.map((m) => (
                <option key={m} value={m}>
                  {ICONO_MEDIO[m]} {m}
                </option>
              ))}
            </select>
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

      {/* Aviso al intentar enviar sin haber emitido la orden. */}
      {avisoNoEmitido && (
        <AvisoModal titulo="Falta emitir el comprobante" onClose={() => setAvisoNoEmitido(false)}>
          No es posible realizar el envío. Primero debe emitir la orden de compra para poder
          enviarla.
        </AvisoModal>
      )}

      {/* El tablero todavía no puede registrar el envío. Se dice qué falta y dónde. */}
      {avisoSinColumnas && (
        <AvisoModal
          titulo="El tablero todavía no puede registrar el envío"
          faltantes={[
            'Una columna de conexión al tablero "Contactos" (18420688239), para los destinatarios',
            'Una columna desplegable con las opciones Email y WhatsApp, para el medio',
            `La etiqueta "${DOCUMENTO_ORDEN_COMPRA}" en la columna "✋Para Enviar" del tablero de Contactos`,
          ]}
          onClose={() => setAvisoSinColumnas(false)}
        >
          La orden ya está emitida y los destinatarios están elegidos, pero el tablero{' '}
          <strong>🛒 Orden Compra</strong> no tiene dónde guardarlos. Disparar el envío igual
          largaría la automatización sin saber a quién escribirle, así que se frena acá. Falta
          crear en Monday:
        </AvisoModal>
      )}
    </div>
  )
}
