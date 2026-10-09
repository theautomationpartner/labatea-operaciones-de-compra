import { useCallback, useEffect, useState } from 'react'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { ETAPA, indiceDePaso, pasosDe } from '@/lib/pasos'
import { puedeHacerExcepciones } from '@/lib/permisos'
import type { ActualizacionHecha, ProductoPrecio } from '@/lib/precios'
import { aplicarActualizacion, getProductosDeProveedor } from '@/services/monday/precios'
import { useApp, useDispatch } from '@/state/hooks'
import { ModoExcel } from './ModoExcel'
import { ModoPorcentaje } from './ModoPorcentaje'
import { OperacionFinalizada } from '@/components/ui/OperacionFinalizada'
import type { Confirmar } from './ResultadoPrecios'
import { useBorradorPrecios } from './useBorradorPrecios'

type Modo = 'porcentaje' | 'excel'

const MODOS: { modo: Modo; titulo: string; icono: string }[] = [
  { modo: 'porcentaje', titulo: 'ACTUALIZAR POR PORCENTAJE A TODA LA LISTA', icono: 'fa-percent' },
  { modo: 'excel', titulo: 'CARGAR EXCEL', icono: 'fa-file-excel' },
]

/**
 * Etapa 2 de ACTUALIZAR PRECIOS: cómo se actualiza la lista del proveedor elegido en la etapa 1.
 *
 *   · ACTUALIZAR POR PORCENTAJE A TODA LA LISTA: el mismo % sobre todo su catálogo (`ModoPorcentaje`).
 *   · CARGAR EXCEL: la lista del proveedor, analizada con IA contra el Maestro (`ModoExcel`).
 *
 * Los productos del proveedor se leen una vez y los usan las dos formas. Las dos cierran igual:
 * `aplicarActualizacion` escribe los costos en el Maestro (en mutations masivas) y deja la actividad
 * "Actualización de precio" en cada producto. Al terminar se avisa y se pasa sola a "Comprobante y
 * Envío"; "Continuar" lleva ahí también a mano, después de volver con el stepper.
 *
 * Todo lo cargado en la etapa vive en el borrador global (`useBorradorPrecios`): ir y volver por el
 * stepper no lo pierde. Sólo para Compras y Administración.
 */
