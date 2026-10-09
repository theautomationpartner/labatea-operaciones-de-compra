import { createElement } from 'react'
import { getLeyendaOrdenCompra } from '@/services/monday/configuracion'
import { limpiarNombre, logoComoDataUrl } from './comun'
import type { DatosOrdenCompraPdf } from './OrdenCompraPdf'

/**
 * La leyenda vigente cuando se pasó a Monday ("⚙️Configuracion - Sistema" → "✋Leyenda Orden de
 * Compra"). Sólo se usa si Monday no responde al emitir.
 */
const LEYENDA_RESPALDO =
  'ATENCIÓN! En CAPITAL FEDERAL entregar la mercadería únicamente en TRANSPORTE ALBORADA. Dirección: Pedro Luis Baliña 4077. Teléfono: 011-4911-8305. Horario de atención: 09 a 15 hs.'

/**
 * Nombre del archivo de la orden, sin extensión: "Proveedor-Nro. de orden"
 * ("LABORATORIO WEIZUR ARGENTINA S.A.-OC-006"). Es el nombre con el que queda en Monday, el título
 * de la pestaña y el que recibe el proveedor.
 */
export function nombreOrdenCompraPdf(proveedor: string, numero: string): string {
  return `${limpiarNombre(proveedor)}-${limpiarNombre(numero)}`
}

/**
 * Genera el PDF de la orden de compra EN EL NAVEGADOR y lo devuelve como archivo, listo para
 * abrirlo en una pestaña, mandarlo al proveedor y subirlo al ítem al registrarlo. Mismo mecanismo
 * que el presupuesto de "Operaciones de venta".
 *
 * react-pdf entra por `import()`: es una librería pesada que sólo hace falta en este paso, así que
 * Vite la deja en un chunk aparte y no engorda la carga inicial de la app.
 */
export async function generarOrdenCompraPdf(
  datos: Omit<DatosOrdenCompraPdf, 'nombre' | 'leyenda'> & { leyenda?: string },
): Promise<File> {
  const nombre = nombreOrdenCompraPdf(datos.proveedor.name, datos.numero)
  const [{ pdf }, { OrdenCompraPdf }, logoSrc, leyenda] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./OrdenCompraPdf'),
    datos.logoSrc ? logoComoDataUrl(datos.logoSrc) : Promise.resolve(undefined),
    /* La leyenda del pie se lee de Monday en cada emisión, así un cambio en la configuración rige
       desde el próximo documento. Si no se puede leer, sale la última conocida: la orden no puede
       quedar sin las condiciones de entrega. */
    datos.leyenda ?? getLeyendaOrdenCompra().catch(() => LEYENDA_RESPALDO),
  ])
  // `pdf()` pide un <Document>; el componente lo es, pero su tipo no lo dice.
  const documento = createElement(OrdenCompraPdf, { ...datos, nombre, logoSrc, leyenda }) as unknown as Parameters<
    typeof pdf
  >[0]
  const blob = await pdf(documento).toBlob()
  return new File([blob], `${nombre}.pdf`, { type: 'application/pdf' })
}
