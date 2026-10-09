import * as Progress from '@radix-ui/react-progress'

interface BarraProgresoProps {
  /** De 0 a 100. */
  valor: number
  /** Qué se está haciendo, arriba de la barra. */
  etiqueta: string
  /** Terminó bien: la barra pasa a verde. */
  completa?: boolean
}

/**
 * Barra de progreso fina con el rótulo arriba y el porcentaje a la derecha.
 *
 * Está hecha sobre Radix Progress (`@radix-ui/react-progress`): no trae estilos propios y resuelve la
 * accesibilidad —`role="progressbar"`, `aria-valuenow`/`aria-valuemax`, estado `loading`/`complete`—,
 * que es lo que una barra a mano suele olvidar. El avance se dibuja con `transform` y no con
 * `width`: el navegador lo anima en la GPU sin recalcular el layout en cada paso.
 */
export function BarraProgreso({ valor, etiqueta, completa = false }: BarraProgresoProps) {
  const v = Math.max(0, Math.min(100, valor))
  return (
    <div className={`pg ${completa ? 'pg--completa' : ''}`}>
      <span className="pg-etiqueta">{etiqueta}</span>
      <div className="pg-fila">
        <Progress.Root className="pg-riel" value={v} max={100} aria-label={etiqueta}>
          <Progress.Indicator className="pg-avance" style={{ transform: `translateX(-${100 - v}%)` }} />
        </Progress.Root>
        <span className="pg-pct">{Math.round(v)}%</span>
      </div>
    </div>
  )
}
