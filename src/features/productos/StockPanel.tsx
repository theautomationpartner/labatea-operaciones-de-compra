import { stockConIngreso } from '@/lib/selectors'
import type { Producto } from '@/types'

interface Caja {
  titulo: string
  valor: number
  fondo: string
  color: string
  icono: string
  /**
   * Cómo quedaría la métrica si la mercadería entrara. Se muestra EN VERDE al lado del valor base,
   * que no se toca: lo que hay en el tablero sigue siendo lo que hay hasta que la compra se
   * reciba, y pisarlo haría creer que el movimiento ya ocurrió.
   */
  proyectado?: number
}

/**
 * En una COMPRA la mercadería siempre ENTRA: no hay stock que consumir ni cobertura que medir.
 *
 * Es el mismo panel que usa el modo DEVOLUCION del remito en la app de ventas —la métrica
 * "Ingresos" al frente y las tres proyecciones al lado de cada base—, y por eso el componente no
 * tiene un prop de modo: acá el ingreso no es un caso especial, es el único caso.
 */
const cajas = (p: Producto, cantidad: number): Caja[] => {
  /* Las cuatro métricas se proyectan con las MISMAS fórmulas del tablero. La proyección acompaña
     a cada base; sólo "Ingresos" muestra el valor ya sumado, porque es la única métrica que la
     compra mueve de forma directa. */
  const pro = cantidad > 0 ? stockConIngreso(p, cantidad) : null
  return [
    {
      titulo: 'Ingresos',
      valor: pro ? pro.ingresos : p.ingresos,
      fondo: '#e0f7f4',
      color: '#00897b',
      icono: 'fa-inbox',
    },
    {
      titulo: 'Stock físico',
      valor: p.fisico,
      proyectado: pro?.fisico,
      fondo: '#e5f0ff',
      color: 'var(--primary-blue)',
      icono: 'fa-box',
    },
    {
      titulo: 'Stock comercial',
      valor: p.comercial,
      proyectado: pro?.comercial,
      fondo: '#e6f9f0',
      color: 'var(--green-dark)',
      icono: 'fa-lock-open',
    },
    {
      titulo: 'Stock disponible',
      valor: p.disponible,
      proyectado: pro?.disponible,
      fondo: '#f0e6ff',
      color: '#6200ee',
      icono: 'fa-pallet',
    },
  ]
}

/**
 * Proveedor y tipo de mercadería en UNA sola línea: código, razón social y tipo. Se renderiza
 * suelto (en la cabecera del detalle de la línea) o dentro del panel de stock.
 */
export function ProveedorLinea({ producto }: { producto: Producto }) {
  const esConsignada = producto.tipo.trim().toUpperCase() === 'CO'

  return (
    <div className="stock-prov">
      {/* Código del proveedor (mirror del maestro) y su razón social, uno al lado del otro. */}
      <span className="stock-prov-cod">{producto.provCod || '—'}</span>
      <span className="stock-prov-name">{producto.provNombre || 'Sin proveedor asignado'}</span>
      {/* La mercadería consignada se distingue a simple vista. */}
      <span className={`stock-tipo ${esConsignada ? 'stock-tipo--consignada' : ''}`}>
        Tipo: <b>{producto.tipo || '—'}</b>
      </span>
    </div>
  )
}

interface StockPanelProps {
  producto: Producto
  /** Unidades en curso: es lo que se proyecta sobre el stock. */
  cantidad: number
  /** El detalle de la línea lo muestra en su cabecera: ahí se omite para no repetirlo. */
  conProveedor?: boolean
}

/** Detalle de proveedor y stock; se reutiliza en la carga y en la fila expandida de la tabla. */
export function StockPanel({ producto, cantidad, conProveedor = true }: StockPanelProps) {
  return (
    <div className="stock">
      {conProveedor && <ProveedorLinea producto={producto} />}

      <div className="stock-main">
        <div className="stock-boxes">
          {cajas(producto, cantidad).map((c) => (
            <div className="stock-box" key={c.titulo}>
              <div>
                <div className="stock-box-t">{c.titulo}</div>
                <div className="stock-box-v">
                  {c.valor}
                  {/* Cómo quedaría al recibir la compra, al lado del valor que hoy tiene el
                      tablero. El base no se toca: el movimiento todavía no ocurrió. */}
                  {c.proyectado != null && (
                    <span
                      className="stock-box-proy"
                      title={`Si se recibe esta compra, ${c.titulo.toLowerCase()} queda en ${c.proyectado}`}
                    >
                      +{c.proyectado}
                    </span>
                  )}
                </div>
              </div>
              <div className="stock-box-ic" style={{ background: c.fondo, color: c.color }}>
                <i className={`fas ${c.icono}`} />
              </div>
            </div>
          ))}
        </div>

        {/* La barra de cobertura no se dibuja: mide cuánto del disponible se LLEVA la línea, y
            acá la mercadería entra. Marcaría siempre lo mismo y el rótulo hablaría de algo que no
            está pasando. Queda sólo la nota, igual que en el modo DEVOLUCION del remito. */}
        <div className="cov-wrap">
          <div className="cov-note">
            Ingreso: {cantidad} {cantidad === 1 ? 'unidad' : 'unidades'} (impacta en tu stock
            físico al recibir la compra).
          </div>
        </div>
      </div>
    </div>
  )
}
