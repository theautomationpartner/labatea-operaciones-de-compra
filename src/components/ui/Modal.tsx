import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  /** `amplio`: para contenido ancho (una tabla). El ancho normal es el de un aviso. */
  ancho?: 'normal' | 'amplio'
  /**
   * `false` mientras corre algo que no se puede abandonar (una escritura en Monday): sin la X y sin
   * cerrar al clickear afuera. Los botones de `actions` los deshabilita quien los dibuja.
   */
  cerrable?: boolean
  /** Lo que va DEBAJO de los botones (p. ej. la barra de progreso de lo que dispararon). */
  pie?: ReactNode
}

/** Ventana emergente centrada, con fondo oscurecido. Se cierra con la X o clickeando afuera. */
export function Modal({ title, icon, children, actions, onClose, ancho = 'normal', cerrable = true, pie }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={cerrable ? onClose : undefined}>
      <div
        className={`modal-box ${ancho === 'amplio' ? 'modal-box--amplio' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {cerrable && (
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        )}
        {icon && <div className="modal-icon">{icon}</div>}
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  )
}
