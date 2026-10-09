import { useEffect, useMemo, useRef, useState } from 'react'
import { BarraProgreso } from '@/components/ui/BarraProgreso'
import { Modal } from '@/components/ui/Modal'
import { SoltarArchivo, type EstadoSoltar } from '@/components/ui/SoltarArchivo'
import { cambio, ListaIlegible, listaComoTexto } from '@/lib/listaExcel'
import type { CondicionesNuevas, ProductoPrecio } from '@/lib/precios'
import { analizarListaConIa, ErrorAnalisisIa } from '@/services/ia/preciosIa'
import { getPendientesLiquidacion, type PendienteLiquidacion } from '@/services/monday/precios'
import { useApp, useDispatch } from '@/state/hooks'
import type { Proveedor } from '@/types'
import { DatosActualizacion, fechaHoraActualizacion } from './DatosActualizacion'
import { ModalLiquidacionPendiente } from './ModalLiquidacionPendiente'
import { BotonConfirmarActualizacion, type Confirmar } from './ResultadoPrecios'
import { TablaPrecios, type FilaPrecio } from './TablaPrecios'
import { useBorradorPrecios } from './useBorradorPrecios'
import { useProgresoAnalisis, useProgresoEscritura } from './useProgresoAnalisis'

type Fase = 'vacio' | 'validando' | 'analizando' | 'listo' | 'bloqueado' | 'error'

const ACEPTA =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'
const ES_PLANILLA = /\.(xlsx|xls|csv)$/i

interface ModoExcelProps {
  proveedor: Proveedor
  productos: readonly ProductoPrecio[] | null
  confirmar: Confirmar
  /** La actualización ya se escribió en Monday: no se puede volver a cargar ni a confirmar. */
  aplicada: boolean
  /** Avisa cuándo empieza y termina el procesamiento: mientras dura, no se puede navegar. */
  onProcesando?: (procesando: boolean) => void
}

/** Lo que la IA detectó para un producto: el costo nuevo y las condiciones que cambian. */
interface Detectado {
  nuevo: number
  condiciones: CondicionesNuevas
}

/**
 * CARGAR EXCEL: la lista del proveedor se suelta en el recuadro, queda guardada en la app y la
 * analiza la IA contra los productos del proveedor en el Maestro.
 *
 *   · Izquierda, el recuadro de arrastrar y soltar, con la barra de progreso ADENTRO mientras se
 *     procesa. Derecha, los datos de la actualización, que se completan solos (fecha, proveedor,
 *     responsable, archivo…), y el botón "Ver Actualización de Precios".
 *   · Antes de gastar el análisis se valida que el proveedor no tenga ventas de consignación sin
 *     liquidar ("Venta Pend de Liq CYO"): con pendientes, la lista no se puede actualizar.
 *   · Al terminar el análisis se abre la ventana "Productos a actualizar en el maestro" con la tabla
 *     (lo que cambia arriba, con el costo anterior tachado y lo nuevo en verde). "Confirmar
 *     Actualización" escribe en Monday; "Cancelar" la cierra y se puede volver a abrir con el botón.
 */
