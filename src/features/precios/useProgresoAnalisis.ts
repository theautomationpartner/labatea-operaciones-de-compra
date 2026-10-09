import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Progreso de un proceso en etapas, de 0 a 100, para la barra de progreso.
 *
 * Cada etapa tiene su TRAMO de la barra. Sin datos, la etapa avanza sola con una curva que se frena
 * y nunca llega al final de su tramo: la barra se mueve sin prometer un dato que no existe. Con
 * avance REAL informado (`fraccion`), la barra lo sigue. Nunca retrocede.
 */
export interface Tramo {
  desde: number
  hasta: number
  /** Cuánto tarda (ms) en recorrer ~63% del tramo sin datos. */
  tau: number
  etiqueta: string
  /** Sólo avanza con el dato real (no por tiempo). */
  soloReal?: boolean
}

const PASO_MS = 200

export interface Progreso<E extends string> {
  etapa: E | 'listo' | null
  pct: number
  etiqueta: string
  /** Pasa a una etapa. `fraccion` (0..1) es el avance real informado; `detalle` se suma al rótulo. */
  avanzar: (etapa: E | 'listo', fraccion?: number, detalle?: string) => void
  reiniciar: () => void
}

export function useProgreso<E extends string>(tramos: Record<E, Tramo>, etiquetaListo: string): Progreso<E> {
  const [etapa, setEtapa] = useState<E | 'listo' | null>(null)
  const [pct, setPct] = useState(0)
  const [detalle, setDetalle] = useState('')
  const inicio = useRef(0)
  const etapaActual = useRef<E | 'listo' | null>(null)
  /** Avance real informado dentro de la etapa (0..1); `null` = no hay, se avanza por tiempo. */
  const real = useRef<number | null>(null)

  const avanzar = useCallback((nueva: E | 'listo', fraccion?: number, extra?: string) => {
    if (etapaActual.current !== nueva) {
      etapaActual.current = nueva
      inicio.current = Date.now()
    }
    setEtapa(nueva)
    real.current = fraccion ?? null
    setDetalle(extra ?? '')
    if (nueva === 'listo') setPct(100)
  }, [])

  const reiniciar = useCallback(() => {
    etapaActual.current = null
    setEtapa(null)
    setDetalle('')
    setPct(0)
    real.current = null
  }, [])

  /* Un solo temporizador mientras hay una etapa en curso: calcula dónde va la barra. */
  useEffect(() => {
    if (!etapa || etapa === 'listo') return
    const { desde, hasta, tau, soloReal } = tramos[etapa]
    const tick = () => {
      const porTiempo = soloReal ? 0 : 0.9 * (1 - Math.exp(-(Date.now() - inicio.current) / tau))
      const f = Math.max(real.current ?? 0, porTiempo)
      setPct((p) => Math.max(p, desde + (hasta - desde) * Math.min(1, f)))
    }
    tick()
    const t = setInterval(tick, PASO_MS)
    return () => clearInterval(t)
  }, [etapa, tramos])

  const base = etapa === 'listo' ? etiquetaListo : etapa ? tramos[etapa].etiqueta : ''
  return { etapa, pct, etiqueta: base ? `${base}${detalle ? ` · ${detalle}` : ''}` : '', avanzar, reiniciar }
}

/* ===== Análisis de una lista con IA ("Cargar Excel") ===== */

export type EtapaAnalisis = 'validando' | 'leyendo' | 'enviando' | 'analizando' | 'respondiendo'

const TRAMOS_ANALISIS: Record<EtapaAnalisis, Tramo> = {
  validando: { desde: 0, hasta: 8, tau: 2500, etiqueta: 'Verificando liquidaciones pendientes del proveedor…' },
  leyendo: { desde: 8, hasta: 12, tau: 800, etiqueta: 'Leyendo la lista de precios…' },
  enviando: { desde: 12, hasta: 16, tau: 1500, etiqueta: 'Enviando la lista a la IA…' },
  /* El razonamiento de Opus sobre una lista larga puede llevar un par de minutos. */
  analizando: { desde: 16, hasta: 45, tau: 45000, etiqueta: 'La IA está analizando la nueva lista de precios…' },
  /* Avance REAL: el servidor informa qué posición del Maestro ya recorrió (ver `api/_preciosIa.ts`). */
  respondiendo: {
    desde: 45,
    hasta: 99,
    tau: 30000,
    etiqueta: 'Comparando la lista con el Maestro de Productos…',
    soloReal: true,
  },
}

export const useProgresoAnalisis = () => useProgreso(TRAMOS_ANALISIS, 'Análisis finalizado')

/* ===== Escritura de una actualización en Monday ===== */

export type EtapaEscritura = 'costos' | 'actividades'

/*
 * El avance de la escritura es REAL: `aplicarActualizacion` informa cada tanda que termina (los
 * costos y las actividades van de a 50 productos por consulta). Dentro de una tanda la barra avanza
 * por tiempo, para que una tanda única de 50 no la deje quieta.
 */
const TRAMOS_ESCRITURA: Record<EtapaEscritura, Tramo> = {
  costos: { desde: 0, hasta: 70, tau: 4000, etiqueta: 'Actualizando los costos en el Maestro de Productos…' },
  actividades: { desde: 70, hasta: 99, tau: 3000, etiqueta: 'Registrando la actividad "Actualización de precio"…' },
}

export const useProgresoEscritura = () => useProgreso(TRAMOS_ESCRITURA, 'Actualización finalizada')
