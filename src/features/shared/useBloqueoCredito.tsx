import { useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import {
  excedeCredito,
  MENSAJE_PROVEEDOR_BLOQUEADO,
  mensajeCreditoExcedido,
  personaBloqueada,
} from '@/lib/credito'
import { useApp } from '@/state/hooks'

interface BloqueoCredito {
  /**
   * Chequeo previo a agregar un producto o a continuar. Devuelve `true` si frenó la acción (y ya
   * dejó la ventana emergente en pantalla); `false` si se puede seguir. Se usa como guarda:
   * `if (frenar()) return`.
   */
  frenar: () => boolean
  /** La ventana de aviso. Hay que montarla en la vista para que se vea. */
  modal: ReactNode
  /** El importe en curso no entra en la línea del proveedor. */
  excedido: boolean
}

/**
 * Bloqueo de la operación por crédito. Dos motivos lo disparan: un proveedor bloqueado en el
 * board, o un importe que se pasa del crédito disponible de su cuenta corriente.
 *
 * Es el MISMO hook de la app de ventas, sin el parámetro `bloqueante`: allá el presupuesto sólo
 * avisa y la venta frena, pero acá hay un solo comprobante —la orden de compra— y siempre frena.
 * Un parámetro con un único valor posible sólo invita a pasarle el otro por error.
 *
 * `importe` es lo que la orden va a consumir de la línea. Si el crédito no rige para este proveedor
 * (contado, o liberado sin crédito) nunca frena ni avisa por importe: no hay tope.
 */
export function useBloqueoCredito(importe: number): BloqueoCredito {
  const { proveedor } = useApp()
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)

  const excedido = excedeCredito(proveedor, importe)

  const frenar = (): boolean => {
    if (!proveedor) return false
    if (personaBloqueada(proveedor)) {
      setAviso({ titulo: 'Proveedor bloqueado', texto: MENSAJE_PROVEEDOR_BLOQUEADO })
      return true
    }
    if (excedeCredito(proveedor, importe)) {
      setAviso({
        titulo: 'Límite de crédito alcanzado',
        texto: mensajeCreditoExcedido(proveedor, importe),
      })
      return true
    }
    return false
  }

  const modal = aviso ? (
    <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
      {aviso.texto}
    </AvisoModal>
  ) : null

  return { frenar, modal, excedido }
}
