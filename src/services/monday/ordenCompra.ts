/**
 * Creación y emisión de la ORDEN DE COMPRA en el tablero "🛒 Orden Compra" (18425512714).
 *
 * Es el ÚNICO módulo de esta app que ESCRIBE en Monday. Todo lo demás lee.
 *
 * El circuito espeja el del presupuesto en la app de ventas:
 *   1. `crearOrdenCompra` — crea el ítem y, colgando de él, un SUBELEMENTO por producto.
 *   2. `emitirOrdenCompra` — pone "🤖 Estado de Emision PDF" en "Enviar", que es lo que dispara la
 *      automatización que arma el PDF.
 *   3. `esperarOrdenCompraPdf` — sigue la columna hasta que el tablero confirme (o falle).
 *
 * La creación se difiere hasta el botón "Emitir": a la etapa 3 se llega SIN ítem creado, así que
 * navegar hacia atrás y hacia adelante con el stepper no deja órdenes a medio hacer en el tablero.
 */
import { envasesDe, resumenCompra, totalLinea } from '@/lib/compras'
import { round2 } from '@/lib/format'
import type { Comprador, Contacto, LineaCompra, MedioEnvio, Proveedor } from '@/types'
import { BOARDS, COL, MEDIO_ENVIO_IDS } from './columns'
import { byId, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/** Espera pasiva entre sondeos del estado. */
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Etiquetas de "🤖 Estado de Emision PDF" (color_mm5z7nhz), leídas del tablero:
 * {"0":"Emitiendo","1":"Emitida","2":"Error de Emision","3":"Enviar"}.
 *
 * Van por ÍNDICE y no por texto, igual que en el resto de la app: una etiqueta se renombra en dos
 * clics y el índice no cambia nunca.
 */
export const ESTADO_COMPRA_INDEX = {
  emitiendo: 0,
  emitida: 1,
  error: 2,
  /** El disparador: escribir ESTE índice es lo que le pide al tablero que genere el documento. */
  emitir: 3,
} as const

/** Los dos estados en los que la emisión terminó: hasta uno de ellos se sigue sondeando. */
const ESTADOS_FINALES: readonly number[] = [ESTADO_COMPRA_INDEX.emitida, ESTADO_COMPRA_INDEX.error]

export interface DatosOrdenCompra {
  proveedor: Proveedor
  lineas: readonly LineaCompra[]
  /** Quien firma la compra. Va a la columna `people` de la orden. */
  comprador: Comprador | null
  /** Destinatarios del envío, elegidos en la etapa 3. Pueden ser ninguno. */
  contactos: readonly Contacto[]
  medioEnvio: MedioEnvio
}

export interface OrdenCompraCreada {
  id: string
  /** Cuántos subelementos entraron. La vista lo compara contra la cantidad de líneas. */
  subitemsCreados: number
}

/**
 * Nombre del ítem de la orden.
 *
 * Ya no carga con los datos de la operación: proveedor, comprador y fecha tienen ahora su propia
 * columna, y ahí se puede filtrar y agrupar, que en el nombre no se podía. Queda sólo como rótulo
 * legible en las vistas del tablero.
 */
const nombreDeLaOrden = (proveedor: Proveedor, fecha: string): string =>
  `OC ${fecha} · ${proveedor.codigo} - ${proveedor.name}`

/** Fecha de hoy en el formato que espera una columna `date` de Monday (ISO, sin hora). */
function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * Valor de una columna `people` de Monday. Con un id que no sirve devuelve `null`, para poder
 * OMITIR la columna en vez de mandarla vacía y que la mutación falle por un dato que no teníamos.
 */
const personCol = (id: string | undefined): { personsAndTeams: { id: number; kind: 'person' }[] } | null => {
  const n = Number(id)
  return Number.isFinite(n) && n > 0 ? { personsAndTeams: [{ id: n, kind: 'person' }] } : null
}

/**
 * Cuántos subelementos entran en una misma consulta.
 *
 * No es el tope de GraphQL sino el del PRESUPUESTO DE COMPLEJIDAD de Monday: cada `create_subitem`
 * lo consume, y una orden larga mandada en un solo viaje se lo come entero y la API rechaza el
 * lote completo. En lotes de 20 una orden de cien productos entra en cinco viajes en vez de cien,
 * que es de lo que se trata, y ninguno se acerca al límite.
 */
const TAMANIO_LOTE = 20

/** Los tres números que van al subelemento, calculados con las fórmulas compartidas. */
function valoresDelSubitem(linea: LineaCompra) {
  /* Tienen que CERRAR entre sí, porque la cabecera espeja el total en su "🤖Total $":
     cantidad × precio = total.

     La unidad elegida es el ENVASE, no la unidad suelta: el precio del tablero es el costo de
     reposición —que es por envase— así que la cantidad que lo acompaña tiene que ser la de
     envases. Con unidades sueltas habría que dividir el costo, y el redondeo del unitario haría
     que la multiplicación ya no diera el total exacto. */
  return {
    [COL.ordenCompraSub.producto]: { item_ids: [Number(linea.producto.id)] },
    [COL.ordenCompraSub.cantEnvases]: envasesDe(linea.producto, linea.cantidad),
    /* Las UNIDADES que salen de esos envases. Es el dato que antes se perdía —el subelemento sólo
       guardaba envases— y el que necesita la recepción, que mueve el stock en unidades. */
    [COL.ordenCompraSub.cantTotal]: linea.cantidad,
    [COL.ordenCompraSub.precio]: round2(linea.producto.costoReposicion),
    [COL.ordenCompraSub.total]: totalLinea(linea.producto, linea.cantidad),
  }
  /* "🤖 Unidad de Compra" y "🤖 Cant x Envase" NO se escriben: son mirrors del Maestro y se
     completan solas al conectar el producto en la línea de arriba. */
}

/**
 * Carga un lote de productos como subelementos de la orden, en UNA sola consulta.
 *
 * La forma es la que GraphQL da para esto: varias raíces `create_subitem` en la misma mutación,
 * cada una con su ALIAS (`s0`, `s1`, …) para poder distinguirlas en la respuesta. Los argumentos
 * viajan como variables (`$n0`, `$cv0`, …) y no interpolados en el texto: un nombre de producto con
 * comillas o un salto de línea rompería el documento, y armar la query por concatenación es
 * exactamente el agujero por donde entra eso.
 *
 * GraphQL garantiza que las raíces de una MUTACIÓN se ejecutan EN ORDEN y de a una (a diferencia de
 * las queries, que pueden resolverse en paralelo), así que los subelementos quedan en el mismo
 * orden en que el usuario los cargó.
 *
 * Devuelve los ids creados: son los que se cuentan para saber si entraron todos.
 */
async function crearLoteDeSubitems(padreId: string, lote: readonly LineaCompra[]): Promise<string[]> {
  const declaraciones = lote.map((_, i) => `$n${i}: String!, $cv${i}: JSON!`).join(', ')
  const raices = lote
    .map(
      (_, i) => `  s${i}: create_subitem(
    parent_item_id: $padre
    item_name: $n${i}
    column_values: $cv${i}
    create_labels_if_missing: false
  ) { id }`,
    )
    .join('\n')

  const variables: Record<string, unknown> = { padre: padreId }
  lote.forEach((linea, i) => {
    variables[`n${i}`] = linea.producto.nombre
    variables[`cv${i}`] = JSON.stringify(valoresDelSubitem(linea))
  })

  const data = await mondayApi<Record<string, { id: string } | null>>(
    `mutation ($padre: ID!, ${declaraciones}) {\n${raices}\n}`,
    variables,
  )
  /* Sólo se cuentan los que devolvieron id. Un alias en null significa que ESE subelemento no
     entró aunque la consulta no haya fallado; contarlo igual haría creer que la orden está
     completa cuando le falta un producto. */
  return lote.map((_, i) => data[`s${i}`]?.id).filter((id): id is string => Boolean(id))
}

/**
 * Crea el ítem de la orden con sus subelementos.
 *
 * El ítem se crea PRIMERO y los subelementos después: `create_subitem` necesita el id del padre, y
 * GraphQL no deja usar el resultado de una raíz como argumento de otra en la misma consulta. Son
 * los DOS únicos viajes obligatorios; los productos van todos juntos (ver `crearLoteDeSubitems`).
 *
 * Se cuentan los que entraron y la vista corta si no entraron todos: una orden a la que le falta un
 * producto no se puede emitir, y es mejor decirlo que mandarla incompleta.
 */
export async function crearOrdenCompra({
  proveedor,
  lineas,
  comprador,
  contactos,
  medioEnvio,
}: DatosOrdenCompra): Promise<OrdenCompraCreada> {
  const fecha = hoyISO()
  /* Los totales se calculan UNA vez y con la fórmula compartida: son los mismos números que la
     etapa 2 mostró en pantalla, así que el tablero no puede terminar diciendo otra cosa. */
  const resumen = resumenCompra(lineas)

  const columnas: Record<string, unknown> = {
    /* El vínculo con la persona. Escribirlo completa sola la mirror "🤖Cta Cte Proveedores": la
       cuenta corriente del proveedor ya no hay que conectarla a mano. */
    [COL.ordenCompra.proveedor]: { item_ids: [Number(proveedor.id)] },
    [COL.ordenCompra.fechaEmision]: { date: fecha },
    [COL.ordenCompra.total]: resumen.total,
    [COL.ordenCompra.totalEnvases]: resumen.envases,
    [COL.ordenCompra.totalUnidades]: resumen.unidades,
    [COL.ordenCompra.medioEnvio]: { ids: MEDIO_ENVIO_IDS[medioEnvio] },
  }

  /* El comprador se OMITE si no se pudo resolver su id de Monday, en vez de mandar la columna
     vacía: una `people` con un id inválido hace fallar la mutación entera, y perder la orden por
     no saber quién la firma sería el peor de los dos resultados. */
  const persona = personCol(comprador?.id)
  if (persona) columnas[COL.ordenCompra.comprador] = persona

  /* Los destinatarios se registran YA, al crear: para cuando se emite, la etapa 3 los tiene
     elegidos. Una lista vacía es un valor válido —la columna queda sin conectar— así que no hace
     falta condicionarla. */
  columnas[COL.ordenCompra.contactos] = {
    item_ids: contactos
      .map((c) => Number(c.itemId))
      .filter((n) => Number.isFinite(n) && n > 0),
  }

  const creado = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($board: ID!, $nombre: String!, $cv: JSON!) {
      create_item(board_id: $board, item_name: $nombre, column_values: $cv, create_labels_if_missing: false) { id }
    }`,
    {
      board: BOARDS.ordenCompra,
      nombre: nombreDeLaOrden(proveedor, fecha),
      cv: JSON.stringify(columnas),
    },
  )
  const id = creado.create_item.id

  /* Los lotes van EN SERIE y no con `Promise.all`: mandarlos en paralelo los pone a competir por
     el mismo presupuesto de complejidad —y por el límite de peticiones por minuto— así que el
     lote que pierde vuelve con un 429 y la orden queda a medio cargar. Con una orden de cien
     productos son cinco viajes, no cien: el ahorro ya está hecho. */
  let subitemsCreados = 0
  for (let desde = 0; desde < lineas.length; desde += TAMANIO_LOTE) {
    const lote = lineas.slice(desde, desde + TAMANIO_LOTE)
    const ids = await crearLoteDeSubitems(id, lote)
    subitemsCreados += ids.length
  }

  return { id, subitemsCreados }
}

/**
 * Dispara la emisión: pone "🤖 Estado de Emision PDF" en "Enviar". Ese cambio es lo que el tablero escucha
 * para generar el PDF de la orden.
 */
export async function emitirOrdenCompra(itemId: string): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $cv: JSON!) {
      change_multiple_column_values(item_id: $id, board_id: $board, column_values: $cv) { id }
    }`,
    {
      id: itemId,
      board: BOARDS.ordenCompra,
      cv: JSON.stringify({
        [COL.ordenCompra.estadoEmision]: { index: ESTADO_COMPRA_INDEX.emitir },
      }),
    },
  )
}

