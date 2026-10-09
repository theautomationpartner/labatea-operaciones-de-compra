import { useEffect, useMemo, useState } from 'react'
import { BarraProgreso } from '@/components/ui/BarraProgreso'
import { Modal } from '@/components/ui/Modal'
import { pctDec } from '@/lib/format'
import { cambio, numeroDeCelda } from '@/lib/listaExcel'
import type { ProductoPrecio } from '@/lib/precios'
import { getPendientesLiquidacion, type PendienteLiquidacion } from '@/services/monday/precios'
import { useApp, useDispatch } from '@/state/hooks'
import type { Proveedor } from '@/types'
import { DatosActualizacion, fechaHoraActualizacion } from './DatosActualizacion'
import { ModalLiquidacionPendiente } from './ModalLiquidacionPendiente'
import { BotonConfirmarActualizacion, type Confirmar } from './ResultadoPrecios'
import { TablaPrecios, type FilaPrecio } from './TablaPrecios'
import { useBorradorPrecios } from './useBorradorPrecios'
import { useProgresoEscritura } from './useProgresoAnalisis'

interface ModoPorcentajeProps {
  proveedor: Proveedor
  productos: readonly ProductoPrecio[] | null
  confirmar: Confirmar
  /** La actualización ya se escribió en Monday: no se puede volver a confirmar. */
  aplicada: boolean
  /** Avisa cuándo se está escribiendo en Monday: mientras dura, no se puede navegar. */
  onProcesando?: (procesando: boolean) => void
}

/** Un porcentaje válido para aplicar: distinto de cero y mayor a -100. */
const porcentajeDe = (texto: string): number | null => {
  const p = numeroDeCelda(texto.replace('%', ''))
  return p === null || p === 0 || p <= -100 ? null : p
}

/**
 * ACTUALIZAR POR PORCENTAJE A TODA LA LISTA: el mismo % sobre el costo unitario de todos los
 * productos del proveedor (positivo o negativo).
 *
 * Mismo bloque que "Cargar Excel": a la derecha los datos de la actualización (se completan solos)
 * con "Ver Actualización de Precios"; a la izquierda, en lugar del recuadro de carga, el porcentaje
 * y "Confirmar".
 *
 *   1. "Confirmar" valida que el proveedor no tenga ventas de consignación sin liquidar y abre la
 *      tabla "Productos a actualizar en el maestro" con los costos nuevos.
 *   2. "Confirmar Actualización" escribe en Monday; la barra de progreso, debajo del botón, sigue
 *      esa escritura con el dato real de cada tanda (costos y actividades, de a 50 por consulta).
 *      Al terminar, el aviso de fin y a la última etapa.
 *
 * Los productos sin costo cargado quedan afuera: un % de cero es cero.
 */
