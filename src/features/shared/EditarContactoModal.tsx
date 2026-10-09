import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { actualizarContacto, DOCUMENTO_ORDEN_COMPRA, emailValido } from '@/services/monday'
import type { Contacto } from '@/types'

interface EditarContactoModalProps {
  contacto: Contacto
  proveedorId: string
  onClose: () => void
  /** El contacto quedó actualizado en Monday: se devuelve con sus datos nuevos. */
  onGuardado: (contacto: Contacto) => void
}

/**
 * Edición de un contacto del proveedor desde el envío de la orden: su email y si acepta la orden
 * de compra como documento. "Confirmar" lo escribe en el tablero "Contactos" de Monday.
 */
export function EditarContactoModal({ contacto, proveedorId, onClose, onGuardado }: EditarContactoModalProps) {
  const [email, setEmail] = useState(contacto.email)
  const [acepta, setAcepta] = useState(contacto.ok)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailOk = emailValido(email)
  const sinCambios = email.trim() === contacto.email.trim() && acepta === contacto.ok

  const confirmar = async () => {
    if (!emailOk || guardando) return
    setGuardando(true)
    setError(null)
    try {
      onGuardado(await actualizarContacto(contacto, { email, aceptaOrdenCompra: acepta }, proveedorId))
    } catch {
      setGuardando(false)
      setError('No se pudo actualizar el contacto en Monday. Revisá la conexión y reintentá.')
    }
  }

  return (
    <Modal
      title={`Editar contacto: ${contacto.name}`}
      icon={<i className="fas fa-user-pen" />}
      onClose={() => !guardando && onClose()}
      actions={
        <>
          <button type="button" className="btn btn-out" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!emailOk || sinCambios || guardando}
            onClick={() => void confirmar()}
          >
            {guardando ? (
              <>
                <i className="fas fa-circle-notch spin" /> Guardando...
              </>
            ) : (
              'Confirmar'
            )}
          </button>
        </>
      }
    >
      <div className="editar-contacto">
        <label htmlFor="ec-email">Email</label>
        <input
          id="ec-email"
          type="email"
          className={!emailOk && email.trim() ? 'editar-contacto-input--error' : ''}
          placeholder="nombre@empresa.com"
          value={email}
          disabled={guardando}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !sinCambios && void confirmar()}
        />
        {!emailOk && (
          <span className="editar-contacto-aviso">
            {email.trim() ? 'El email no tiene un formato válido.' : 'Ingresá el email del contacto.'}
          </span>
        )}

        <label className="editar-contacto-check">
          <input
            type="checkbox"
            checked={acepta}
            disabled={guardando}
            onChange={(e) => setAcepta(e.target.checked)}
          />
          Acepta <strong>{DOCUMENTO_ORDEN_COMPRA}</strong> como documento
        </label>

        {error && (
          <p className="editar-contacto-error" role="alert">
            <i className="fas fa-circle-exclamation" /> {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
