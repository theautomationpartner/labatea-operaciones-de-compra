import { useEffect, useMemo, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EnviarDocumento } from '@/features/shared/EnviarDocumento'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useBloqueoCredito } from '@/features/shared/useBloqueoCredito'
import { resumenCompra } from '@/lib/compras'
import { indiceDePaso, pasosDe } from '@/lib/pasos'
import { crearOrdenCompra, emitirOrdenCompra, esperarOrdenCompraEmitida } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { OrdenCompraAGenerar } from './OrdenCompraAGenerar'
import { ResumenEmision } from './ResumenEmision'

/** Estado de la emisión: idle → generando (dispara el tablero) → listo, o error. */
type EstadoEmision = 'idle' | 'generando' | 'listo' | 'error'

/** Etapa 3 de la ORDEN DE COMPRA: revisión, emisión y envío al proveedor. */
export function EmisionView() {
  const { lineas, proveedor, comprador, contactos, medioEnvio, operacion, ordenCompraId, documentoEmitido } =
    useApp()
  const dispatch = useDispatch()
  /* Éxito PERSISTENTE de la emisión: la bandera global sobrevive a la navegación con el stepper,
     así el botón "Emitir Orden de Compra" no se reactiva al volver a esta etapa. */
  const emitido = documentoEmitido

  const resumen = useMemo(() => resumenCompra(lineas), [lineas])

  const [estado, setEstado] = useState<EstadoEmision>('idle')
  const [error, setError] = useState<string | null>(null)
  // Si se sale del paso mientras se espera la emisión, no actualizamos estado desmontado.
  const activo = useRef(true)
  useEffect(() => {
    activo.current = true
    return () => {
      activo.current = false
    }
  }, [])

  /* La emisión es una salida del sistema: no sale nada de un proveedor bloqueado ni de una orden
     que se pasa de su línea de crédito. */
  const bloqueo = useBloqueoCredito(resumen.total)

  const indice = indiceDePaso('emision', operacion)

  /**
   * "Emitir Orden de Compra" es el ÚNICO disparador de la creación en Monday (ejecución diferida):
   * a esta etapa se llega SIN ítem creado. Acá se crea el ítem con todos sus subelementos, se
   * `await`ea su confirmación, y recién entonces se pasa el estado a "Enviar" —lo que dispara la
   * generación del documento— y se espera el resultado.
   *
   * Un ítem ya creado (reintento tras un fallo) no se vuelve a crear.
   */
  const generar = async () => {
    if (!proveedor) return
    // Anti-duplicado: emitida con éxito, la acción se anula y NO se vuelve a crear el documento.
    if (documentoEmitido || estado === 'generando') return
    if (lineas.length === 0) {
      setError('Agregá al menos un producto antes de emitir la orden de compra.')
      setEstado('error')
      return
    }
    if (bloqueo.frenar()) return

    setEstado('generando')
    setError(null)
    try {
      /* La creación del ítem se difiere hasta acá: nace al emitir, no al entrar a la etapa. Se
         `await`ea y se corta si algún producto no entró. Idempotente: si ya existe, no se recrea. */
      let id = ordenCompraId
      if (!id) {
        const creado = await crearOrdenCompra({
          proveedor,
          lineas,
          comprador,
          /* Los destinatarios y el medio se registran en la orden desde su creación: para cuando
             se emite, la etapa ya los tiene elegidos (el bloque de envío los carga y preselecciona
             al montarse). */
          contactos,
          medioEnvio,
        })
        if (creado.subitemsCreados !== lineas.length) {
          setError(
            `La orden se creó pero quedó incompleta: entraron ${creado.subitemsCreados} de ${lineas.length} productos. Revisala en Monday antes de emitirla.`,
          )
          setEstado('error')
          return
        }
        id = creado.id
        dispatch({ type: 'setOrdenCompraId', value: id })
      }
      await emitirOrdenCompra(id)
      const ok = await esperarOrdenCompraEmitida(id)
      if (!activo.current) return
      if (ok) {
        setEstado('listo')
        // Bandera GLOBAL de emisión exitosa: persiste al navegar con el stepper.
        dispatch({ type: 'setDocumentoEmitido', value: true })
      } else {
        setError(
          'La orden se creó en el tablero, pero su emisión está tardando más de lo esperado. Revisá el estado en Monday y reintentá en unos segundos.',
        )
        setEstado('error')
      }
    } catch {
      if (!activo.current) return
      /* Fallo de la API: lo comunica la ventana global de error de Monday. Acá sólo se libera el
         botón para poder reintentar; no se deja un mensaje propio. */
      setEstado('idle')
      dispatch({ type: 'errorMonday', accion: 'emitir la orden de compra' })
    }
  }

  if (!proveedor) return null

  return (
    <section className="view emision-v2 paso-layout">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <PasoTitulo
        numero={indice + 1}
        titulo="Emitir y enviar orden de compra"
        descripcion="Revisá el resumen, emití la orden y mandásela a los contactos del proveedor."
      />

      {/* Izquierda: el resumen con el botón de emisión. Derecha: la orden a registrar en un
          desplegable y, debajo, el envío. */}
      <div className="emision-grid">
        <div className="emision-col">
          <ResumenEmision
            resumen={resumen}
            generando={estado === 'generando'}
            emitido={emitido}
            onGenerar={generar}
          />
        </div>

        {/* Bajo `.factura-v2` para reutilizar el desplegable de comprobantes (clases `comp-*` y sus
            variables); se neutraliza el box de página del namespace para que encaje en la columna. */}
        <div className="factura-v2" style={{ padding: 0, maxWidth: 'none', margin: 0 }}>
          <OrdenCompraAGenerar lineas={lineas} emitido={emitido} />
          <EnviarDocumento />
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
        {/* Cierra la orden y reinicia la app. Alcanza con la orden EMITIDA: el envío al proveedor
            es una gestión aparte y puede quedar pendiente. */}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!emitido}
          title={emitido ? undefined : 'Emití la orden de compra para poder finalizar la operación.'}
          onClick={() => dispatch({ type: 'reset' })}
        >
          <i className="fas fa-flag-checkered" /> Finalizar Operación
        </button>
      </div>

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
