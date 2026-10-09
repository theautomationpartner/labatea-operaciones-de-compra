/**
 * ACTUALIZACIÓN DE PRECIOS: lectura y escritura del costo en el "📦Maestro de Productos".
 *
 * El costo que se actualiza es "✋️Costo x Unid" (el de lista del proveedor). "🤖Costo de
 * Reposicion" NO se toca: es una fórmula que sale de ése, los descuentos, la bonificación y el
 * flete, y se recalcula sola.
 *
 * Al confirmar una actualización —por Excel o por porcentaje— pasan siempre las mismas tres cosas,
 * en este orden:
 *   1. se escriben el costo nuevo y su "✋Variacion Costo" en cada producto (y los descuentos y la
 *      bonificación, si la lista los cambia), en mutations masivas de hasta 50 productos;
 *   2. se registra la actividad "Actualización de precio" en el widget Emails & Activities de cada
 *      producto: así cada uno acumula todas sus actualizaciones, no sólo la última;
 *   3. si fue una lista entera, se anota la fecha en "🤖Última Actualización de Lista" del
 *      proveedor: es contra lo que se van a medir los recordatorios.
 */
import { round2 } from '@/lib/format'
import type { CambioCosto } from '@/lib/listaExcel'
import type { ProductoPrecio } from '@/lib/precios'
import type { TipoActualizacion } from '@/lib/precios'
import {
  BOARD_PRODUCTOS_PRECIOS,
  BOARDS,
  COL,
  ESTADO_LIQUIDACION_INDEX,
  MODO_PRECIOS,
} from './columns'
import { byId, num, sumaMirror, valor, type CV, type MondayItem } from './parse'
import { mondayApi } from './sdk'
import { crearActividadesPrecio } from './actividades'

const COLUMNAS_PRECIO = JSON.stringify([
  COL.producto.codigo,
  COL.producto.codigoProveedor,
  COL.producto.costoUnid,
  ...COL.producto.descuentos,
  COL.producto.bonifMercaderia,
  COL.producto.flete,
  COL.producto.margenL1,
  COL.producto.descuentoL2,
  COL.producto.descuentoL3,
  COL.producto.margenL7,
  COL.producto.margenL8,
  COL.producto.imagen,
])

/* `assets` trae la URL firmada de la foto (vale una hora: alcanza para la sesión de la pantalla).
   Se pide junto con el valor de la columna para saber CUÁL de los archivos del ítem es la foto. */
const SELECCION = `id name assets { id public_url } column_values(ids: ${COLUMNAS_PRECIO}) { id text value }`

type ItemConAssets = MondayItem & { assets?: { id: string; public_url: string }[] }

/** La foto del producto: el primer archivo de "🤖Imagen de Producto" que sea imagen. */
function imagenDe(item: ItemConAssets, cv?: CV & { value?: string | null }): string | null {
  try {
    const archivos = (JSON.parse(cv?.value ?? '{}') as { files?: { assetId?: number; isImage?: string }[] }).files ?? []
    const foto = archivos.find((f) => String(f.isImage) === 'true') ?? archivos[0]
    if (!foto?.assetId) return null
    return item.assets?.find((a) => a.id === String(foto.assetId))?.public_url ?? null
  } catch {
    return null
  }
}

function mapProductoPrecio(item: ItemConAssets): ProductoPrecio {
  const c = byId(item)
  const n = (id: string) => num(c[id]?.text)
  return {
    id: item.id,
    nombre: item.name,
    codigo: valor(c[COL.producto.codigo]),
    codigoProveedor: valor(c[COL.producto.codigoProveedor]),
    costo: n(COL.producto.costoUnid),
    imagen: imagenDe(item, c[COL.producto.imagen]),
    descuentos: COL.producto.descuentos.map(n).filter((d) => d !== 0),
    bonif: n(COL.producto.bonifMercaderia),
    flete: n(COL.producto.flete),
    margenL1: n(COL.producto.margenL1),
    descuentoL2: n(COL.producto.descuentoL2),
    descuentoL3: n(COL.producto.descuentoL3),
    margenL7: n(COL.producto.margenL7),
    margenL8: n(COL.producto.margenL8),
  }
}

