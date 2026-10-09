import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { BarraProgreso } from '@/components/ui/BarraProgreso'
import { SoltarArchivo, type EstadoSoltar } from '@/components/ui/SoltarArchivo'
import { useProgreso, type Tramo } from '@/features/precios/useProgresoAnalisis'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { ETAPA, indiceDePaso, pasosDe } from '@/lib/pasos'
import { datosComprobanteVacios } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { DatosComprobante, TipoComprobante } from '@/types'
import { DatosComprobanteForm } from './DatosComprobanteForm'

/** Los comprobantes que se pueden cargar, en el orden del desplegable. */
const TIPOS: readonly TipoComprobante[] = ['Factura A', 'Factura C', 'Nota de Crédito A', 'Nota de Débito']

/** El comprobante llega como PDF o como foto. */
const ACEPTA = 'application/pdf,.pdf,image/*'

const TRAMOS: Record<'leyendo', Tramo> = {
  leyendo: { desde: 0, hasta: 99, tau: 1500, etiqueta: 'Leyendo los datos del comprobante…' },
}

/**
 * PENDIENTE DE DEFINICIÓN: lo que se dispara al cargar el comprobante (su lectura y de dónde salen
 * los datos). Por ahora sólo simula la espera, para ver la carga funcionando, y no completa nada.
 */
async function leerComprobante(_archivo: File, _tipo: TipoComprobante): Promise<Partial<DatosComprobante>> {
  await new Promise((r) => setTimeout(r, 2500))
  return {}
}

/**
 * Etapa 2 de CARGAR COMPROBANTE DE COMPRA: los datos iniciales del comprobante del proveedor.
 *
 * Es el formulario de la carga de la OP de HETMO (app de Polifroni), con el recuadro de arrastrar y
 * soltar del cobro CONTADO de La Batea:
 *  1. Arriba, a la izquierda, el TIPO de comprobante: obligatorio, y antes que el archivo.
 *  2. Debajo, el recuadro de arrastrar y soltar, con la barra de progreso de la lectura adentro.
 *  3. A la derecha, al cargar el archivo, los datos del comprobante: se completan solos y no se
 *     pueden editar mientras se lee.
 *
 * Lo cargado vive en el borrador global (`borradorComprobante`): ir y volver por el stepper no lo
 * pierde.
 */
