import { useMemo, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { useBloqueoCredito } from '@/features/shared/useBloqueoCredito'
import { resumenCompra } from '@/lib/compras'
import { ETAPA, indiceDePaso, pasosDe } from '@/lib/pasos'
import { impactoCredito } from '@/lib/selectors'
import { useApp, useDispatch } from '@/state/hooks'
import type { Producto } from '@/types'
import { BuscadorProducto } from './BuscadorProducto'
import { CargaLinea } from './CargaLinea'
import { FiltrosProductos } from './FiltrosProductos'
import { ResumenBox } from './ResumenBox'
import { TablaProductos } from './TablaProductos'

/**
 * Etapa 2 de la ORDEN DE COMPRA: qué se le pide al proveedor.
 *
 * Misma estructura que el paso 2 de la app de ventas —buscador y filtros y carga de línea en una
 * sola card, tabla de líneas, resumen y footer de navegación—, con la restricción que define esta
 * operación: TODO lo que se busca acá es del proveedor de la etapa 1. La regla viaja en la
 * consulta (ver `services/monday/productos`), así que un producto de otro proveedor no llega ni a
 * aparecer en los resultados.
 */
export function ProductosView() {
  const { proveedor, lineas, operacion } = useApp()
  const dispatch = useDispatch()
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null)
  // Aviso de la búsqueda, que se muestra en el lugar del producto elegido.
  const [avisoBusqueda, setAvisoBusqueda] = useState('')
  // Ventana de advertencia al intentar continuar sin productos.
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)

  const resumen = useMemo(() => resumenCompra(lineas), [lineas])
  const credito = useMemo(() => impactoCredito(proveedor, resumen.total), [proveedor, resumen.total])
  /* El crédito se mide sobre el TOTAL de la orden: es lo que se le va a deber al proveedor cuando
     facture. No hay neto ni IVA que separar —una orden de compra no liquida impuestos—. */
  const bloqueo = useBloqueoCredito(resumen.total)

  /* Sin proveedor no hay catálogo que mostrar: no se sabe de quién se compra. En la práctica no
     pasa —a esta etapa se llega desde la anterior, que lo exige— pero el guard es lo que le
     permite al tipo saber que abajo `proveedor` no es null. */
  if (!proveedor) return null

  const indice = indiceDePaso('productos', operacion)

  const agregar = (cantidad: number) => {
    if (!seleccionado) return
    // Con el crédito excedido no se cargan más productos: hay que bajar el importe.
    if (bloqueo.frenar()) return
    dispatch({ type: 'addLinea', producto: seleccionado, cantidad })
    setSeleccionado(null)
    setAvisoBusqueda('')
  }

  return (
    <section className="view productos-v2 paso-layout">
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      <PasoTitulo
        numero={indice + 1}
        titulo={ETAPA.productos}
        descripcion={
          <>
            Buscá y filtrá entre los productos de <strong>{proveedor.name}</strong> para construir la
            orden de compra.
          </>
        }
      />

      <div className="card">
        <div className="search-area">
          <BuscadorProducto
            proveedorId={proveedor.id}
            onSelect={setSeleccionado}
            onAviso={setAvisoBusqueda}
          />
          <FiltrosProductos />
        </div>
        <CargaLinea
          key={seleccionado?.id ?? 'vacio'}
          producto={seleccionado}
          aviso={avisoBusqueda}
          onAdd={agregar}
          bloqueado={bloqueo.excedido}
        />
      </div>

      <TablaProductos
        titulo="Productos de la orden"
        lineas={lineas}
        onRemove={(id) => dispatch({ type: 'removeLinea', id })}
        onCantidad={(id, cantidad) => dispatch({ type: 'setCantidadLinea', id, cantidad })}
      />

      <ResumenBox
        titulo="Resumen de la orden de compra"
        resumen={resumen}
        credito={credito}
        limite={proveedor.limit}
      />

      <footer className="page-footer">
        <button
          type="button"
          className="btn-outline"
          onClick={() => dispatch({ type: 'goto', paso: 'proveedor' })}
        >
          <i className="fas fa-arrow-left" /> Volver
        </button>
        <div className="actions-right">
          {/* El botón queda activo: si falta algo, la ventana explica qué, en vez de bloquear. */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (lineas.length === 0) {
                setAviso({
                  titulo: 'No hay productos seleccionados',
                  texto:
                    'Tenés que agregar al menos un producto para continuar con la orden de compra.',
                })
                return
              }
              if (bloqueo.frenar()) return
              dispatch({ type: 'goto', paso: 'emision' })
            }}
          >
            Continuar a {ETAPA.emitir} <i className="fas fa-chevron-right" />
          </button>
        </div>
      </footer>

      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}

      {bloqueo.modal}
    </section>
  )
}