/** TODOS los productos asociados al proveedor en "🤖Proveedor", paginando de a 200. */
export async function getProductosDeProveedor(proveedorId: string): Promise<ProductoPrecio[]> {
  const qp = {
    rules: [{ column_id: COL.producto.proveedor, compare_value: [Number(proveedorId)], operator: 'any_of' }],
  }
  const items: ItemConAssets[] = []
  const primera = await mondayApi<{ boards: { items_page: { cursor: string | null; items: ItemConAssets[] } }[] }>(
    `query ($qp: ItemsQuery) { boards(ids: [${BOARD_PRODUCTOS_PRECIOS}]) { items_page(limit: 200, query_params: $qp) { cursor items { ${SELECCION} } } } }`,
    { qp },
  )
  let pagina = primera.boards[0]?.items_page
  while (pagina) {
    items.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: { cursor: string | null; items: ItemConAssets[] } } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${SELECCION} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return items.map(mapProductoPrecio).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Un producto del proveedor con ventas de consignación que todavía no se le liquidaron. */
export interface PendienteLiquidacion {
  producto: string
  /**
   * Por qué no está liquidado: la etiqueta de "🤖Estado de Liquidacion" ("Parcialmente Liquidado",
   * "Sin Liquidar") o, si el estado está vacío, lo que dicen sus cantidades.
   */
  estado: string
}

/**
 * Lo que el proveedor tiene pendiente de liquidar en "Venta Pend de Liq CYO".
 *
 * Se traen TODOS los ítems que NO están en "Liquidado 100%" (por ÍNDICE: `not_any_of [1]`), lo que
 * incluye a los que tienen el estado VACÍO: una venta sin estado no está liquidada, y dejarla pasar
 * permitiría cambiar los costos con consignación sin rendir. De esos se quedan los que apuntan a un
 * producto del proveedor. Un mismo producto se lista una vez por estado.
 *
 * El tablero no tiene proveedor propio: el cruce es por id del producto y, si no coincide, por
 * "✋Codigo Interno" (el tablero apunta SIEMPRE al Maestro de producción, así que en modo TEST los ids
 * de los productos son otros y la única forma de reconocerlos es por el código).
 */
export async function getPendientesLiquidacion(
  productos: readonly { id: string; nombre: string; codigo: string }[],
): Promise<PendienteLiquidacion[]> {
  const porId = new Map(productos.map((p) => [p.id, p.nombre]))
  const porCodigo = new Map(productos.filter((p) => p.codigo.trim()).map((p) => [p.codigo.trim(), p.nombre]))
  const qp = {
    rules: [
      {
        column_id: COL.ventaPendLiqCyo.estado,
        compare_value: [ESTADO_LIQUIDACION_INDEX.liquidado],
        operator: 'not_any_of',
      },
    ],
  }
  const cols = JSON.stringify([
    COL.ventaPendLiqCyo.producto,
    COL.ventaPendLiqCyo.estado,
    COL.ventaPendLiqCyo.pendLiq,
    COL.ventaPendLiqCyo.cantLiq,
  ])
  const sel = `id column_values(ids: ${cols}) { id text ... on StatusValue { index label } ... on FormulaValue { display_value } ... on MirrorValue { display_value } ... on BoardRelationValue { linked_items { id column_values(ids: ["${COL.producto.codigo}"]) { id text } } } }`
  type Item = { id: string; column_values: (CV & { label?: string | null })[] }
  const items: Item[] = []
  const primera = await mondayApi<{ boards: { items_page: { cursor: string | null; items: Item[] } }[] }>(
    `query ($qp: ItemsQuery) { boards(ids: [${BOARDS.ventaPendLiqCyo}]) { items_page(limit: 500, query_params: $qp) { cursor items { ${sel} } } } }`,
    { qp },
  )
  let pagina = primera.boards[0]?.items_page
  while (pagina) {
    items.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: { cursor: string | null; items: Item[] } } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${sel} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }

  const vistos = new Set<string>()
  const pendientes: PendienteLiquidacion[] = []
  for (const it of items) {
    const c = byId(it) as Record<string, CV & { label?: string | null }>
    const etiqueta = c[COL.ventaPendLiqCyo.estado]?.label ?? c[COL.ventaPendLiqCyo.estado]?.text ?? ''
    const estado = etiqueta.trim() || estadoPorCantidades(c)
    for (const vinculado of c[COL.ventaPendLiqCyo.producto]?.linked_items ?? []) {
      const codigo = valor(byId(vinculado)[COL.producto.codigo]).trim()
      const producto = porId.get(String(vinculado.id)) ?? (codigo ? porCodigo.get(codigo) : undefined)
      const clave = `${producto}|${estado}`
      if (!producto || vistos.has(clave)) continue
      vistos.add(clave)
      pendientes.push({ producto, estado })
    }
  }
  return pendientes.sort((a, b) => a.producto.localeCompare(b.producto, 'es'))
}

