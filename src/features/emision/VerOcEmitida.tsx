import { useState } from 'react'

/* Cuánto vive el enlace local al PDF. La pestaña ya lo cargó entero mucho antes; se suelta para no
   dejar el archivo retenido en memoria mientras la app siga abierta. */
const VIDA_ENLACE_MS = 5 * 60_000

/**
 * "Ver OC emitida": abre en una pestaña aparte el PDF de la orden que generó la app. Mismo botón
 * que el "Ver / Imprimir" del presupuesto en "Operaciones de venta": el PDF está en memoria, así
 * que la pestaña se abre directo con el archivo, en el mismo clic, y desde ahí se puede imprimir.
 *
 * Está SIEMPRE, pero se habilita recién con la orden emitida. Se puede abrir las veces que haga
 * falta.
 */
export function VerOcEmitida({ archivo }: { archivo: File | null }) {
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    if (!archivo) return
    setError(null)
    const url = URL.createObjectURL(archivo)
    const pestana = window.open(url, '_blank')
    if (!pestana) {
      URL.revokeObjectURL(url)
      setError(
        'El navegador bloqueó la pestaña del PDF. Permití las ventanas emergentes de este sitio y volvé a hacer clic.',
      )
      return
    }
    setTimeout(() => URL.revokeObjectURL(url), VIDA_ENLACE_MS)
  }

  return (
    <div className="pres-pdf">
      <button
        type="button"
        className="btn btn-out pres-pdf-btn"
        disabled={!archivo}
        title={archivo ? `Abrir ${archivo.name}` : 'Se habilita cuando termina la emisión'}
        onClick={abrir}
      >
        <i className="far fa-file-pdf" /> Ver OC emitida
      </button>
      {error && (
        <div className="pres-pdf-aviso" role="alert">
          <i className="fas fa-triangle-exclamation" /> {error}
        </div>
      )}
    </div>
  )
}
