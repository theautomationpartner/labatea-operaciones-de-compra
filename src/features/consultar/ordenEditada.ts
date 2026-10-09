/**
 * La orden de compra después de editarla: se vuelve a generar su PDF con las cantidades nuevas, se
 * reemplaza el que estaba en Monday y, si el usuario lo pide, se le manda al proveedor.
 *
 * Usa el MISMO documento y el MISMO envío por Make.com que la emisión de la orden, así que el
 * proveedor recibe exactamente el formato de siempre.
 */
import { generarOrdenCompraPdf } from '@/features/emision/pdf/generarOrdenCompraPdf'
import { LOGO_DOCUMENTOS } from '@/features/emision/pdf/comun'
import { fechaHoyAR, filasOrden, totalOrden } from '@/lib/ordenDoc'
import { casillaDeEnvio } from '@/lib/permisos'
import { enviarOrdenCompraMake } from '@/services/make/envioOrdenCompra'
import { crearUpdate, getContactosProveedor } from '@/services/monday'
import { reemplazarPdfOrden, type LineaOrden, type OrdenEnCurso } from '@/services/monday/consultaOrdenes'
import { getProveedorPorId } from '@/services/monday/personas'
import { getProductosPorIds } from '@/services/monday/productos'
import type { Comprador, LineaCompra, Proveedor } from '@/types'

/** Un rechazo que se le muestra al usuario tal cual (no es una caída de Monday). */
export class ErrorOperacion extends Error {}

export interface OrdenRegenerada {
  pdf: File
  proveedor: Proveedor
  total: number
}

/**
 * Genera el PDF de la orden con las líneas ya editadas y lo deja en Monday en lugar del anterior.
 *
 * El costo de cada línea es el que quedó guardado en la orden (no el de hoy en el Maestro): editar
 * cantidades no puede cambiarle el precio a lo que ya se pactó. Del Maestro sólo salen el código y
 * el desglose de descuentos y bonificación que imprime el documento.
 */
export async function regenerarPdfOrden(
  orden: Pick<OrdenEnCurso, 'id' | 'numero' | 'proveedorId'>,
  lineas: readonly LineaOrden[],
): Promise<OrdenRegenerada> {
  if (!orden.proveedorId) throw new ErrorOperacion('La orden no tiene proveedor conectado en el sistema.')
  const pedidas = lineas.filter((l) => l.pedida > 0)
  const [proveedor, productos] = await Promise.all([
    getProveedorPorId(orden.proveedorId),
    getProductosPorIds([...new Set(pedidas.map((l) => l.productoId))]),
  ])
  if (!proveedor) throw new ErrorOperacion('El proveedor de la orden ya no existe en el sistema.')

  const lineasCompra: LineaCompra[] = pedidas.map((l) => {
    const producto = productos.find((p) => p.id === l.productoId)
    if (!producto) throw new ErrorOperacion(`El producto «${l.nombre}» ya no existe en el Maestro de Productos.`)
    return {
      id: l.subId,
      producto: {
        ...producto,
        costoReposicion: l.costo || producto.costoReposicion,
        iva: l.ivaTasa ?? producto.iva,
        cantXUnidad: l.cantXEnvase,
      },
      cantidad: l.pedida,
    }
  })

  const total = totalOrden(lineasCompra)
  const pdf = await generarOrdenCompraPdf({
    numero: orden.numero,
    proveedor: { name: proveedor.name, addr: proveedor.addr },
    filas: filasOrden(lineasCompra),
    total,
    logoSrc: LOGO_DOCUMENTOS,
  })
  await reemplazarPdfOrden(orden.id, pdf)
  return { pdf, proveedor, total }
}

/**
 * Manda la orden editada a los contactos del proveedor que aceptan órdenes de compra, por correo,
 * y deja constancia en la orden.
 */
export async function enviarOrdenEditada(
  orden: Pick<OrdenEnCurso, 'id' | 'numero' | 'fechaEmision'>,
  regenerada: OrdenRegenerada,
  comprador: Comprador | null,
): Promise<void> {
  const contactos = (await getContactosProveedor(regenerada.proveedor.id)).filter((c) => c.ok && c.email.trim())
  if (contactos.length === 0) {
    throw new ErrorOperacion(
      'El proveedor no tiene contactos con correo que acepten órdenes de compra. Cargalos en el sistema y volvé a intentar.',
    )
  }
  const r = await enviarOrdenCompraMake({
    numero: orden.numero,
    fechaEmision: orden.fechaEmision ? orden.fechaEmision.split('-').reverse().join('/') : '',
    proveedor: regenerada.proveedor,
    comprador,
    casilla: casillaDeEnvio(comprador),
    medio: 'Email',
    contactos,
    total: regenerada.total,
    pdf: regenerada.pdf,
    reenvioPorEdicion: { fecha: fechaHoyAR() },
  })
  if (!r.ok) throw new ErrorOperacion(r.mensaje)
  await crearUpdate(
    orden.id,
    `Orden N°${orden.numero} editada reenviada al proveedor (${contactos.map((c) => c.email).join(', ')}).`,
  )
}
