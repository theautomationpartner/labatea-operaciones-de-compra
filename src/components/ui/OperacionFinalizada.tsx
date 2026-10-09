import { useEffect } from 'react'

/**
 * Cuánto queda el aviso en pantalla antes de seguir solo. Le da lugar a la animación del tilde
 * (~1,2 s) y todavía deja un instante para leer el mensaje.
 */
const ESPERA_MS = 2000

/**
 * Cierre de una operación: el tilde verde se dibuja, se lee el mensaje ("Actualización
 * finalizada") y la app sigue sola (`onFin`).
 *
 * Es la MISMA ventana con la que cierra el registro de actividades de "Operaciones de venta"
 * (`ActividadRegistrada`): mismas medidas, animación y tiempos. No tiene botones ni se cierra a
 * mano a propósito —lo hecho ya está en Monday y no hay nada que decidir—, y el paso siguiente lo
 * dispara este mismo aviso al terminar, así que la pantalla nunca queda a mitad de camino.
 */
export function OperacionFinalizada({ onFin, texto = 'Operación finalizada' }: { onFin: () => void; texto?: string }) {
  useEffect(() => {
    const t = setTimeout(onFin, ESPERA_MS)
    return () => clearTimeout(t)
  }, [onFin])

  return (
    <div className="act-exito" role="status" aria-live="polite">
      <div className="act-exito-caja">
        {/* El tilde se DIBUJA (stroke-dasharray): primero el aro, después la marca. */}
        <svg className="act-exito-svg" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="act-exito-aro" cx="26" cy="26" r="23" />
          <path className="act-exito-tilde" d="M15 27 l7.5 7.5 L38 19" />
        </svg>
        <strong className="act-exito-txt">{texto}</strong>
      </div>
    </div>
  )
}
