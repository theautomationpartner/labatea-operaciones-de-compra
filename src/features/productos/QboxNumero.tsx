import { useState, type ReactNode } from 'react'

/** Tope de los campos numéricos de la tabla: 3 dígitos. */
export const MAX_QBOX = 999

interface QboxNumeroProps {
  /** Lo que se muestra cuando no se está escribiendo (puede tener decimales: "1,5"). */
  texto: string
  /** Valor mínimo aceptado al escribir. Por debajo no se aplica: al salir vuelve el anterior. */
  min: number
  /** Se escribió un número válido (entero, ≤ 3 dígitos, sin ceros a la izquierda, ≥ `min`). */
  onEscribir: (n: number) => void
  onSubir: () => void
  onBajar: () => void
  subirDeshabilitado?: boolean
  bajarDeshabilitado?: boolean
  ariaLabel: string
  ariaSubir: string
  ariaBajar: string
  /** Modificadores del recuadro (error, envase alterado…). */
  className?: string
  /** Texto al pasar el mouse por el recuadro. */
  title?: string
  /** Lo que va montado sobre el recuadro (el badge de advertencia). */
  children?: ReactNode
}

/**
 * Número editable de la tabla de la orden: se puede ESCRIBIR o mover con las flechas. Mismo
 * criterio que "Cant de Envases" en la carga: sólo dígitos (nunca negativos ni decimales), como
 * máximo 3, y un 0 inicial no admite otro dígito detrás ("04", "004").
 */
export function QboxNumero({
  texto,
  min,
  onEscribir,
  onSubir,
  onBajar,
  subirDeshabilitado = false,
  bajarDeshabilitado = false,
  ariaLabel,
  ariaSubir,
  ariaBajar,
  className = '',
  title,
  children,
}: QboxNumeroProps) {
  // Texto MIENTRAS se escribe. `null` = no se está editando y se muestra `texto`.
  const [escrito, setEscrito] = useState<string | null>(null)

  const escribir = (valor: string) => {
    const digitos = valor.replace(/\D/g, '')
    // Se rechaza la tecla: más de 3 dígitos, o un 0 inicial con algo detrás.
    if (digitos.length > 3 || (digitos.length > 1 && digitos.startsWith('0'))) return
    setEscrito(digitos)
    const n = Number(digitos)
    // Vacío o por debajo del mínimo no se aplica todavía: puede ser un paso intermedio del tipeo.
    if (digitos && n >= min) onEscribir(n)
  }

  return (
    <span className={`qbox ${className}`} title={title}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={3}
        aria-label={ariaLabel}
        value={escrito ?? texto}
        onFocus={(e) => e.target.select()}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={(e) => {
          if (['-', '+', 'e', '.', ','].includes(e.key)) e.preventDefault()
          if (e.key === 'ArrowUp' && !subirDeshabilitado) {
            e.preventDefault()
            setEscrito(null)
            onSubir()
          }
          if (e.key === 'ArrowDown' && !bajarDeshabilitado) {
            e.preventDefault()
            setEscrito(null)
            onBajar()
          }
        }}
        // Al salir se vuelve a mostrar el valor vigente (lo inválido no se aplicó nunca).
        onBlur={() => setEscrito(null)}
      />
      <span className="qbtns">
        <button
          type="button"
          aria-label={ariaSubir}
          disabled={subirDeshabilitado}
          onClick={() => {
            setEscrito(null)
            onSubir()
          }}
        >
          <i className="fas fa-angle-up" />
        </button>
        <button
          type="button"
          aria-label={ariaBajar}
          disabled={bajarDeshabilitado}
          onClick={() => {
            setEscrito(null)
            onBajar()
          }}
        >
          <i className="fas fa-angle-down" />
        </button>
      </span>
      {children}
    </span>
  )
}
