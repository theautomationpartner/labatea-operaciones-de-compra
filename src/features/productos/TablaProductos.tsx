import { Fragment, useState } from 'react'
import { ConsignadoTag } from '@/components/ui/Etiquetas'
import {
  avisoCompraMinima,
  avisoEnvaseModificado,
  cantPorEnvase,
  envaseModificado,
  envasesDe,
  formatoEnvases,
  ivaLinea,
  respetaEnvase,
  totalLinea,
} from '@/lib/compras'
import { money, pctDec } from '@/lib/format'
import type { LineaCompra } from '@/types'
import { DetalleCosto } from './DetalleCosto'
import { MAX_QBOX, QboxNumero } from './QboxNumero'
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
  /** Alterar la "Cant x Envase" de una línea. Sin handler, la columna es de sólo lectura. */
  onEnvase?: (id: string, cantXUnidad: number) => void
}

/**
 * Tabla de líneas de la orden de compra. Misma estructura y mismo comportamiento que la de la app
 * de ventas —fila desplegable con el detalle de stock, cantidad con botones, tacho para quitar—,
 * con las columnas propias de una compra: unidad de compra, cuántas unidades trae cada envase,
 * cuántos envases se piden y el costo de reposición, en vez de precio de lista, descuento y
 * rentabilidad.
 */
export function TablaProductos({
  titulo,
  lineas,
  onRemove,
  onCantidad,
  onEnvase,
}: TablaProductosProps) {
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set())
  /* Desplegable, N°, producto, unidad de compra, cant x envase, cant de envase, cant total a
     pedir, costo final, IVA, subtotal y acciones. Es el `colSpan` de la fila desplegada: si se
     agrega o se quita una columna, hay que moverlo o el detalle deja de ocupar el ancho entero. */
  const COLUMNAS = 11

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
            <th className="ta-c">Tipo Envase Compra</th>
            <th className="ta-c">Cant x Envase</th>
            <th className="ta-c">Cant de Envase</th>
            <th className="ta-c">Cant Total a Pedir</th>
            <th className="ta-r">Costo Final</th>
            <th className="ta-r">IVA</th>
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
            // Excepción cargada por Compras/Administración: se marca en rojo, no se corrige.
            const fuera = !respetaEnvase(l.producto, l.cantidad)
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
                    {l.producto.consignado && <ConsignadoTag />}
                  </td>

                  <td className="ta-c">{l.producto.unidadCompra || '—'}</td>
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    {/* Alterada en esta orden: borde amarillo, badge de advertencia y el mensaje
                        SÓLO al pasar el mouse (acá no se escribe en ningún otro lado). */}
                    {onEnvase ? (
                      <QboxNumero
                        texto={String(escalon)}
                        min={1}
                        onEscribir={(n) => onEnvase(l.id, n)}
                        onSubir={() => onEnvase(l.id, escalon + 1)}
                        onBajar={() => onEnvase(l.id, escalon - 1)}
                        subirDeshabilitado={escalon >= MAX_QBOX}
                        bajarDeshabilitado={escalon <= 1}
                        ariaLabel={`Cant x Envase de ${l.producto.nombre}`}
                        ariaSubir={`Sumar uno a la Cant x Envase de ${l.producto.nombre}`}
                        ariaBajar={`Restar uno a la Cant x Envase de ${l.producto.nombre}`}
                        className={envaseModificado(l.producto) ? 'qbox--envase-mod' : ''}
                        title={envaseModificado(l.producto) ? avisoEnvaseModificado(l.producto) : undefined}
                      >
                        {envaseModificado(l.producto) && (
                          <i className="fas fa-triangle-exclamation envase-mod-badge" aria-hidden="true" />
                        )}
                      </QboxNumero>
                    ) : envaseModificado(l.producto) ? (
                      <span className="envase-mod-box" title={avisoEnvaseModificado(l.producto)}>
                        {escalon}
                        <i className="fas fa-triangle-exclamation envase-mod-badge" aria-hidden="true" />
                      </span>
                    ) : (
                      escalon
                    )}
                  </td>

                  {/* ENVASES, que es la unidad en la que se le pide al proveedor. Se escriben o se
                      mueven de a uno; internamente la línea sigue guardando UNIDADES, así que un
                      envase son `escalon` unidades. No baja del primer envase: una línea en cero
                      no es una línea, es quitarla, y para eso está el tacho. */}
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    <QboxNumero
                      texto={formatoEnvases(envases)}
                      min={1}
                      onEscribir={(n) => onCantidad(l.id, n * escalon)}
                      onSubir={() => onCantidad(l.id, l.cantidad + escalon)}
                      onBajar={() => onCantidad(l.id, l.cantidad - escalon)}
                      subirDeshabilitado={envases >= MAX_QBOX}
                      bajarDeshabilitado={envases <= 1}
                      ariaLabel={`Envases a comprar de ${l.producto.nombre}`}
                      ariaSubir={`Sumar un envase de ${l.producto.nombre}`}
                      ariaBajar={`Restar un envase de ${l.producto.nombre}`}
                      className={fuera ? 'qbox--fuera' : ''}
                      title={
                        fuera
                          ? avisoCompraMinima(l.producto)
                          : `Cada envase trae ${escalon} ${escalon === 1 ? 'unidad' : 'unidades'}`
                      }
                    />
                  </td>

                  {/* Las unidades que salen de esos envases: Cant x Envase × Cant de Envase. Es la
                      escala en la que se mueve el stock. */}
                  <td className="ta-c" style={{ fontWeight: 600 }}>
                    {l.cantidad}
                    {fuera && (
                      <i
                        className="fas fa-triangle-exclamation tabla-fuera-ic"
                        title={avisoCompraMinima(l.producto)}
                        aria-label="No respeta la compra mínima"
                      />
                    )}
                  </td>
                  {/* Lo que cuesta UN envase, tal cual lo publica el Maestro. */}
                  <td className="ta-r" style={{ fontWeight: 600 }}>
                    {money(l.producto.costoReposicion)}
                  </td>
                  {/* IVA de la línea: el subtotal por la alícuota del producto ("✋IVA" del Maestro). */}
                  <td className="ta-r" style={{ fontWeight: 600 }}>
                    {(() => {
                      const iva = ivaLinea(l.producto, l.cantidad)
                      return iva === null ? (
                        <span className="tabla-iva-falta" title="El producto no tiene el IVA cargado en el Maestro">
                          —
                        </span>
                      ) : (
                        <>
                          {money(iva)}
                          <span className="tabla-iva-pct">{pctDec(l.producto.iva ?? 0)}</span>
                        </>
                      )
                    })()}
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
                            `lindet` lo pone en dos columnas con un filete en el medio: el detalle
                            del costo a la izquierda y el stock a la derecha, como en la carga. */}
                        <div className="lindet">
                          {/* Izquierda: cómo se llega al costo final. Derecha: el stock del producto. */}
                          <DetalleCosto producto={l.producto} />
                          <section className="lindet-stock">
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
