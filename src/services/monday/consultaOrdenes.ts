/**
 * "Consultar Órdenes de Compra": las órdenes EN CURSO que todavía esperan mercadería.
 *
 * Lee directo del tablero de la orden lo que ya resolvieron sus automatizaciones: "🤖Estado de Recepcion" en "Pend de Recibir" o "Parcialmente Recibida", y
 * "🤖Estado de la Orden" en "En Curso". El filtro corre del lado de Monday.
 */
import { round2 } from '@/lib/format'
import { numeroSinPrefijo } from '@/lib/ordenDoc'
import { BOARDS, COL, ESTADO_ORDEN_INDEX, ESTADO_RECEPCION_INDEX } from './columns'
import { byId, num, sumaMirror, valor, type CV, type MondayItem } from './parse'
import { mondayApi, mondaySubirArchivo } from './sdk'
import { crearUpdate, fechaHoraLegible } from './updates'

export type EstadoRecepcion = 'pendiente' | 'parcial'

export interface OrdenEnCurso {
  id: string
  /** "🤖ID Compra" sin el prefijo del tablero ("OC-007" → "007"): el número que ve el usuario. */
  numero: string
  proveedorId: string | null
  proveedorNombre: string
  /** Fecha de emisión (ISO, YYYY-MM-DD). */
  fechaEmision: string | null
  /** Etiqueta de "🤖Estado de la Orden", tal cual la muestra Monday ("En Curso"). */
  estado: string
  /** Color de esa etiqueta en el tablero: la pastilla de la tabla se pinta igual. */
  colorEstado: string
  recepcion: EstadoRecepcion
  /** Etiqueta y color de "🤖Estado de Recepcion". */
  recepcionTexto: string
  colorRecepcion: string
  /** IDs de sus ítems en "Pend de Recibir Compra": de ahí salen las líneas al editarla. */
  pendIds: string[]
}

const COLUMNAS = [
  COL.ordenCompra.proveedor,
  COL.ordenCompra.fechaEmision,
  COL.ordenCompra.idCompra,
  COL.ordenCompra.estadoCancelacion,
  COL.ordenCompra.estadoRecepcion,
  COL.ordenCompra.pendRecibir,
]

const SELECCION = `
  id name
  column_values(ids: ${JSON.stringify(COLUMNAS)}) {
    id text
    ... on StatusValue { index label_style { color } }
    ... on BoardRelationValue { linked_item_ids linked_items { id name } }
  }
`

/* Monday no deja combinar `query_params` con `next_items_page`: la regla viaja sólo en la primera
   página, el cursor ya la recuerda. */
const FILTRO = `{
  operator: and,
  rules: [
    { column_id: "${COL.ordenCompra.estadoRecepcion}", compare_value: [${ESTADO_RECEPCION_INDEX.pendiente}, ${ESTADO_RECEPCION_INDEX.parcial}], operator: any_of },
    { column_id: "${COL.ordenCompra.estadoCancelacion}", compare_value: [${ESTADO_ORDEN_INDEX.enCurso}], operator: any_of }
  ]
}`

type Pagina = { cursor: string | null; items: MondayItem[] }

const colorDe = (cv?: CV) => (cv as { label_style?: { color?: string } | null } | undefined)?.label_style?.color ?? ''

async function leerOrdenes(): Promise<MondayItem[]> {
  const items: MondayItem[] = []
  const primera = await mondayApi<{ boards: { items_page: Pagina }[] }>(
    `query { boards(ids: [${BOARDS.ordenCompra}]) { items_page(limit: 200, query_params: ${FILTRO}) { cursor items { ${SELECCION} } } } }`,
  )
  let pagina: Pagina | undefined = primera.boards[0]?.items_page
  while (pagina) {
    items.push(...pagina.items)
    if (!pagina.cursor) break
    const sig: { next_items_page: Pagina } = await mondayApi(
      `query ($c: String!) { next_items_page(limit: 200, cursor: $c) { cursor items { ${SELECCION} } } }`,
      { c: pagina.cursor },
    )
    pagina = sig.next_items_page
  }
  return items
}