export function PreciosView() {
  const { usuarioActual, proveedor, operacion, actualizacionPrecios } = useApp()
  const dispatch = useDispatch()
  const [modo, setModo] = useBorradorPrecios<Modo | null>('modo', null)
  /* Los productos tal como estaban al cargar la etapa: después de aplicar, la tabla sigue mostrando
     de cuánto a cuánto cambió cada uno. Se vuelven a leer en una actualización nueva. */
  const [productos, setProductos] = useBorradorPrecios<ProductoPrecio[] | null>('productos', null)
  /** Esta actualización ya se escribió en Monday: la etapa queda de consulta. */
  const aplicada = actualizacionPrecios !== null
  /** La actualización recién terminada: mientras tiene valor, se ve el aviso de fin. */
  const [finalizada, setFinalizada] = useState<ActualizacionHecha | null>(null)
  /**
   * Se está procesando una lista o escribiendo en Monday: mientras dura no se puede cambiar el tipo
   * de actualización, volver de etapa ni cambiar de operación (los dos últimos viven en el
   * encabezado: van por el estado).
   */
  const [procesando, setProcesando] = useState(false)
  useEffect(() => {
    dispatch({ type: 'setNavegacionBloqueada', value: procesando })
  }, [procesando, dispatch])
  useEffect(() => () => dispatch({ type: 'setNavegacionBloqueada', value: false }), [dispatch])

  const yaLeidos = productos !== null
  useEffect(() => {
    if (!proveedor || yaLeidos) return
    let vivo = true
    getProductosDeProveedor(proveedor.id)
      .then((ps) => vivo && setProductos(ps))
      .catch(() => vivo && dispatch({ type: 'errorMonday', accion: 'leer los productos del proveedor' }))
    return () => {
      vivo = false
    }
  }, [proveedor, yaLeidos, setProductos, dispatch])

  const confirmar: Confirmar = useCallback(
    async ({ productos: actualizados, ...datos }, onAvance) => {
      if (!proveedor) return false
      const usuario = usuarioActual ? { id: usuarioActual.id, name: usuarioActual.name } : null
      try {
        const r = await aplicarActualizacion(
          { ...datos, proveedor: { id: proveedor.id, name: proveedor.name }, usuario },
          onAvance,
        )
        const hecha: ActualizacionHecha = {
          tipo: datos.tipo,
          fecha: r.fecha.toISOString(),
          proveedor: { id: proveedor.id, name: proveedor.name, codigo: proveedor.codigo },
          usuario,
          porcentaje: datos.porcentaje,
          archivo: datos.archivo?.name ?? null,
          productos: actualizados,
          actualizados: r.actualizados,
          avisos: r.avisos,
        }
        dispatch({ type: 'setActualizacionPrecios', value: hecha })
        setFinalizada(hecha)
        return true
      } catch {
        dispatch({ type: 'errorMonday', accion: 'actualizar los costos de los productos' })
        return false
      }
    },
    [proveedor, usuarioActual, dispatch],
  )

  /* Del aviso de fin, al comprobante. */
  const alComprobante = useCallback(() => {
    setFinalizada(null)
    dispatch({ type: 'goto', paso: 'preciosComprobante' })
  }, [dispatch])

  const indice = indiceDePaso('precios', operacion)

  if (!puedeHacerExcepciones(usuarioActual)) {
    return (
      <section className="view paso-layout precios-v">
        <PasoHeader pasos={pasosDe(operacion)} actual={indice} />
        <div className="card precios-sin-permiso">
          <i className="fas fa-lock" /> La actualización de precios es sólo para los equipos{' '}
          <strong>Compras</strong> y <strong>Administradores</strong>.
        </div>
      </section>
    )
  }

  // Sin proveedor no hay etapa 2: el stepper sólo deja llegar acá desde la etapa 1.
  if (!proveedor) return null

  const elegido = MODOS.find((m) => m.modo === modo)

  return (
    <section className="view paso-layout precios-v">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <div className="paso-body">
        <PasoTitulo
          numero={indice + 1}
          titulo={ETAPA.precios}
          descripcion={
            <>
              Elegí cómo vas a actualizar la lista de precios de <strong>{proveedor.name}</strong>: con un porcentaje
              sobre toda la lista o cargando el Excel que mandó el proveedor.
            </>
          }
        />

        {/* El selector es la caja de configuración de "Tipo de venta / Tipo de entrega" de la VENTA
            (operaciones-de-venta, `VentaConfig`): ícono en círculo, rótulo chico y `select` nativo. */}
        <div className="precios-modo">
          <div className="cfgbox precios-cfg">
            <div className="cfg-ic">
              <i className={`fas ${elegido?.icono ?? 'fa-sliders'}`} />
            </div>
            <div className="cfg-c">
              <label className="cfg-l" htmlFor="precios-modo">
                Tipo de actualización
              </label>
              <select
                id="precios-modo"
                className={`cfg-sel ${modo ? '' : 'cfg-sel--ph'}`}
                value={modo ?? ''}
                disabled={procesando || aplicada}
                onChange={(e) => setModo(e.target.value as Modo)}
              >
                <option value="" disabled>
                  Seleccionar...
                </option>
                {MODOS.map((m) => (
                  <option key={m.modo} value={m.modo}>
                    {m.titulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {aplicada && (
          <p className="precios-aplicada" role="status">
            <i className="fas fa-circle-check" /> Esta actualización ya se aplicó en Monday. Para hacer otra, usá{' '}
            <strong>Nueva actualización</strong> en {ETAPA.comprobantePrecios}.
          </p>
        )}

        {/* Cada forma guarda lo suyo en el borrador: lo cargado en una no se mezcla con la otra. */}
        {modo === 'porcentaje' && (
          <ModoPorcentaje
            proveedor={proveedor}
            productos={productos}
            confirmar={confirmar}
            aplicada={aplicada}
            onProcesando={setProcesando}
          />
        )}
        {modo === 'excel' && (
          <ModoExcel
            proveedor={proveedor}
            productos={productos}
            confirmar={confirmar}
            aplicada={aplicada}
            onProcesando={setProcesando}
          />
        )}

        <footer className="page-footer">
          <button
            type="button"
            className="btn-volver"
            disabled={procesando}
            title={procesando ? 'Esperá a que termine el análisis de la lista' : undefined}
            onClick={() => dispatch({ type: 'goto', paso: 'proveedor' })}
          >
            <i className="fas fa-arrow-left" /> Volver
          </button>
          {/* Además del paso automático al terminar: para volver a la última etapa después de
              retroceder con el stepper. */}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!aplicada || procesando}
            title={aplicada ? undefined : 'Se habilita cuando la actualización se aplica en Monday'}
            onClick={() => dispatch({ type: 'goto', paso: 'preciosComprobante' })}
          >
            Continuar a {ETAPA.comprobantePrecios} <i className="fas fa-arrow-right" />
          </button>
        </footer>
      </div>

      {/* Monday ya quedó actualizado: el tilde verde y, sola, a la última etapa. Lo que haya quedado a
          medias se ve en el resumen de esa etapa. */}
      {finalizada && <OperacionFinalizada texto="Actualización finalizada" onFin={alComprobante} />}
    </section>
  )
}