/** Estado de emisión de la orden, por índice, tal como está en la columna. */
async function getEstadoCompra(itemId: string): Promise<number | null> {
  const data = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ["${COL.ordenCompra.estadoEmision}"]) {
          id text
          ... on StatusValue { index }
        }
      }
    }`,
    { ids: [itemId] },
  )
  const item = data.items[0]
  if (!item) return null
  return byId(item)[COL.ordenCompra.estadoEmision]?.index ?? null
}

/**
 * Sigue la emisión hasta que el tablero la cierre. Devuelve `true` si terminó en "Emitida".
 *
 * Se sondea con un tope de intentos y no indefinidamente: si la automatización no corre, la app
 * tiene que poder decir "está tardando más de lo esperado" y devolver el control, en vez de quedar
 * consultando para siempre.
 */
export async function esperarOrdenCompraEmitida(
  itemId: string,
  { intentos = 30, intervalo = 2000 }: { intentos?: number; intervalo?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    const estado = await getEstadoCompra(itemId)
    if (estado !== null && ESTADOS_FINALES.includes(estado)) {
      return estado === ESTADO_COMPRA_INDEX.emitida
    }
    await esperar(intervalo)
  }
  return false
}

/** URL del PDF de la orden, si el tablero ya lo generó. `null` mientras no exista. */
export async function getOrdenCompraPdf(itemId: string): Promise<string | null> {
  const data = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) { column_values(ids: ["${COL.ordenCompra.pdf}"]) { id text } }
    }`,
    { ids: [itemId] },
  )
  const item = data.items[0]
  if (!item) return null
  const texto = byId(item)[COL.ordenCompra.pdf]?.text
  return texto && texto.trim() !== '' ? texto : null
}
