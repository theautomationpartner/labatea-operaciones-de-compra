import { useCallback, useRef, type SetStateAction } from 'react'
import { useApp, useDispatch } from '@/state/hooks'

/**
 * Como `useState`, pero guardado en el borrador GLOBAL de "Actualizar Precios"
 * (`borradorPrecios`): lo cargado en la etapa sobrevive a ir a otra etapa con el stepper y volver.
 * Cada dato va bajo su `clave`; `inicial` vale mientras la clave no se haya escrito.
 */
export function useBorradorPrecios<T>(clave: string, inicial: T): [T, (v: SetStateAction<T>) => void] {
  const { borradorPrecios } = useApp()
  const dispatch = useDispatch()
  const valor = (clave in borradorPrecios ? borradorPrecios[clave] : inicial) as T
  /* El último valor, para resolver una actualización con función sin depender del render. */
  const ultimo = useRef(valor)
  ultimo.current = valor
  const set = useCallback(
    (v: SetStateAction<T>) => {
      const nuevo = typeof v === 'function' ? (v as (p: T) => T)(ultimo.current) : v
      ultimo.current = nuevo
      dispatch({ type: 'setBorradorPrecios', clave, valor: nuevo })
    },
    [clave, dispatch],
  )
  return [valor, set]
}
