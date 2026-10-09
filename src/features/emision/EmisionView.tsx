import { useEffect, useMemo, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { EnviarDocumento } from '@/features/shared/EnviarDocumento'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useBloqueoCredito } from '@/features/shared/useBloqueoCredito'
import { resumenCompra } from '@/lib/compras'
import { fechaHoyAR, fechaRecepcionEstimada, filasOrden } from '@/lib/ordenDoc'
import { indiceDePaso, pasosDe } from '@/lib/pasos'
import { casillaDeEnvio } from '@/lib/permisos'
import { armarPendientes, getProximoNroOrden, registrarOrdenCompra } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { OrdenCompraAGenerar } from './OrdenCompraAGenerar'
import { LOGO_DOCUMENTOS } from './pdf/comun'
import { generarOrdenCompraPdf } from './pdf/generarOrdenCompraPdf'
import { ResumenEmision } from './ResumenEmision'
import { VerOcEmitida } from './VerOcEmitida'

/**
 * Estado de la emisión: idle → generando (la app arma el PDF) → listo.
 *   · 'error': algo que el usuario puede corregir (sin productos, sin número): modal.
 *   · 'error-pdf': react-pdf no pudo generar el documento. No es del usuario: el botón queda en rojo
 *     y se le pide contactar al soporte.
 */
type EstadoPdf = 'idle' | 'generando' | 'listo' | 'error' | 'error-pdf'

/**
 * Etapa 3 de la ORDEN DE COMPRA. Mismo circuito que el presupuesto de "Operaciones de venta", en
 * tres momentos separados:
 *   1. "EMITIR ORDEN DE COMPRA" genera el PDF EN LA APP, con la plantilla de la orden y las mismas
 *      filas de la card "Orden de Compra a generar". No toca Monday. "Ver OC emitida" lo abre.
 *   2. "Confirmar y Enviar" lo manda al proveedor (sólo con la orden emitida).
 *   3. Cuando el envío queda en "Enviado", la orden se REGISTRA sola en Monday: el ítem, todos sus
 *      subelementos en una sola solicitud y el PDF. Confirmado el registro, se disparan —a la vez y
 *      sin esperarlas— las consultas que crean los pendientes de recepción y de factura.
 */
