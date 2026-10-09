import { createElement } from 'react'
import { LOGO_DOCUMENTOS, limpiarNombre, logoComoDataUrl } from '@/features/emision/pdf/comun'
import type { ActualizacionHecha } from '@/lib/precios'

/** "dd-mm-yyyy" de la actualización: va en el nombre del archivo. */
const fechaArchivo = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-')

/**
 * Nombre del archivo, sin extensión: "Proveedor-Actualizacion de Costos-dd-mm-yyyy". Es el que
 * queda en el registro de Monday y el que recibe el equipo.
 */
export function nombreActualizacionCostosPdf(a: ActualizacionHecha): string {
  return `${limpiarNombre(a.proveedor.name)}-Actualizacion de Costos-${fechaArchivo(a.fecha)}`
}

/**
 * Genera el comprobante de la actualización EN EL NAVEGADOR con React-PDF, igual que la orden de
 * compra. La librería entra por `import()`: es pesada y sólo hace falta en la última etapa.
 */
export async function generarActualizacionCostosPdf(a: ActualizacionHecha): Promise<File> {
  const nombre = nombreActualizacionCostosPdf(a)
  const [{ pdf }, { ActualizacionCostosPdf }, logoSrc] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./ActualizacionCostosPdf'),
    logoComoDataUrl(LOGO_DOCUMENTOS),
  ])
  // `pdf()` pide un <Document>; el componente lo es, pero su tipo no lo dice.
  const documento = createElement(ActualizacionCostosPdf, { actualizacion: a, nombre, logoSrc }) as unknown as Parameters<
    typeof pdf
  >[0]
  const blob = await pdf(documento).toBlob()
  return new File([blob], `${nombre}.pdf`, { type: 'application/pdf' })
}
