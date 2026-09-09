import { useEffect, useRef } from 'react'
import { ModalErrorMonday } from '@/components/ui/ModalErrorMonday'
import { EmisionView } from '@/features/emision/EmisionView'
import { InicioView } from '@/features/inicio/InicioView'
import { ProductosView } from '@/features/productos/ProductosView'
import { ProveedorView } from '@/features/proveedor/ProveedorView'
import { getCompradores, getUsuarioActual } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Paso } from '@/types'

/** Qué vista dibuja cada paso. */
const VISTAS: Record<Paso, () => JSX.Element | null> = {
  inicio: InicioView,
  proveedor: ProveedorView,
  productos: ProductosView,
  emision: EmisionView,
}

export function App() {
  const { paso } = useApp()
  const dispatch = useDispatch()
  const scrollRef = useRef<HTMLDivElement>(null)

  /* Usuario logueado y lista de compradores: las dos salen del mismo viaje a Monday (ver
     `services/monday/usuarios.ts`) y se piden UNA sola vez, al montar la app.

     Se despachan por separado y sin orden garantizado. El reducer preselecciona el comprador desde
     los dos lados —gane la que gane— así que el dueño del token queda elegido apenas están las dos.

     Ante un error se despacha el vacío igual: el selector deja de estar "Cargando…" en vez de
     quedarse trabado para siempre en un estado de espera que ya no va a resolverse. */
  useEffect(() => {
    let vivo = true
    getUsuarioActual()
      .then((usuario) => vivo && dispatch({ type: 'setUsuarioActual', usuario }))
      .catch(() => vivo && dispatch({ type: 'setUsuarioActual', usuario: null }))
    getCompradores()
      .then((compradores) => vivo && dispatch({ type: 'setCompradores', compradores }))
      .catch(() => vivo && dispatch({ type: 'setCompradores', compradores: [] }))
    return () => {
      vivo = false
    }
  }, [dispatch])

  // Cada paso arranca desde arriba, como en una navegación real.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [paso])

  const Vista = VISTAS[paso]

  return (
    <div className="scroll" ref={scrollRef}>
      <Vista />
      {/* ÚNICA forma en que la app comunica un fallo de la API: se monta una sola vez, arriba de
          todo, y aparece cuando cualquier consulta cae en su `catch`. */}
      <ModalErrorMonday />
    </div>
  )
}