export function EmisionView() {
  const {
    lineas,
    proveedor,
    comprador,
    contactos,
    medioEnvio,
    operacion,
    nroOrden,
    ordenPdf,
    documentoEmitido,
    documentoEnviado,
    ordenCompraId,
    ordenRegistrada,
  } = useApp()
  const dispatch = useDispatch()
  /* Éxito PERSISTENTE de la emisión: la bandera global sobrevive a la navegación con el stepper. */
  const emitido = documentoEmitido

  const resumen = useMemo(() => resumenCompra(lineas), [lineas])

  const [estado, setEstado] = useState<EstadoPdf>('idle')
  const [error, setError] = useState<string | null>(null)
  // Registro en Monday en curso: tapa la pantalla con la ventana de espera.
  const [registrando, setRegistrando] = useState(false)
  // El registro falló: se ofrece reintentarlo desde el pie.
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)
  // Si se sale del paso mientras se espera, no actualizamos estado desmontado.
  const activo = useRef(true)
  useEffect(() => {
    activo.current = true
    return () => {
      activo.current = false
    }
  }, [])

  /* El número de la orden: el próximo "🤖ID Compra" del tablero. Se lee al entrar a la etapa, así el
     resumen lo muestra y el PDF lo imprime. Si falla, se reintenta al emitir. */
  useEffect(() => {
    if (nroOrden) return
    getProximoNroOrden()
      .then((nro) => nro && dispatch({ type: 'setNroOrden', value: nro }))
      .catch(() => {})
  }, [nroOrden, dispatch])

  /* La emisión es una salida del sistema: no sale nada de un proveedor bloqueado ni de una orden
     que se pasa de su línea de crédito. */
  const bloqueo = useBloqueoCredito(resumen.total)

  const indice = indiceDePaso('emision', operacion)

  /**
   * "EMITIR ORDEN DE COMPRA": genera el PDF con lo que muestra la card. NO escribe en Monday, así
   * que se puede emitir —y volver a emitir para corregir algo— sin dejar nada a medias en el tablero.
   */
  const generar = async () => {
    if (!proveedor || estado === 'generando' || documentoEnviado) return
    if (bloqueo.frenar()) return
    if (lineas.length === 0) {
      setError('Agregá al menos un producto antes de emitir la orden de compra.')
      setEstado('error')
      return
    }
    setEstado('generando')
    setError(null)
    try {
      let numero = nroOrden
      if (!numero) {
        numero = await getProximoNroOrden()
        if (numero) dispatch({ type: 'setNroOrden', value: numero })
      }
      if (!numero) {
        if (!activo.current) return
        setError('No se pudo calcular el número de la orden de compra. Revisá la conexión con Monday y reintentá.')
        setEstado('error')
        return
      }
      const archivo = await generarOrdenCompraPdf({
        numero,
        proveedor: { name: proveedor.name, addr: proveedor.addr },
        filas: filasOrden(lineas),
        total: resumen.total,
        logoSrc: LOGO_DOCUMENTOS,
      })
      if (!activo.current) return
      // Queda emitida: la bandera global persiste al navegar con el stepper.
      dispatch({ type: 'setOrdenPdf', value: archivo })
      setEstado('listo')
    } catch (e) {
      if (!activo.current) return
      console.error('No se pudo generar el PDF de la orden de compra', e)
      setEstado('error-pdf')
    }
  }

  /**
   * Registro en Monday, disparado por el envío confirmado ("Enviado"). Las dos consultas de
   * pendientes se ARMAN antes de empezar —con todo lo que ya se sabe— y se disparan recién con el
   * registro confirmado: a la vez y sin esperarlas, para no frenar el cierre de la operación.
   */
  const registrar = async (enviadaEl: Date) => {
    if (!proveedor || !ordenPdf || !nroOrden || registrando || ordenRegistrada) return
    const pendientes = armarPendientes(proveedor, lineas)
    const fechaEmision = fechaHoyAR()
    setRegistrando(true)
    setErrorRegistro(null)
    try {
      const registrada = await registrarOrdenCompra({
        numero: nroOrden,
        fechaEmision,
        proveedor,
        lineas,
        comprador,
        contactos,
        medioEnvio,
        casillaEnvio: casillaDeEnvio(comprador),
        pdf: ordenPdf,
        enviadaEl,
        fechaRecepcionEstimada: fechaRecepcionEstimada(fechaEmision, proveedor.diasRecepcion),
      })
      if (!activo.current) return
      dispatch({ type: 'setOrdenCompraId', value: registrada.id })
      if (registrada.subitemsCreados !== lineas.length) {
        setRegistrando(false)
        setErrorRegistro(
          `La orden se registró pero quedó incompleta: entraron ${registrada.subitemsCreados} de ${lineas.length} productos. Revisala en Monday: los pendientes no se crearon.`,
        )
        return
      }
      dispatch({ type: 'setOrdenRegistrada', value: true })
      // Registrada: se disparan los pendientes de recepción y de factura, sin esperarlos.
      pendientes.disparar(registrada.id)
      setRegistrando(false)
    } catch {
      if (!activo.current) return
      setRegistrando(false)
      setErrorRegistro(
        'No se pudo registrar la orden de compra en Monday. Ya se envió al proveedor: reintentá el registro.',
      )
      dispatch({ type: 'errorMonday', accion: 'registrar la orden de compra' })
    }
  }

  if (!proveedor) return null

  /* Reintentar el registro sólo tiene sentido si no se llegó a crear el ítem: si ya existe, volver a
     registrar duplicaría la orden en el tablero. */
  const puedeReintentar = documentoEnviado && !ordenRegistrada && !ordenCompraId && !registrando

  return (
    <section className="view emision-v2 paso-layout">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <PasoTitulo
        numero={indice + 1}
        titulo="Emitir y enviar orden de compra"
        descripcion="Revisá el resumen, emití la orden y mandásela a los contactos del proveedor."
      />

      {/* Izquierda: el resumen con el botón de emisión. Derecha: la orden en un desplegable y,
          debajo, el envío. */}
      <div className="emision-grid">
        <div className="emision-col">
          <ResumenEmision
            resumen={resumen}
            generando={estado === 'generando'}
            emitido={emitido}
            errorPdf={estado === 'error-pdf'}
            enviado={documentoEnviado}
            onGenerar={() => void generar()}
          >
            {/* Siempre debajo de emitir: se habilita con el PDF generado. */}
            <VerOcEmitida archivo={ordenPdf} />
            {estado === 'error-pdf' && (
              <div className="pres-pdf-aviso" role="alert">
                <i className="fas fa-circle-exclamation" /> La app no está pudiendo generar el PDF de la
                orden de compra. Tocá el botón para reintentar; si vuelve a fallar, contactate con el
                soporte de TAP.
              </div>
            )}
          </ResumenEmision>
        </div>

        {/* Bajo `.factura-v2` para reutilizar el desplegable de comprobantes (clases `comp-*` y sus
            variables); se neutraliza el box de página del namespace para que encaje en la columna. */}
        <div className="factura-v2" style={{ padding: 0, maxWidth: 'none', margin: 0 }}>
          <OrdenCompraAGenerar lineas={lineas} emitido={emitido} />
          <EnviarDocumento onEnviado={(cuando) => void registrar(cuando)} />
        </div>
      </div>

      <div className="footer-acts">
        <button
          type="button"
          className="btn-volver"
          onClick={() => dispatch({ type: 'goto', paso: 'productos' })}
        >
          <i className="fas fa-arrow-left" /> Volver
        </button>
        <div className="actions-right">
          {puedeReintentar && (
            <button type="button" className="btn btn-out" onClick={() => void registrar(new Date())}>
              <i className="fas fa-rotate" /> Reintentar registro
            </button>
          )}
          {/* Cierra la operación y reinicia la app: con la orden ya registrada en Monday. */}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ordenRegistrada}
            title={
              ordenRegistrada
                ? undefined
                : 'Emití y enviá la orden de compra: al enviarse se registra en el sistema.'
            }
            onClick={() => dispatch({ type: 'reset' })}
          >
            <i className="fas fa-flag-checkered" /> Finalizar Operación
          </button>
        </div>
      </div>

      {/* Tapa la pantalla mientras se registra en Monday. */}
      {registrando && (
        <ModalCargando
          titulo="Registrando orden de compra en el sistema..."
          detalle="Estamos registrando la orden de compra junto a sus productos y su PDF. Esperá unos segundos."
        />
      )}

      {errorRegistro && (
        <AvisoModal titulo="No se pudo completar el registro" onClose={() => setErrorRegistro(null)}>
          {errorRegistro}
        </AvisoModal>
      )}

      {estado === 'error' && error && (
        <AvisoModal
          titulo="No se pudo emitir la orden de compra"
          onClose={() => {
            setError(null)
            setEstado('idle')
          }}
        >
          {error}
        </AvisoModal>
      )}

      {bloqueo.modal}
    </section>
  )
}
