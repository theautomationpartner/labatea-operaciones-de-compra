import { useEffect, useMemo, useState } from 'react'
import { EnviarDocumento, type FuenteEnvio } from '@/features/shared/EnviarDocumento'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { ETAPA, indiceDePaso, pasosDe } from '@/lib/pasos'
import { enviarActualizacionCostosMake } from '@/services/make/envioOrdenCompra'
import { contactosEquipoInterno } from '@/services/monday/equipoInterno'
import { useApp, useDispatch } from '@/state/hooks'
import { generarActualizacionCostosPdf } from './pdf/generarActualizacionCostosPdf'
import { ResumenActualizacion } from './ResumenActualizacion'

const fechaAR = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Etapa 3 de ACTUALIZAR PRECIOS: el resumen de la actualización y su envío. Mismo armado que la
 * etapa de emisión de la orden de compra (`EmisionView`):
 *
 *   · Izquierda, la card de resumen, con un único botón: "Ver reporte de actualización". El reporte
 *     (React-PDF) se genera al entrar, en el navegador.
 *   · Derecha, el MISMO componente de envío de la orden de compra (`EnviarDocumento`), con otra
 *     fuente: el reporte, a los integrantes de Administración y Compras (emails de la Lista Blanca).
 */
export function ComprobantePreciosView() {
  const { actualizacionPrecios: a, operacion } = useApp()
  const dispatch = useDispatch()
  const [reporte, setReporte] = useState<File | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!a) return
    let vivo = true
    setError(false)
    setReporte(null)
    generarActualizacionCostosPdf(a)
      .then((archivo) => vivo && setReporte(archivo))
      .catch(() => vivo && setError(true))
    return () => {
      vivo = false
    }
  }, [a, intento])

  /* Qué envía el componente de envío: el reporte, al equipo interno, por el escenario de Make. */
  const fuente = useMemo<FuenteEnvio | null>(
    () =>
      a && {
        pdf: reporte,
        claveContactos: `equipo-interno-${a.fecha}`,
        cargarContactos: contactosEquipoInterno,
        enviar: ({ pdf, contactos, medio, casilla }) =>
          enviarActualizacionCostosMake({
            fecha: fechaAR(a.fecha),
            proveedor: a.proveedor,
            responsable: a.usuario,
            casilla,
            medio,
            contactos,
            productos: a.productos.length,
            pdf,
          }),
        textos: {
          cargando: 'Cargando Administración y Compras…',
          sinContactosTitulo: 'No hay destinatarios para el envío',
          sinContactosTexto:
            'Ningún integrante de los equipos Administradores y Compras tiene email en la Lista Blanca, así que no es posible realizar el envío.',
          noEmitidoTitulo: 'El reporte todavía no está listo',
          noEmitidoTexto: 'Esperá a que termine de generarse el reporte de la actualización para enviarlo.',
          errorTitulo: 'No se pudo enviar el reporte',
          enviadoTitulo: 'Reporte enviado',
        },
        editables: false,
        validarCredito: false,
      },
    [a, reporte],
  )

  const indice = indiceDePaso('preciosComprobante', operacion)

  return (
    <section className="view emision-v2 paso-layout">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <PasoTitulo
        numero={indice + 1}
        titulo={ETAPA.comprobantePrecios}
        descripcion="Revisá el resumen de la actualización de costos y mandale el reporte a Administración y Compras."
      />

      {!a || !fuente ? (
        <div className="card precios-sin-permiso">
          <i className="fas fa-circle-info" /> Todavía no se confirmó ninguna actualización de precios.
        </div>
      ) : (
        <div className="emision-grid">
          <div className="emision-col">
            <ResumenActualizacion
              actualizacion={a}
              reporte={reporte}
              errorReporte={error}
              onReintentar={() => setIntento((i) => i + 1)}
            />
          </div>

          {/* Bajo `.factura-v2`, igual que en la emisión: el envío usa sus clases y variables. */}
          <div className="factura-v2" style={{ padding: 0, maxWidth: 'none', margin: 0 }}>
            <EnviarDocumento fuente={fuente} />
          </div>
        </div>
      )}

      <div className="footer-acts">
        <button type="button" className="btn-volver" onClick={() => dispatch({ type: 'goto', paso: 'precios' })}>
          <i className="fas fa-arrow-left" /> Volver
        </button>
        <div className="actions-right">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              /* Una actualización nueva arranca de cero: se vuelven a leer los productos (con los
                 costos ya actualizados) y se descarta lo cargado en la anterior. */
              dispatch({ type: 'limpiarBorradorPrecios' })
              dispatch({ type: 'setActualizacionPrecios', value: null })
              dispatch({ type: 'goto', paso: 'precios' })
            }}
          >
            <i className="fas fa-rotate-right" /> Nueva actualización
          </button>
        </div>
      </div>
    </section>
  )
}