/** Las órdenes en curso con mercadería por recibir, de la más nueva a la más vieja. */
export async function getOrdenesEnCurso(): Promise<OrdenEnCurso[]> {
  return (await leerOrdenes())
    .map((o): OrdenEnCurso => {
      const c = byId(o)
      const proveedor = c[COL.ordenCompra.proveedor]?.linked_items?.[0]
      return {
        id: o.id,
        numero: numeroSinPrefijo(valor(c[COL.ordenCompra.idCompra])) || o.id,
        proveedorId: proveedor?.id ?? null,
        proveedorNombre: proveedor?.name ?? '—',
        fechaEmision: c[COL.ordenCompra.fechaEmision]?.text?.slice(0, 10) || null,
        estado: valor(c[COL.ordenCompra.estadoCancelacion]) || 'En Curso',
        colorEstado: colorDe(c[COL.ordenCompra.estadoCancelacion]),
        recepcion:
          c[COL.ordenCompra.estadoRecepcion]?.index === ESTADO_RECEPCION_INDEX.parcial ? 'parcial' : 'pendiente',
        recepcionTexto: valor(c[COL.ordenCompra.estadoRecepcion]),
        colorRecepcion: colorDe(c[COL.ordenCompra.estadoRecepcion]),
        pendIds: c[COL.ordenCompra.pendRecibir]?.linked_item_ids ?? [],
      }
    })
    .sort((a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? ''))
}

/**
 * URL del PDF de la orden ("🤖 Orden de Compra PDF"). Se pide en el momento del clic y no al
 * listar: la `public_url` de Monday vence a la hora. `null` = la orden no tiene PDF cargado.
 */
export async function urlPdfOrden(ordenId: string): Promise<string | null> {
  const data = await mondayApi<{ items: { assets: { public_url: string }[] }[] }>(
    `query ($ids: [ID!]) { items(ids: $ids) { assets(column_ids: ["${COL.ordenCompra.pdf}"]) { public_url } } }`,
    { ids: [ordenId] },
  )
  return data.items[0]?.assets?.[0]?.public_url ?? null
}

/* ===== Detalle de la orden: un renglón por producto ===== */

/**
 * Un producto de la orden, con lo que dicen su PENDIENTE DE RECIBIR y su SUBELEMENTO de la orden.
 * Se cruzan por el producto: los dos se crean juntos, uno por cada línea de la orden.
 */
export interface LineaOrden {
  /** Subelemento de la orden ("Subelementos de 🛒 Orden Compra"). */
  subId: string
  /** Ítem de "🚛 ❓ Pend de Recibir Compra". `null` si la orden no tiene pendiente para el producto. */
  pendId: string | null
  productoId: string
  nombre: string
  codigo: string
  /** "🤖 Unidad de Compra" del subelemento (o el envase del Maestro, si viene vacía). */
  unidad: string
  /** Unidades por envase al momento de la orden. Sin el dato, 1. */
  cantXEnvase: number
  /** Costo de UN envase, tal como quedó en la orden ("🤖Costo"). */
  costo: number
  pedida: number
  recibida: number
  pendiente: number
  estado: string
  colorEstado: string
}

const SUBITEMS_COLS = [
  COL.ordenCompraSub.producto,
  COL.ordenCompraSub.unidadCompra,
  COL.ordenCompraSub.cantXEnvase,
  COL.ordenCompraSub.cantEnvases,
  COL.ordenCompraSub.cantTotal,
  COL.ordenCompraSub.cantRecibida,
  COL.ordenCompraSub.estadoRecepcion,
  COL.ordenCompraSub.precio,
]
const PEND_COLS = [
  COL.pendRecibirCompra.producto,
  COL.pendRecibirCompra.qPedida,
  COL.pendRecibirCompra.qRemitada,
  COL.pendRecibirCompra.estado,
]
const SELECCION_CV = `
  id text
  ... on StatusValue { index label_style { color } }
  ... on MirrorValue { display_value }
  ... on FormulaValue { display_value }
  ... on BoardRelationValue {
    linked_item_ids
    linked_items { id name column_values(ids: ["${COL.producto.codigo}","${COL.producto.tipoEnvaseCompra}"]) { id text } }
  }
`

