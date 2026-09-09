import { PasoHeader } from '@/features/shared/PasoHeader'
import { useApp, useDispatch } from '@/state/hooks'

/** Paso 0: elegir tipo de operación y comprador antes de entrar al flujo. */
export function InicioView() {
  const { operacion, comprador } = useApp()
  const dispatch = useDispatch()

  return (
    /* Misma barra que el resto de los pasos, sin stepper (todavía no hay operación confirmada):
       así el logo y los selectores quedan exactamente donde van a estar después de confirmar, en
       vez de arrancar pegados al borde izquierdo y saltar de lugar. */
    <section className="view paso-layout">
      <PasoHeader>
        <button
          type="button"
          className="btn btn-primary btn--h38"
          disabled={!operacion || !comprador}
          onClick={() => dispatch({ type: 'goto', paso: 'proveedor' })}
        >
          Confirmar <i className="fas fa-check" />
        </button>
      </PasoHeader>
    </section>
  )
}
