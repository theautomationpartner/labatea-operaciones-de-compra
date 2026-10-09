/**
 * La LISTA DE PRECIOS del proveedor en Excel, y los tipos del cambio de costo.
 *
 * Cada proveedor manda su lista con un formato distinto, así que la app no intenta entenderla: la
 * pasa a texto (una tabla CSV por hoja) y es la IA la que identifica qué columna es el código, cuál
 * el precio y qué fila corresponde a cada producto del Maestro (ver `api/_preciosIa.ts`).
 */
import { round2 } from '@/lib/format'

/** Tope del texto que se manda a la IA. Una lista normal ocupa una fracción de esto. */
const MAX_CARACTERES = 1_500_000

/** El archivo no se pudo leer como planilla, o no tiene datos. */
export class ListaIlegible extends Error {}

/**
 * La lista entera como texto: cada hoja con su nombre y sus filas en CSV. Las filas vacías se
 * descartan; todo lo demás (encabezados, logos de texto, notas) va tal cual, para que la IA vea la
 * lista como la ve una persona.
 */
export async function listaComoTexto(archivo: File): Promise<string> {
  // SheetJS se carga recién acá: pesa y sólo lo usa la actualización por lista.
  const XLSX = await import('xlsx')
  let libro
  try {
    libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  } catch {
    throw new ListaIlegible('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx / .xls) o un CSV.')
  }
  const partes = libro.SheetNames.map((nombre) => {
    const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre], { blankrows: false, strip: true })
    return csv.trim() ? `### Hoja: ${nombre}\n${csv}` : ''
  }).filter(Boolean)
  const texto = partes.join('\n\n')
  if (!texto) throw new ListaIlegible('El archivo no tiene datos.')
  if (texto.length > MAX_CARACTERES) {
    throw new ListaIlegible('La lista es demasiado grande para analizarla de una vez. Dejá sólo las hojas de precios.')
  }
  return texto
}

/**
 * Número tecleado por el usuario (o leído de una celda). Acepta "1.234,56" (AR), "1,234.56" (US)
 * o "$ 1234": el separador decimal es el ÚLTIMO de los dos que aparezca.
 */
export function numeroDeCelda(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  let t = String(valor ?? '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(t)) return null
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) {
    // Están los dos: el decimal es el último.
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (punto >= 0) {
    /* Sólo puntos: "52.836" son miles, no decimales. Se toman como miles si hay más de uno o si
       después del último vienen exactamente tres dígitos. */
    const miles = (t.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(t)
    if (miles) t = t.replace(/\./g, '')
  } else if (coma >= 0) {
    // Sólo comas: una es el decimal argentino; varias, separadores de miles.
    t = (t.match(/,/g) ?? []).length > 1 ? t.replace(/,/g, '') : t.replace(',', '.')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Un producto del Maestro visto desde la actualización de costos. */
export interface ProductoCosto {
  id: string
  nombre: string
  codigo: string
  codigoProveedor: string
  /** "✋️Costo x Unid": el costo vigente. */
  costo: number
}

/** Un cambio de costo propuesto, antes de confirmarlo. */
export interface CambioCosto {
  producto: ProductoCosto
  anterior: number
  nuevo: number
  /** Variación porcentual; `null` si el costo anterior era 0 (no hay contra qué comparar). */
  variacion: number | null
  /** Descuentos 1..4 nuevos, en %, sólo si la lista los cambia. */
  descuentos?: number[]
  /** Bonificación en mercadería nueva, en %, sólo si la lista la cambia. */
  bonif?: number
}

export const variacionPct = (anterior: number, nuevo: number): number | null =>
  anterior > 0 ? round2(((nuevo - anterior) / anterior) * 100) : null

export const cambio = (producto: ProductoCosto, nuevo: number): CambioCosto => ({
  producto,
  anterior: producto.costo,
  nuevo: round2(nuevo),
  variacion: variacionPct(producto.costo, round2(nuevo)),
})