/** Los productos de la orden, en el orden en que se cargaron. */
export async function getLineasOrden(orden: Pick<OrdenEnCurso, 'id' | 'pendIds'>): Promise<LineaOrden[]> {
  const pendIds = orden.pendIds.slice(0, 100)
  const data = await mondayApi<{
    orden: { subitems: MondayItem[] | null }[]
    pends?: MondayItem[]
  }>(
    `query ($orden: [ID!]${pendIds.length ? ', $pends: [ID!]' : ''}) {
      orden: items(ids: $orden) {
        subitems { id name column_values(ids: ${JSON.stringify(SUBITEMS_COLS)}) { ${SELECCION_CV} } }
      }
      ${pendIds.length ? `pends: items(ids: $pends, limit: 100) { id name column_values(ids: ${JSON.stringify(PEND_COLS)}) { ${SELECCION_CV} } }` : ''}
    }`,
    pendIds.length ? { orden: [orden.id], pends: pendIds } : { orden: [orden.id] },
  )
  const pendPorProducto = new Map<string, MondayItem>()
  for (const p of data.pends ?? []) {
    const prod = byId(p)[COL.pendRecibirCompra.producto]?.linked_item_ids?.[0]
    if (prod && !pendPorProducto.has(prod)) pendPorProducto.set(prod, p)
  }

  return (data.orden[0]?.subitems ?? []).map((sub): LineaOrden => {
    const c = byId(sub)
    const producto = c[COL.ordenCompraSub.producto]?.linked_items?.[0]
    const pc = producto ? byId(producto) : {}
    const productoId = producto?.id ?? ''
    const pend = pendPorProducto.get(productoId)
    const pcv = pend ? byId(pend) : null

    /* Las cantidades salen del PENDIENTE, que es el que mueve la recepción; sin pendiente, del
       subelemento, que lleva las mismas columnas. */
    const pedida = pcv ? num(pcv[COL.pendRecibirCompra.qPedida]?.text) : num(c[COL.ordenCompraSub.cantTotal]?.text)
    const recibida = pcv
      ? sumaMirror(pcv[COL.pendRecibirCompra.qRemitada])
      : num(c[COL.ordenCompraSub.cantRecibida]?.text)
    const estadoPend = pcv?.[COL.pendRecibirCompra.estado]
    const estadoSub = c[COL.ordenCompraSub.estadoRecepcion]
    const estadoCv = estadoPend?.text ? estadoPend : estadoSub?.text ? estadoSub : null
    /* Sin "🤖 Cant x Envase" cargada, se deduce de lo que se pidió: unidades ÷ envases. */
    const envasesSub = num(c[COL.ordenCompraSub.cantEnvases]?.text)
    const unidadesSub = num(c[COL.ordenCompraSub.cantTotal]?.text)
    const cantXEnvase =
      num(c[COL.ordenCompraSub.cantXEnvase]?.text) || (envasesSub > 0 ? unidadesSub / envasesSub : 0)
    return {
      subId: sub.id,
      pendId: pend?.id ?? null,
      productoId,
      nombre: producto?.name ?? sub.name,
      codigo: valor(pc[COL.producto.codigo]),
      unidad: valor(c[COL.ordenCompraSub.unidadCompra]) || valor(pc[COL.producto.tipoEnvaseCompra]),
      cantXEnvase: cantXEnvase > 0 ? cantXEnvase : 1,
      costo: num(c[COL.ordenCompraSub.precio]?.text),
      pedida,
      recibida,
      pendiente: Math.max(0, pedida - recibida),
      estado: estadoCv?.text ?? (recibida > 0 ? 'Parcialmente Recibido' : 'Pend de Recibir'),
      colorEstado: estadoCv ? colorDe(estadoCv) : recibida > 0 ? '#fdab3d' : '#df2f4a',
    }
  })
}

/* ===== Edición de las cantidades pedidas ===== */

/** Quién hace la acción: va nombrado en el update. */
type Firmante = { name: string } | null

/** Firma de los updates: quién y cuándo. */
export const firma = (usuario: Firmante) => `${usuario?.name ?? 'Usuario de la app'} · ${fechaHoraLegible()}`