export function CargarComprobanteView() {
  const { proveedor, operacion, borradorComprobante: borrador } = useApp()
  const dispatch = useDispatch()
  const progreso = useProgreso(TRAMOS, 'Lectura finalizada')
  const [leyendo, setLeyendo] = useState(false)
  const [errorLectura, setErrorLectura] = useState('')
  const [faltaTipo, setFaltaTipo] = useState(false)
  const [avisoTipo, setAvisoTipo] = useState(false)
  /** Cada lectura nueva invalida la anterior: si se reemplaza el archivo, la vieja no pisa nada. */
  const lectura = useRef(0)

  /* Mientras se lee no se puede cambiar de etapa ni de operación (eso vive en el encabezado). */
  useEffect(() => {
    dispatch({ type: 'setNavegacionBloqueada', value: leyendo })
  }, [leyendo, dispatch])
  useEffect(() => () => dispatch({ type: 'setNavegacionBloqueada', value: false }), [dispatch])

  const cambiar = (cambios: Partial<typeof borrador>) => dispatch({ type: 'setBorradorComprobante', cambios })

  const cargar = async (archivo: File) => {
    const tipo = borrador.tipo
    if (!tipo) {
      setFaltaTipo(true)
      setAvisoTipo(true)
      return
    }
    const n = ++lectura.current
    cambiar({ archivo, datos: datosComprobanteVacios() })
    setErrorLectura('')
    setLeyendo(true)
    progreso.reiniciar()
    progreso.avanzar('leyendo')
    try {
      const datos = await leerComprobante(archivo, tipo)
      if (n !== lectura.current) return
      cambiar({ datos: { ...datosComprobanteVacios(), ...datos } })
      progreso.avanzar('listo')
    } catch {
      if (n !== lectura.current) return
      setErrorLectura('No se pudo leer el comprobante. Probá de nuevo en unos segundos.')
      progreso.reiniciar()
    } finally {
      if (n === lectura.current) setLeyendo(false)
    }
  }

  const quitar = () => {
    lectura.current++
    cambiar({ archivo: null, datos: datosComprobanteVacios() })
    setErrorLectura('')
    progreso.reiniciar()
  }

  const indice = indiceDePaso('comprobante', operacion)

  // Sin proveedor no hay etapa 2: el stepper sólo deja llegar acá desde la etapa 1.
  if (!proveedor) return null

  const { tipo, archivo } = borrador
  const estado: EstadoSoltar = leyendo ? 'procesando' : errorLectura ? 'error' : archivo ? 'listo' : 'vacio'

  return (
    <section className="view paso-layout comprobante-v">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <div className="paso-body">
        <PasoTitulo
          numero={indice + 1}
          titulo={ETAPA.datosIniciales}
          descripcion={
            <>
              Elegí el tipo de comprobante y cargá el que emitió <strong>{proveedor.name}</strong>: sus datos se
              completan solos.
            </>
          }
        />

        <div className="comp-carga">
          <div className="comp-izq">
            {/* La caja de configuración de "Tipo de actualización" (ACTUALIZAR PRECIOS), con su
                `select` nativo. Es obligatoria: sin tipo no se puede cargar el archivo. */}
            <div className={`cfgbox comp-tipo ${faltaTipo && !tipo ? 'comp-tipo--falta' : ''}`}>
              <div className="cfg-ic">
                <i className="fas fa-file-invoice" />
              </div>
              <div className="cfg-c">
                <label className="cfg-l" htmlFor="comp-tipo">
                  Tipo de Comprobante a Emitir <span className="comp-req">*</span>
                </label>
                <select
                  id="comp-tipo"
                  className={`cfg-sel ${tipo ? '' : 'cfg-sel--ph'}`}
                  value={tipo ?? ''}
                  required
                  aria-invalid={faltaTipo && !tipo}
                  disabled={leyendo}
                  onChange={(e) => cambiar({ tipo: e.target.value as TipoComprobante })}
                >
                  <option value="" disabled>
                    Seleccionar...
                  </option>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {faltaTipo && !tipo && (
              <p className="comp-reclamo" role="alert">
                <i className="fas fa-circle-exclamation" /> Elegí el tipo de comprobante antes de cargar el archivo.
              </p>
            )}

            <SoltarArchivo
              id="comprobante-compra"
              className="comp-soltar"
              archivo={archivo?.name ?? null}
              estado={estado}
              titulo={
                leyendo
                  ? 'Leyendo el comprobante…'
                  : errorLectura
                    ? 'No se pudo leer'
                    : archivo
                      ? `${tipo ?? 'Comprobante'} cargado`
                      : undefined
              }
              detalle={
                leyendo
                  ? 'Los datos aparecen a la derecha al terminar'
                  : errorLectura
                    ? errorLectura
                    : archivo
                      ? 'Revisá los datos de la derecha'
                      : tipo
                        ? `Soltá en este área la ${tipo.toLowerCase()} del proveedor (PDF o imagen), o hacé click para elegirla`
                        : 'Elegí primero el tipo de comprobante y después soltá el archivo (PDF o imagen) en este área'
              }
              onArchivo={(f) => void cargar(f)}
              onQuitar={archivo ? quitar : undefined}
              accion={archivo && errorLectura ? { texto: 'Reintentar', onClick: () => void cargar(archivo) } : undefined}
              accept={ACEPTA}
              formatos="PDF o imagen"
            >
              {/* La barra va DENTRO del recuadro mientras se lee y al terminar. Al volver a la etapa
                  con el comprobante ya leído, se la muestra completa. */}
              {progreso.etapa ? (
                <BarraProgreso valor={progreso.pct} etiqueta={progreso.etiqueta} completa={progreso.etapa === 'listo'} />
              ) : (
                archivo && !errorLectura && <BarraProgreso valor={100} completa etiqueta="Lectura finalizada" />
              )}
            </SoltarArchivo>
          </div>

          <DatosComprobanteForm
            datos={borrador.datos}
            hayArchivo={!!archivo}
            leyendo={leyendo}
            onCambio={(clave, valor) => cambiar({ datos: { ...borrador.datos, [clave]: valor } })}
          />
        </div>

        <footer className="page-footer">
          <button
            type="button"
            className="btn-volver"
            disabled={leyendo}
            title={leyendo ? 'Esperá a que termine la lectura del comprobante' : undefined}
            onClick={() => dispatch({ type: 'goto', paso: 'proveedor' })}
          >
            <i className="fas fa-arrow-left" /> Volver
          </button>
        </footer>
      </div>

      {avisoTipo && (
        <AvisoModal titulo="Falta el tipo de comprobante" onClose={() => setAvisoTipo(false)}>
          Antes de cargar el archivo elegí el <strong>Tipo de Comprobante a Emitir</strong>: Factura A,
          Factura C, Nota de Crédito A o Nota de Débito.
        </AvisoModal>
      )}
    </section>
  )
}