/**
 * El estado de una venta con "🤖Estado de Liquidacion" vacío, según sus cantidades: nada liquidado
 * es "Sin Liquidar"; algo liquidado y algo pendiente, "Parcialmente Liquidado". Si las cantidades
 * no alcanzan para decidir, "Sin estado de liquidación": igual bloquea, porque no está en 100%.
 */
function estadoPorCantidades(c: Record<string, CV>): string {
  const pend = num(valor(c[COL.ventaPendLiqCyo.pendLiq]))
  const liq = sumaMirror(c[COL.ventaPendLiqCyo.cantLiq])
  if (pend > 0 && liq > 0) return 'Parcialmente Liquidado'
  if (pend > 0) return 'Sin Liquidar'
  return 'Sin estado de liquidación'
}

/* ===== Confirmación ===== */

export interface DatosActualizacion {
  tipo: TipoActualizacion
  cambios: readonly CambioCosto[]
  /** El proveedor de la lista. En la actualización por artículo puede no haber uno. */
  proveedor: { id: string; name: string } | null
  usuario: { id: string; name: string } | null
  porcentaje?: number
}

export interface ResultadoActualizacion {
  actualizados: number
  /** Lo que no se pudo completar, para decirlo en pantalla sin deshacer lo hecho. */
  avisos: string[]
  /** Cuándo se confirmó: la fecha de la actualización. */
  fecha: Date
}

/**
 * Cuántos productos se escriben en UNA mutation (cada uno es un alias de
 * `change_multiple_column_values`). Una lista de hasta 50 productos se actualiza en una sola
 * consulta; una más larga, en tandas de 50 —lo que entra holgado en el límite de complejidad de
 * Monday por consulta—.
 */
const TAMANIO_LOTE = 50

/** Escribe costo y variación en cada producto, en lotes con alias. Devuelve cuántos entraron. */
async function escribirCostos(
  cambios: readonly CambioCosto[],
  onLote?: (hechos: number) => void,
): Promise<number> {
  let hechos = 0
  for (let desde = 0; desde < cambios.length; desde += TAMANIO_LOTE) {
    const lote = cambios.slice(desde, desde + TAMANIO_LOTE)
    const declaraciones = lote.map((_, i) => `$id${i}: ID!, $cv${i}: JSON!`).join(', ')
    const raices = lote
      .map(
        (_, i) =>
          `  c${i}: change_multiple_column_values(item_id: $id${i}, board_id: ${BOARD_PRODUCTOS_PRECIOS}, column_values: $cv${i}) { id }`,
      )
      .join('\n')
    const variables: Record<string, unknown> = {}
    lote.forEach((c, i) => {
      variables[`id${i}`] = c.producto.id
      variables[`cv${i}`] = JSON.stringify({
        [COL.producto.costoUnid]: round2(c.nuevo),
        ...(c.variacion !== null ? { [COL.producto.variacionCosto]: c.variacion } : {}),
        /* Las condiciones nuevas de la lista, sólo si cambiaron. Los cuatro descuentos se escriben
           juntos —los que no vienen, en cero— porque son una cascada: dejar un "Descuento 3" viejo
           detrás de dos nuevos cambiaría el costo final. */
        ...(c.descuentos
          ? Object.fromEntries(COL.producto.descuentos.map((col, k) => [col, c.descuentos![k] ?? 0]))
          : {}),
        ...(c.bonif !== undefined ? { [COL.producto.bonifMercaderia]: c.bonif } : {}),
      })
    })
    const data = await mondayApi<Record<string, { id: string } | null>>(
      `mutation (${declaraciones}) {\n${raices}\n}`,
      variables,
    )
    hechos += lote.filter((_, i) => data[`c${i}`]?.id).length
    onLote?.(desde + lote.length)
  }
  return hechos
}

