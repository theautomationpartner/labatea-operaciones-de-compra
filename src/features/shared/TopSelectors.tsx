import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Dropdown } from '@/components/ui/Dropdown'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { Modal } from '@/components/ui/Modal'
import { OPERACIONES, OPERACIONES_RESTRINGIDAS } from '@/lib/pasos'
import { puedeHacerExcepciones } from '@/lib/permisos'
import { useApp, useDispatch } from '@/state/hooks'
import type { Comprador, Operacion } from '@/types'

/** Item de la barra: etiqueta arriba, selector abajo. */
function TopSel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="topsel-item">
      <span className="topsel-lbl">{label}</span>
      {children}
    </div>
  )
}

function OperacionSelector() {
  const state = useApp()
  const { operacion, usuarioActual, navegacionBloqueada } = state
  const dispatch = useDispatch()
  /* ACTUALIZAR PRECIOS sólo se ofrece a Compras/Administración: a quien no puede usarla no se le
     muestra una puerta cerrada. */
  const opciones = puedeHacerExcepciones(usuarioActual)
    ? OPERACIONES
    : OPERACIONES.filter((op) => !OPERACIONES_RESTRINGIDAS.includes(op))
  // Operación elegida que espera confirmación en el modal de advertencia.
  const [pendiente, setPendiente] = useState<Operacion | null>(null)

  /* Hay datos de la operación en curso a partir del momento en que se dejó el paso inicial:
     cambiar de operación los perdería, así que el cambio se intercepta con una advertencia.
     Cuando se sumen proveedor, ítems y pagos, la condición pasa a mirarlos a ellos. */
  const hayDatos = state.paso !== 'inicio'

  const elegir = (op: Operacion) => {
    if (op === operacion) return
    // Sin datos (en el inicio): se aplica directo, sin modal ni reset.
    if (!hayDatos) {
      dispatch({ type: 'setOperacion', operacion: op })
      return
    }
    // Con datos cargados: se intercepta y se pide confirmación antes del deep reset.
    setPendiente(op)
  }

  return (
    <>
      <Dropdown<Operacion>
        className="dd--operacion"
        disabled={navegacionBloqueada}
        label={<span className={operacion ? '' : 'selbox-ph'}>{operacion ?? 'Seleccionar...'}</span>}
        items={opciones}
        itemKey={(op) => op}
        renderItem={(op) => op}
        itemClassName="dditem--strong"
        onSelect={elegir}
      />

      {pendiente && (
        <Modal
          title="¿Cambiar de operación?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setPendiente(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPendiente(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const op = pendiente
                  setPendiente(null)
                  // Deep reset: descarta todo y arranca la nueva operación desde el primer paso.
                  dispatch({ type: 'cambiarOperacion', operacion: op })
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Al cambiar de operación, todos los datos ingresados actualmente se perderán. ¿Deseas
          continuar?
        </Modal>
      )}
    </>
  )
}

/**
 * Quién firma la compra.
 *
 * Arranca con el usuario dueño del token de Monday ya elegido (ver `state/appState.ts`): en la
 * enorme mayoría de los casos la operación es de quien está usando la app, y hacérsela seleccionar
 * a mano sería un clic por operación para llegar al mismo lugar. Se puede cambiar a cualquier otro
 * usuario de la cuenta; el control de quién tiene derecho a hacerlo llega con la capa de seguridad.
 */
function CompradorSelector() {
  const { comprador, compradores, compradoresCargando } = useApp()
  const dispatch = useDispatch()

  /* El comprador elegido se muestra con el MISMO ícono con el que figura en la lista: sin él, el
     selector cerrado sería el único lugar donde el usuario aparece sin su avatar.
     Mientras se traen los usuarios queda el placeholder de carga. */
  const etiqueta = compradoresCargando ? (
    <span className="selbox-ph">Cargando compradores...</span>
  ) : comprador ? (
    /* Ícono y nombre van dentro de UN solo elemento: el botón reparte el espacio sobrante entre
       sus hijos, así que sueltos se separarían uno del otro en lugar de quedar juntos. */
    <span className="selbox-val">
      <Avatar ini={comprador.ini} color={comprador.color} size="sm" />
      <span className="selbox-val-txt">{comprador.name}</span>
    </span>
  ) : (
    <span className="selbox-ph">Seleccionar...</span>
  )

  return (
    <Dropdown<Comprador>
      label={etiqueta}
      items={compradores}
      itemKey={(c) => c.id}
      disabled={compradoresCargando}
      renderItem={(c) => (
        <>
          <Avatar ini={c.ini} color={c.color} />
          {c.name}
        </>
      )}
      onSelect={(c) => dispatch({ type: 'setComprador', comprador: c })}
    />
  )
}

/**
 * Operación y comprador: misma ubicación y diseño en todos los pasos del flujo.
 * `children` deja sumar acciones a la derecha (el Confirmar del paso inicial).
 */
export function SelectoresOperacion({ children }: { children?: ReactNode }) {
  return (
    <div className="topsel">
      {/* La marca abre la barra, contra el margen izquierdo y separada de los controles. */}
      <LogoEmpresa />
      <TopSel label="Seleccionar tipo de operación:">
        <OperacionSelector />
      </TopSel>
      <TopSel label="Seleccionar comprador:">
        <CompradorSelector />
      </TopSel>
      {children}
    </div>
  )
}