export function ModoExcel({ proveedor, productos, confirmar, aplicada, onProcesando }: ModoExcelProps) {
  const { usuarioActual } = useApp()
  const dispatch = useDispatch()
  /* Lo cargado vive en el borrador de la etapa: ir y volver por el stepper no lo pierde. */
  const [archivo, setArchivo] = useBorradorPrecios<File | null>('excel.archivo', null)
  /** Cuándo se cargó la lista: es la fecha de la actualización. */
  const [cargadoEl, setCargadoEl] = useBorradorPrecios<Date | null>('excel.cargadoEl', null)
  const [fase, setFase] = useBorradorPrecios<Fase>('excel.fase', 'vacio')
  const [error, setError] = useBorradorPrecios('excel.error', '')
  /** Lo que detectó la IA, por id de producto. `null` = todavía no hay análisis. */
  const [detectados, setDetectados] = useBorradorPrecios<Map<string, Detectado> | null>('excel.detectados', null)
  const [pendientes, setPendientes] = useState<PendienteLiquidacion[] | null>(null)
  const [verTabla, setVerTabla] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  /* Cada carga tiene su número: si llega la respuesta de una carga vieja, se descarta. */
  const corrida = useRef(0)
  const progreso = useProgresoAnalisis()
  /** El avance de la escritura en Monday, debajo de "Confirmar Actualización". */
  const escritura = useProgresoEscritura()

  /* Un análisis que quedó a medias (no debería: la navegación se bloquea mientras corre) no se
     retoma: se avisa y se puede volver a cargar. */
  useEffect(() => {
    if (fase === 'validando' || fase === 'analizando') {
      setFase('error')
      setError('El análisis anterior se interrumpió. Volvé a cargar la lista.')
    }
    // Sólo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Todos los productos del proveedor; con el análisis hecho, los que cambian van primero. */
  const filas: FilaPrecio[] = useMemo(() => {
    if (!productos) return []
    const todas = productos.map((p) => {
      const d = detectados?.get(p.id)
      return { producto: p, nuevo: d?.nuevo ?? null, condiciones: d?.condiciones }
    })
    if (!detectados) return todas
    return [...todas.filter((f) => detectados.has(f.producto.id)), ...todas.filter((f) => !detectados.has(f.producto.id))]
  }, [detectados, productos])

  const cantidad = detectados?.size ?? 0
  const procesando = fase === 'validando' || fase === 'analizando'
  /* Analizar la lista o escribir en Monday: en los dos casos no se puede navegar. */
  const ocupado = procesando || actualizando

  /* Mientras se procesa la lista no se puede navegar (ver `PreciosView`). Al desmontarse se libera
     siempre, aunque el análisis no haya terminado. */
  useEffect(() => {
    onProcesando?.(ocupado)
  }, [ocupado, onProcesando])
  useEffect(() => () => onProcesando?.(false), [onProcesando])

  const procesar = async (f: File) => {
    if (!productos) return
    const n = ++corrida.current
    setArchivo(f)
    setCargadoEl(new Date())
    setDetectados(null)
    setVerTabla(false)
    setError('')
    progreso.reiniciar()
    if (!ES_PLANILLA.test(f.name)) {
      setFase('error')
      setError('El archivo tiene que ser un Excel (.xlsx / .xls) o un CSV.')
      return
    }

    /* 1 · Validación de liquidaciones, ANTES de llamar a la IA. */
    setFase('validando')
    progreso.avanzar('validando')
    let pend: PendienteLiquidacion[]
    try {
      pend = await getPendientesLiquidacion(productos)
    } catch {
      if (n !== corrida.current) return
      progreso.reiniciar()
      setFase('error')
      setError('No se pudieron verificar las liquidaciones pendientes del proveedor.')
      dispatch({ type: 'errorMonday', accion: 'verificar las liquidaciones pendientes del proveedor' })
      return
    }
    if (n !== corrida.current) return
    if (pend.length) {
      progreso.reiniciar()
      setPendientes(pend)
      setFase('bloqueado')
      return
    }

    /* 2 · Análisis con la IA, con su avance en la barra. */
    setFase('analizando')
    try {
      progreso.avanzar('leyendo')
      const texto = await listaComoTexto(f)
      if (n !== corrida.current) return
      progreso.avanzar('enviando')
      const r = await analizarListaConIa(proveedor.name, productos, texto, (e) => {
        if (n !== corrida.current) return
        if (e.fase === 'analizando') progreso.avanzar('analizando')
        else progreso.avanzar('respondiendo', e.hechos / e.total, `${e.hechos} de ${e.total} productos`)
      })
      if (n !== corrida.current) return
      progreso.avanzar('listo', 1, r.length ? `${r.length} con nuevo precio` : 'sin cambios en la lista')
      setDetectados(
        new Map(
          r.map((x) => [
            x.id,
            {
              nuevo: x.precioNuevo,
              condiciones: {
                ...(x.descuentosNuevos ? { descuentos: x.descuentosNuevos } : {}),
                ...(x.bonifNueva !== null ? { bonif: x.bonifNueva } : {}),
              },
            },
          ]),
        ),
      )
      setFase('listo')
      // Terminado el procesamiento, se abre la tabla para revisar y confirmar.
      setVerTabla(true)
    } catch (e) {
      if (n !== corrida.current) return
      progreso.reiniciar()
      setFase('error')
      setError(
        e instanceof ListaIlegible || e instanceof ErrorAnalisisIa
          ? e.message
          : 'No se pudo analizar la lista. Probá de nuevo en unos segundos.',
      )
    }
  }

  const quitar = () => {
    corrida.current++
    progreso.reiniciar()
    setArchivo(null)
    setCargadoEl(null)
    setDetectados(null)
    setVerTabla(false)
    setFase('vacio')
    setError('')
  }

  const confirmarActualizacion = async () => {
    if (!productos || !detectados || actualizando || aplicada) return
    setActualizando(true)
    escritura.avanzar('costos', 0)
    const elegidos = productos.filter((p) => detectados.has(p.id))
    const ok = await confirmar(
      {
        tipo: 'Excel',
        archivo,
        cambios: elegidos.map((p) => {
          const d = detectados.get(p.id)!
          return { ...cambio(p, d.nuevo), ...d.condiciones }
        }),
        productos: elegidos.map((p) => ({ producto: p, ...detectados.get(p.id)! })),
      },
      (etapa, hechos, total) => escritura.avanzar(etapa, total ? hechos / total : 0, `${hechos} de ${total} productos`),
    )
    /* Bien: la barra queda completa y la vista muestra el aviso de fin y pasa a la última etapa. */
    if (ok) escritura.avanzar('listo', 1, `${elegidos.length} productos`)
    else escritura.reiniciar()
    setActualizando(false)
  }

  const cara: { estado: EstadoSoltar; titulo?: string; detalle?: string } =
    fase === 'validando'
      ? {
          estado: 'procesando',
          titulo: 'Verificando liquidaciones…',
          detalle: 'Revisando que el proveedor no tenga ventas en consignación sin liquidar.',
        }
      : fase === 'analizando'
        ? {
            estado: 'procesando',
            titulo: 'Analizando lista de precio',
            detalle: 'La IA está analizando la nueva lista de precios...',
          }
        : fase === 'listo'
          ? {
              estado: 'listo',
              titulo: 'Análisis finalizado',
              detalle: cantidad
                ? `Se ${cantidad === 1 ? 'detectó 1 producto' : `detectaron ${cantidad} productos`} con nuevo precio.`
                : 'La lista no trae precios distintos a los vigentes.',
            }
          : fase === 'bloqueado'
            ? {
                estado: 'advertencia',
                titulo: 'No se puede actualizar la lista',
                detalle: 'El proveedor tiene ventas en consignación pendientes de liquidar.',
              }
            : fase === 'error'
              ? { estado: 'error', titulo: 'No se pudo analizar la lista', detalle: error }
              : {
                  estado: 'vacio',
                  titulo: 'Arrastrá la lista de precios',
                  detalle: 'Soltá en este área el Excel del proveedor (.xlsx, .xls o .csv), o hacé click para elegirlo',
                }

  const estadoTexto =
    fase === 'validando' || fase === 'analizando'
      ? 'Procesando la lista…'
      : aplicada
        ? 'Actualización aplicada'
        : fase === 'listo'
        ? cantidad
          ? 'Lista para confirmar'
          : 'Sin cambios para aplicar'
        : fase === 'bloqueado'
          ? 'Bloqueada por liquidaciones pendientes'
          : fase === 'error'
            ? 'Con error'
            : 'Esperando la lista'

  return (
    <>
      <div className="precios-carga">
        <SoltarArchivo
          id="lista-precios"
          className="precios-soltar"
          archivo={archivo?.name ?? null}
          estado={cara.estado}
          titulo={cara.titulo}
          detalle={cara.detalle}
          deshabilitado={!productos || actualizando || aplicada}
          onArchivo={(f) => void procesar(f)}
          onQuitar={archivo && !procesando && !aplicada ? quitar : undefined}
          accion={
            archivo && !aplicada && (fase === 'error' || fase === 'bloqueado')
              ? { texto: 'Reintentar', onClick: () => void procesar(archivo) }
              : undefined
          }
          accept={ACEPTA}
          formatos="Excel o CSV"
        >
          {/* La barra va DENTRO del recuadro, mientras se procesa y al terminar. Al volver a la etapa
              con el análisis ya hecho, se la muestra completa. */}
          {progreso.etapa ? (
            <BarraProgreso valor={progreso.pct} etiqueta={progreso.etiqueta} completa={progreso.etapa === 'listo'} />
          ) : (
            fase === 'listo' && (
              <BarraProgreso
                valor={100}
                completa
                etiqueta={`Análisis finalizado · ${cantidad ? `${cantidad} con nuevo precio` : 'sin cambios en la lista'}`}
              />
            )
          )}
        </SoltarArchivo>

        {/* Los datos de la actualización: se completan solos, no se editan. */}
        <DatosActualizacion
          datos={[
            { label: 'Fecha de actualización', valor: fechaHoraActualizacion(cargadoEl ?? new Date()) },
            { label: 'Proveedor', valor: proveedor.name, title: proveedor.name },
            { label: 'Código de proveedor', valor: proveedor.codigo || '—' },
            { label: 'Responsable', valor: usuarioActual?.name ?? '—' },
            { label: 'Tipo de actualización', valor: 'Lista de precios (Excel)' },
            { label: 'Archivo', valor: archivo?.name ?? '—', title: archivo?.name },
            { label: 'Productos del proveedor', valor: productos ? productos.length : '…' },
            { label: 'Productos con nuevo precio', valor: detectados ? cantidad : '—', ok: cantidad > 0 },
            { label: 'Estado', valor: estadoTexto },
          ]}
          verHabilitado={!!detectados && !procesando}
          verTitle={detectados ? 'Ver los productos a actualizar' : 'Se habilita cuando termina el procesamiento de una lista'}
          onVer={() => setVerTabla(true)}
        />
      </div>

      {verTabla && productos && (
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
                deshabilitado={cantidad === 0}
                onClick={() => void confirmarActualizacion()}
              />
            </>
          }
          pie={
            escritura.etapa && (
              <BarraProgreso valor={escritura.pct} etiqueta={escritura.etiqueta} completa={escritura.etapa === 'listo'} />
            )
          }
        >
          <TablaPrecios
            proveedor={proveedor}
            titulo="Productos del proveedor"
            icono="fa-file-invoice-dollar"
            filas={filas}
            vacio="El proveedor no tiene productos asociados en el Maestro."
            destacado={cantidad ? `${cantidad} con nuevo precio` : 'Sin cambios en la lista'}
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