export function ModoPorcentaje({ proveedor, productos, confirmar, aplicada, onProcesando }: ModoPorcentajeProps) {
  const { usuarioActual } = useApp()
  const dispatch = useDispatch()
  /* El porcentaje vive en el borrador de la etapa: ir y volver por el stepper no lo pierde. */
  const [texto, setTexto] = useBorradorPrecios('porcentaje.texto', '')
  const [error, setError] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [pendientes, setPendientes] = useState<PendienteLiquidacion[] | null>(null)
  const [verTabla, setVerTabla] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const progreso = useProgresoEscritura()

  useEffect(() => {
    onProcesando?.(actualizando)
  }, [actualizando, onProcesando])
  useEffect(() => () => onProcesando?.(false), [onProcesando])

  const porcentaje = porcentajeDe(texto)
  const conCosto = useMemo(() => (productos ?? []).filter((p) => p.costo > 0), [productos])
  const sinCosto = (productos?.length ?? 0) - conCosto.length

  /* La vista previa: todos los productos, con el costo nuevo los que tienen costo (van primero). */
  const filas: FilaPrecio[] = useMemo(() => {
    if (!productos) return []
    if (porcentaje === null) return productos.map((p) => ({ producto: p, nuevo: null }))
    const nuevas = productos.map((p) => ({
      producto: p,
      nuevo: p.costo > 0 ? cambio(p, p.costo * (1 + porcentaje / 100)).nuevo : null,
    }))
    return [...nuevas.filter((f) => f.nuevo !== null), ...nuevas.filter((f) => f.nuevo === null)]
  }, [productos, porcentaje])

  const pedirConfirmacion = async () => {
    if (porcentaje === null) {
      setError('Ingresá un porcentaje distinto de cero. Puede ser negativo, pero mayor a -100.')
      return
    }
    if (!conCosto.length) {
      setError('Ninguno de los productos del proveedor tiene costo cargado: no hay a qué aplicarle el porcentaje.')
      return
    }
    setError('')
    /* Liquidaciones pendientes: se consultan AL CONFIRMAR, con el dato del momento. */
    setVerificando(true)
    try {
      const pend = await getPendientesLiquidacion(productos ?? [])
      if (pend.length) {
        setPendientes(pend)
        return
      }
    } catch {
      dispatch({ type: 'errorMonday', accion: 'verificar las liquidaciones pendientes del proveedor' })
      return
    } finally {
      setVerificando(false)
    }
    setVerTabla(true)
  }

  const confirmarActualizacion = async () => {
    if (porcentaje === null || actualizando || aplicada) return
    setActualizando(true)
    progreso.avanzar('costos', 0)
    const cambios = conCosto.map((x) => cambio(x, x.costo * (1 + porcentaje / 100)))
    const ok = await confirmar(
      {
        tipo: 'Porcentaje',
        cambios,
        porcentaje,
        productos: cambios.map((c, i) => ({ producto: conCosto[i], nuevo: c.nuevo, condiciones: {} })),
      },
      (etapa, hechos, total) => progreso.avanzar(etapa, total ? hechos / total : 0, `${hechos} de ${total} productos`),
    )
    if (ok) progreso.avanzar('listo', 1, `${cambios.length} productos`)
    else progreso.reiniciar()
    setActualizando(false)
  }

  const cerrado = !productos || actualizando || verificando || aplicada

  const estado = actualizando
    ? 'Actualizando Monday…'
    : aplicada
      ? 'Actualización aplicada'
    : verificando
      ? 'Verificando liquidaciones…'
      : porcentaje !== null
        ? 'Listo para confirmar'
        : 'Esperando el porcentaje'

  return (
    <>
      <div className="precios-carga">
        {/* En lugar del recuadro de carga: el porcentaje y, mientras se escribe, el avance. */}
        <div className={`pp-panel ${actualizando ? 'pp-panel--activo' : ''}`}>
          <span className="pp-ic" aria-hidden="true">
            <i className="fas fa-percent" />
          </span>
          <h3 className="pp-titulo">Porcentaje a aplicar sobre la lista</h3>
          <p className="pp-consigna">
            Se aplica sobre el costo unitario ("✋️Costo x Unid") de los {conCosto.length} productos de {proveedor.name} con
            costo cargado.{sinCosto > 0 && ` ${sinCosto} sin costo quedan afuera.`}
          </p>

          <div className="pp-form">
            <div className="precios-pct">
              <input
                type="text"
                inputMode="decimal"
                className="precios-input"
                placeholder="Ej.: 5 o -3,5"
                aria-label="Porcentaje a aplicar"
                value={texto}
                disabled={cerrado}
                onChange={(e) => {
                  setTexto(e.target.value)
                  if (error) setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && !cerrado && void pedirConfirmacion()}
              />
              <span className="precios-pct-signo">%</span>
            </div>
            <button type="button" className="btn btn-primary" disabled={cerrado} onClick={() => void pedirConfirmacion()}>
              {verificando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Verificando...
                </>
              ) : actualizando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Actualizando...
                </>
              ) : (
                <>
                  <i className="fas fa-check" /> Confirmar
                </>
              )}
            </button>
          </div>
          <span className="pp-error" role="alert">
            {error}
          </span>

        </div>

        <DatosActualizacion
          datos={[
            { label: 'Fecha de actualización', valor: fechaHoraActualizacion(new Date()) },
            { label: 'Proveedor', valor: proveedor.name, title: proveedor.name },
            { label: 'Código de proveedor', valor: proveedor.codigo || '—' },
            { label: 'Responsable', valor: usuarioActual?.name ?? '—' },
            { label: 'Tipo de actualización', valor: 'Por porcentaje a toda la lista' },
            {
              label: 'Porcentaje',
              valor: porcentaje !== null ? `${porcentaje > 0 ? '+' : ''}${pctDec(porcentaje)}` : '—',
            },
            { label: 'Productos del proveedor', valor: productos ? productos.length : '…' },
            { label: 'Productos a actualizar', valor: porcentaje !== null ? conCosto.length : '—', ok: porcentaje !== null },
            { label: 'Estado', valor: estado },
          ]}
          verHabilitado={porcentaje !== null && !!productos && !actualizando && !verificando}
          verTitle={porcentaje !== null ? 'Ver los productos a actualizar' : 'Se habilita al ingresar un porcentaje'}
          onVer={() => setVerTabla(true)}
        />
      </div>

      {verTabla && productos && porcentaje !== null && (
        <Modal
          ancho="amplio"
          title="Productos a actualizar en el maestro"
          cerrable={!actualizando}
          onClose={() => !actualizando && setVerTabla(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" disabled={actualizando} onClick={() => setVerTabla(false)}>
                Cancelar
              </button>
              <BotonConfirmarActualizacion
                actualizando={actualizando}
                aplicada={aplicada}
                onClick={() => void confirmarActualizacion()}
              />
            </>
          }
          pie={
            progreso.etapa && (
              <BarraProgreso valor={progreso.pct} etiqueta={progreso.etiqueta} completa={progreso.etapa === 'listo'} />
            )
          }
        >
          <TablaPrecios
            proveedor={proveedor}
            titulo="Productos del proveedor"
            icono="fa-percent"
            filas={filas}
            vacio="El proveedor no tiene productos asociados en el Maestro."
            destacado={`${conCosto.length} con nuevo precio (${porcentaje > 0 ? '+' : ''}${pctDec(porcentaje)})`}
          />
        </Modal>
      )}

      {pendientes && (
        <ModalLiquidacionPendiente
          proveedor={proveedor.name}
          pendientes={pendientes}
          onClose={() => setPendientes(null)}
        />
      )}
    </>
  )
}