const pct = (v: number | null) =>
  v === null ? 's/ variación' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** El texto del historial que queda en el producto. */
const pctLista = (ds: readonly number[]) =>
  ds.length ? ds.map((x) => `${x.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`).join(' + ') : 'sin descuentos'

const fechaCorta = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Lo que dice la actividad "Actualización de precio" del producto. Si la lista cambió también los
 * descuentos o la bonificación, se agregan; quién la hizo, al final.
 */
const textoActividad = (c: CambioCosto, d: DatosActualizacion, cuando: Date) =>
  [
    `Se actualizó el precio del producto de ${pesos(c.anterior)} a ${pesos(c.nuevo)}, el día ${fechaCorta(cuando)}.`,
    ...(c.descuentos ? [`Descuentos nuevos: ${pctLista(c.descuentos)}.`] : []),
    ...(c.bonif !== undefined
      ? [`Bonificación en mercadería nueva: ${c.bonif.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%.`]
      : []),
    `Variación: ${pct(c.variacion)} · Proveedor: ${d.proveedor?.name ?? '—'} · Actualizado por: ${d.usuario?.name ?? '—'}.`,
  ].join('\n')

/** Anota en el proveedor la fecha de su última actualización de lista. */
async function anotarUltimaActualizacion(proveedorId: string, cuando: Date) {
  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $cv: JSON!) {
      change_multiple_column_values(item_id: $id, board_id: $board, column_values: $cv) { id }
    }`,
    {
      id: proveedorId,
      board: BOARDS.personas,
      cv: JSON.stringify({
        [COL.personaCompras.ultimaActualizacionLista]: { date: cuando.toISOString().slice(0, 10) },
      }),
    },
  )
}

/** Avance de la escritura: en qué parte va y cuántos productos lleva de esa parte. */
export type AvanceEscritura = (fase: 'costos' | 'actividades', hechos: number, total: number) => void

/**
 * Confirma una actualización de costos. Los costos se escriben PRIMERO, en mutations masivas de
 * hasta 50 productos: es lo que importa. La actividad en cada producto se intenta igual aunque algo
 * falle, y lo que no se pudo hacer vuelve como aviso.
 */
export async function aplicarActualizacion(
  d: DatosActualizacion,
  onAvance: AvanceEscritura = () => {},
): Promise<ResultadoActualizacion> {
  const cuando = new Date()
  const avisos: string[] = []
  const total = d.cambios.length

  onAvance('costos', 0, total)
  const actualizados = await escribirCostos(d.cambios, (n) => onAvance('costos', n, total))
  if (actualizados < d.cambios.length) {
    avisos.push(`Se actualizaron ${actualizados} de ${d.cambios.length} productos. Revisá los faltantes en Monday.`)
  }

  /* La actividad "Actualización de precio" en el widget Emails & Activities de cada producto: en
     una consulta masiva (o de a 50). */
  onAvance('actividades', 0, total)
  try {
    const actividades = await crearActividadesPrecio(
      d.cambios.map((c) => ({ itemId: c.producto.id, contenido: textoActividad(c, d, cuando) })),
      cuando,
      (n) => onAvance('actividades', n, total),
    )
    if (actividades < d.cambios.length) {
      avisos.push(`La actividad quedó registrada en ${actividades} de ${d.cambios.length} productos.`)
    }
  } catch {
    avisos.push('No se pudo registrar la actividad "Actualización de precio" en los productos.')
  }

  /* En modo TEST no se toca el proveedor real: su fecha es la que miden los recordatorios. */
  if (d.proveedor && d.tipo !== 'Artículo' && MODO_PRECIOS !== 'TEST') {
    try {
      await anotarUltimaActualizacion(d.proveedor.id, cuando)
    } catch {
      avisos.push('No se pudo anotar la fecha de última actualización en el proveedor.')
    }
  }

  return { actualizados, avisos, fecha: cuando }
}