/** Cancela la orden: "🤖Estado de la Orden" en "Cancelada", con un update de quién y cuándo. */
export async function cancelarOrden(orden: Pick<OrdenEnCurso, 'id' | 'numero'>, usuario: Firmante) {
  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $cv: JSON!) {
      change_multiple_column_values(item_id: $id, board_id: $board, column_values: $cv) { id }
    }`,
    {
      id: orden.id,
      board: BOARDS.ordenCompra,
      cv: JSON.stringify({ [COL.ordenCompra.estadoCancelacion]: { index: ESTADO_ORDEN_INDEX.cancelada } }),
    },
  )
  await crearUpdate(orden.id, `Orden N°${orden.numero} cancelada desde Consultar Órdenes de Compra.\n${firma(usuario)}`)
}

export interface CambioCantidad {
  linea: LineaOrden
  /** Nuevas unidades pedidas. */
  pedida: number
}

/**
 * Reescribe lo PEDIDO de cada producto editado, en UNA sola mutación:
 *   · el subelemento de la orden: unidades, envases y total de la línea (envases × costo);
 *   · el pendiente de recibir: "🤖Q Pedida";
 *   · la cabecera de la orden: total, envases y unidades, recalculados con todas las líneas.
 * Devuelve las líneas ya editadas.
 */
export async function editarCantidadesOrden(
  orden: Pick<OrdenEnCurso, 'id' | 'numero'>,
  lineas: readonly LineaOrden[],
  cambios: readonly CambioCantidad[],
): Promise<LineaOrden[]> {
  const nuevas = lineas.map((l) => {
    const c = cambios.find((x) => x.linea.subId === l.subId)
    return c ? { ...l, pedida: c.pedida, pendiente: Math.max(0, c.pedida - l.recibida) } : l
  })
  const envases = (l: LineaOrden) => l.pedida / l.cantXEnvase
  const totalDe = (l: LineaOrden) => round2(envases(l) * l.costo)

  const raices: string[] = []
  const variables: Record<string, unknown> = {}
  cambios.forEach(({ linea }, i) => {
    const l = nuevas.find((x) => x.subId === linea.subId)!
    raices.push(
      `s${i}: change_multiple_column_values(item_id: $s${i}id, board_id: ${BOARDS.ordenCompraSub}, column_values: $s${i}cv) { id }`,
    )
    variables[`s${i}id`] = l.subId
    variables[`s${i}cv`] = JSON.stringify({
      [COL.ordenCompraSub.cantTotal]: l.pedida,
      [COL.ordenCompraSub.cantEnvases]: envases(l),
      [COL.ordenCompraSub.total]: totalDe(l),
    })
    if (l.pendId) {
      raices.push(
        `p${i}: change_multiple_column_values(item_id: $p${i}id, board_id: ${BOARDS.pendRecibirCompra}, column_values: $p${i}cv) { id }`,
      )
      variables[`p${i}id`] = l.pendId
      variables[`p${i}cv`] = JSON.stringify({ [COL.pendRecibirCompra.qPedida]: l.pedida })
    }
  })
  raices.push(
    `o: change_multiple_column_values(item_id: $oid, board_id: ${BOARDS.ordenCompra}, column_values: $ocv) { id }`,
  )
  variables.oid = orden.id
  variables.ocv = JSON.stringify({
    [COL.ordenCompra.total]: round2(nuevas.reduce((acc, l) => acc + totalDe(l), 0)),
    [COL.ordenCompra.totalEnvases]: nuevas.reduce((acc, l) => acc + envases(l), 0),
    [COL.ordenCompra.totalUnidades]: nuevas.reduce((acc, l) => acc + l.pedida, 0),
  })

  const declaraciones = Object.keys(variables)
    .map((k) => `$${k}: ${k.endsWith('cv') ? 'JSON!' : 'ID!'}`)
    .join(', ')
  await mondayApi(`mutation (${declaraciones}) {\n${raices.join('\n')}\n}`, variables)

  return nuevas
}

/**
 * Reemplaza el PDF de la orden ("🤖 Orden de Compra PDF"): vacía la columna y sube el nuevo. Sin
 * vaciarla, Monday lo agregaría al lado del anterior y "Ver Orden" seguiría abriendo el viejo.
 */
export async function reemplazarPdfOrden(ordenId: string, pdf: File): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $v: JSON!) {
      change_column_value(item_id: $id, board_id: $board, column_id: "${COL.ordenCompra.pdf}", value: $v) { id }
    }`,
    { id: ordenId, board: BOARDS.ordenCompra, v: JSON.stringify({ clear_all: true }) },
  )
  await mondaySubirArchivo(
    `mutation ($file: File!) { add_file_to_column(item_id: ${Number(ordenId)}, column_id: "${COL.ordenCompra.pdf}", file: $file) { id } }`,
    pdf,
  )
}
