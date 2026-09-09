import { Fragment, useState } from 'react'
import { cantPorEnvase, envasesDe, totalLinea } from '@/lib/compras'
import { money } from '@/lib/format'
import type { LineaCompra } from '@/types'
import { ProveedorLinea, StockPanel } from './StockPanel'

interface TablaProductosProps {
  titulo: string
  lineas: readonly LineaCompra[]
  /** Quitar una línea. */
  onRemove: (id: string) => void
  /**
   * Cambiar la cantidad. Recibe UNIDADES ya calculadas por la tabla —siempre un múltiplo del
   * envase— aunque en pantalla lo que se mueve sea el contador de envases: los botones son los
   * únicos que la tocan, y sólo producen múltiplos válidos (ver `CargaLinea` para el porqué).
   */
  onCantidad: (id: string, cantidad: number) => void
}

/**
 * Tabla de líneas de la orden de compra. Misma estructura y mismo comportamiento que la de la app
 * de ventas —fila desplegable con el detalle de stock, cantidad con botones, tacho para quitar—,
 * con las columnas propias de una compra: unidad de compra, cuántas unidades trae cada envase,
 * cuántos envases se piden y el costo de reposición, en vez de precio de lista, descuento y
 * rentabilidad.
 */
export function TablaProductos({ titulo, lineas, onRemove, onCantidad }: TablaProductosProps) {
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set())
  /* Desplegable, N°, producto, unidad de compra, cant x envase, cant de envase, cant total a
     pedir, costo de reposición, subtotal y acciones. Es el `colSpan` de la fila desplegada: si se
     agrega o se quita una columna, hay que moverlo o el detalle deja de ocupar el ancho entero. */
  const COLUMNAS = 10

  const toggle = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="tablec">
      <div className="thtitle">
        {titulo} ({lineas.length})
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }} />
            <th colSpan={2}>Producto</th>
            <th className="ta-c">Unidad de Compra</th>
            <th className="ta-c">Cant x Envase</th>
            <th className="ta-c">Cant de Envase</th>
            <th className="ta-c">Cant Total a Pedir</th>
            <th className="ta-r">Costo de Reposición</th>
            <th className="ta-r">Subtotal</th>
            <th className="ta-c">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => {
            const abierta = expandidas.has(l.id)
            const escalon = cantPorEnvase(l.producto)
            /* La línea guarda UNIDADES; los envases se derivan al dibujar, igual que en la
               tarjeta de carga. Un solo número en el estado, dos escalas en pantalla. */
            const envases = envasesDe(l.producto, l.cantidad)
            return (
              <Fragment key={l.id}>
                <tr>
                  <td style={{ width: 40 }}>
                    <i
                      className={`fas fa-chevron-right chev ${abierta ? 'open' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver detalle de ${l.producto.nombre}`}
                      aria-expanded={abierta}
                      onClick={() => toggle(l.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(l.id)
                        }
                      }}
                    />
                  </td>
                  <td style={{ width: 20, color: 'var(--text-gray)', fontWeight: 600 }}>{i + 1}</td>
                  <td>
                    <span style={{ color: 'var(--primary-blue)', fontWeight: 700 }}>
                      {l.producto.codigo}
                    </span>
                    <span style={{ marginLeft: 12, fontWeight: 600 }}>{l.producto.nombre}</span>
                  </td>

                  <td className="ta-c">{l.producto.unidadCompra || '—'}</td>
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    {escalon}
                  </td>

                  {/* ENVASES, que es la unidad en la que se le pide al proveedor. El input es de
                      lectura y los botones se mueven de a uno: internamente la línea sigue
                      guardando UNIDADES, así que un envase son `escalon` unidades. */}
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    <span className="qbox">
                      <input
                        type="text"
                        inputMode="none"
                        readOnly
                        aria-label={`Envases a comprar de ${l.producto.nombre}`}
                        title={`Cada envase trae ${escalon} ${escalon === 1 ? 'unidad' : 'unidades'}`}
                        value={envases}
                      />
                      <span className="qbtns">
                        <button
                          type="button"
                          aria-label={`Sumar un envase de ${l.producto.nombre}`}
                          onClick={() => onCantidad(l.id, l.cantidad + escalon)}
                        >
                          <i className="fas fa-angle-up" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Restar un envase de ${l.producto.nombre}`}
                          /* No baja del primer envase: una línea en cero no es una línea, es
                             quitarla, y para eso está el tacho. */
                          disabled={envases <= 1}
                          onClick={() => onCantidad(l.id, l.cantidad - escalon)}
                        >
                          <i className="fas fa-angle-down" />
                        </button>
                      </span>
                    </span>
                  </td>

                  {/* Las unidades que salen de esos envases: Cant x Envase × Cant de Envase. Es la
                      escala en la que se mueve el stock. */}
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    {l.cantidad}
                  </td>
                  {/* Lo que cuesta UN envase, tal cual lo publica el Maestro. */}
                  <td className="ta-r" style={{ fontWeight: 600 }}>
                    {money(l.producto.costoReposicion)}
                  </td>
                  {/* Envases × costo del envase. Es el único valor que escala con la cantidad. */}
                  <td className="ta-r" style={{ fontWeight: 700 }}>
                    {money(totalLinea(l.producto, l.cantidad))}
                  </td>
                  <td className="ta-c">
                    <i
                      className="far fa-trash-alt trash"
                      role="button"
                      aria-label={`Quitar ${l.producto.nombre}`}
                      onClick={() => onRemove(l.id)}
                    />
                  </td>
                </tr>

                {abierta && (
                  <tr className="rexp">
                    <td colSpan={COLUMNAS} style={{ padding: 0 }}>
                      <div className="expd">
                        {/* `lindet-stock` es lo que ordena el panel en VERTICAL —las cajas en una
                            sola línea repartiéndose todo el ancho, y la nota debajo—. Sin ese
                            wrapper el bloque caía en el layout base, pensado para convivir con la
                            barra de cobertura al costado: las cajas se apretaban contra la
                            izquierda y sobraba media fila vacía a la derecha.
                            El modificador `--solo` le saca el filete de columna: acá el stock es
                            todo el contenido de la fila desplegada, no la mitad derecha de un
                            detalle de dos columnas. */}
                        <section className="lindet-stock lindet-stock--solo">
                          <div className="lindet-hrow">
                            <h4 className="lindet-h">
                              <i className="fas fa-cube lindet-h-ic" /> Stock
                            </h4>
                            <ProveedorLinea producto={l.producto} />
                          </div>
                          <StockPanel
                            producto={l.producto}
                            cantidad={l.cantidad}
                            conProveedor={false}
                          />
                        </section>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
