/**
 * Registro de la ORDEN DE COMPRA en el tablero "🛒 Orden Compra" (18425512714).
 *
 * El circuito es el del presupuesto de "Operaciones de venta": la app genera el PDF y lo envía SIN
 * tocar Monday, y la orden recién nace en el tablero cuando el envío quedó confirmado:
 *   1. `registrarOrdenCompra` — crea el ítem con su cabecera completa, después TODOS sus productos
 *      como subelementos en UNA sola solicitud, y le sube el PDF emitido.
 *   2. `armarPendientes` — deja listas, desde antes de registrar, las dos consultas que crean los
 *      pendientes de RECEPCIÓN y de FACTURA (uno por subelemento). Confirmado el registro, se
 *      disparan las dos a la vez y SIN esperarlas.
 */
import { envasesDe, ivaLinea, ivaOrden, resumenCompra, totalLinea } from '@/lib/compras'
import { round2 } from '@/lib/format'
import { numeroSinPrefijo } from '@/lib/ordenDoc'
import type { Comprador, Contacto, LineaCompra, MedioEnvio, Proveedor } from '@/types'
import {
  BOARDS,
  COL,
  ESTADO_DISPARADOR_INDEX,
  ESTADO_ORDEN_INDEX,
  ESTADO_PEND_FACT_INDEX,
  ESTADO_RECEPCION_INDEX,
  ETIQUETA_PEND_RECIBIR,
  ESTADO_RECEPCION_SUB_INDEX,
  MEDIO_ENVIO_IDS,
} from './columns'
import { mondayApi, mondayHabilitado, mondaySubirArchivo } from './sdk'
import { crearUpdate } from './updates'

/* ===== Número de la orden ===== */

/** Formato del ID del board: prefijo + número con ceros (p. ej. "OC-005"). El prefijo no se usa. */
const NRO_ORDEN_RE = /^(.*?)(\d+)$/

/**
 * El número que va a llevar la próxima orden: el "🤖ID Compra" del último ítem creado, más uno,
 * conservando los ceros y SIN el prefijo del tablero ("OC-005" → "006"): la orden se nombra
 * "N°006" en la app, en el PDF y en los mensajes al proveedor.
 *
 * Es una estimación: el ID definitivo lo asigna Monday al crear el ítem. Sirve para imprimirlo en
 * el PDF, que se genera ANTES de registrar la orden.
 */
export async function getProximoNroOrden(): Promise<string | null> {
  if (!mondayHabilitado()) return null
  const data = await mondayApi<{
    boards: { items_page: { items: { column_values: { text: string | null }[] }[] } }[]
  }>(
    `query {
      boards(ids: [${BOARDS.ordenCompra}]) {
        items_page(limit: 1, query_params: {order_by: [{column_id: "__creation_log__", direction: desc}]}) {
          items { column_values(ids: ["${COL.ordenCompra.idCompra}"]) { text } }
        }
      }
    }`,
  )
  const ultimo = data.boards[0]?.items_page?.items[0]?.column_values[0]?.text?.trim()
  if (!ultimo) return null
  const m = NRO_ORDEN_RE.exec(ultimo)
  if (!m) return null
  const [, , numero] = m
  return String(Number(numero) + 1).padStart(numero.length, '0')
}

/* ===== Registro ===== */

export interface DatosOrdenCompra {
  numero: string
  /** Fecha de emisión, "dd/mm/yyyy" (va en el nombre del ítem). */
  fechaEmision: string
  proveedor: Proveedor
  lineas: readonly LineaCompra[]
  /** Quien firma la compra. Va a la columna `people` de la orden. */
  comprador: Comprador | null
  /** Destinatarios a los que se envió. */
  contactos: readonly Contacto[]
  medioEnvio: MedioEnvio
  /** Correo desde el que salió la orden (ver `lib/permisos.casillaDeEnvio`). */
  casillaEnvio: string
  /** El PDF emitido y enviado: se sube a la columna file del ítem. */
  pdf: File
  /** Cuándo quedó confirmado el envío. */
  enviadaEl: Date
  /** Emisión + días del proveedor, "dd/mm/yyyy". `null` si el proveedor no tiene los días. */
  fechaRecepcionEstimada: string | null
}

export interface OrdenCompraRegistrada {
  id: string
  /** Cuántos subelementos entraron. La vista lo compara contra la cantidad de líneas. */
  subitemsCreados: number
}

/**
 * "N°[NRO DE ORDEN] - [FECHA DE EMISION] - [NOMBRE PROVEEDOR]" ("N°008 - 08/10/2026 - PROVEEDOR TEST").
 * El número va sin el prefijo "OC" del tablero, como en el resto de la app.
 */
export const nombreDeLaOrden = (numero: string, fecha: string, proveedor: Proveedor): string =>
  `N°${numeroSinPrefijo(numero)} - ${fecha} - ${proveedor.name}`

/** "dd/mm/yyyy" → ISO "yyyy-mm-dd", que es lo que acepta una columna `date`. */
const isoDe = (fechaAR: string): string => fechaAR.split('/').reverse().join('-')

/** Valor de una columna `date` CON hora: Monday la guarda en UTC. */
export function fechaHoraUTC(d: Date): { date: string; time: string } {
  const iso = d.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) }
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
 * "🤖 Unidad de Compra" del subelemento es un dropdown que hoy no tiene opciones. Se leen sus
 * etiquetas UNA vez: la unidad del producto se escribe sólo si ya existe como opción (por id), así
 * la mutación nunca falla por una etiqueta que falta, y empieza a cargarse sola cuando las creen.
 */
let unidadesCache: Promise<Map<string, number>> | null = null
function unidadesDeCompra(): Promise<Map<string, number>> {
  unidadesCache ??= mondayApi<{ boards: { columns: { settings_str: string }[] }[] }>(
    `query { boards(ids: [${BOARDS.ordenCompraSub}]) { columns(ids: ["${COL.ordenCompraSub.unidadCompra}"]) { settings_str } } }`,
  )
    .then((data) => {
      const settings = JSON.parse(data.boards[0]?.columns[0]?.settings_str ?? '{}') as {
        labels?: { id: number; name: string }[]
      }
      return new Map((settings.labels ?? []).map((l) => [l.name.trim().toLowerCase(), l.id]))
    })
    .catch(() => {
      unidadesCache = null
      return new Map<string, number>()
    })
  return unidadesCache
}

/** % de descuento total del proveedor: los "✋️Descuento 1..4" aplicados en cascada. */
const descuentoTotal = (descuentos: readonly number[]): number =>
  round2((1 - descuentos.reduce((acc, d) => acc * (1 - d / 100), 1)) * 100)

/** Los valores del subelemento, con las fórmulas compartidas (los mismos del PDF). */
function valoresDelSubitem(linea: LineaCompra, unidades: Map<string, number>) {
  const p = linea.producto
  const unidad = unidades.get(p.unidadCompra.trim().toLowerCase())
  const iva = ivaLinea(p, linea.cantidad)
  /* Envases × precio = total: la cabecera espeja el total. El precio es el costo final del Maestro,
     que es por ENVASE. */
  return {
    [COL.ordenCompraSub.producto]: { item_ids: [Number(p.id)] },
    [COL.ordenCompraSub.cantEnvases]: envasesDe(p, linea.cantidad),
    // Las UNIDADES que salen de esos envases: lo que necesita la recepción para mover el stock.
    [COL.ordenCompraSub.cantTotal]: linea.cantidad,
    [COL.ordenCompraSub.precio]: round2(p.costoReposicion),
    [COL.ordenCompraSub.total]: totalLinea(p, linea.cantidad),
    // La Cant x Envase con la que se pidió (puede ser la alterada por un administrador).
    [COL.ordenCompraSub.cantXEnvase]: p.cantXUnidad,
    // Cómo se llega al costo final: precio de lista, descuento total y bonificación.
    [COL.ordenCompraSub.precioUnitario]: round2(p.precioUnitario),
    [COL.ordenCompraSub.descuento]: descuentoTotal(p.descuentos),
    [COL.ordenCompraSub.bonifMercaderia]: p.bonifMercaderia,
    /* El IVA del producto en pesos. Sin alícuota cargada en el Maestro, la columna queda vacía (no
       se escribe un 0 que no se sabe). */
    ...(iva !== null ? { [COL.ordenCompraSub.iva]: iva } : {}),
    // La alícuota aplicada (21, 10,5…), tal cual el Maestro. Sin alícuota cargada, vacía.
    ...(p.iva !== null ? { [COL.ordenCompraSub.ivaTasa]: p.iva } : {}),
    // La orden nace sin nada recibido.
    [COL.ordenCompraSub.cantRecibida]: 0,
    [COL.ordenCompraSub.estadoRecepcion]: { index: ESTADO_RECEPCION_SUB_INDEX.pendiente },
    ...(unidad !== undefined ? { [COL.ordenCompraSub.unidadCompra]: { ids: [unidad] } } : {}),
  }
}

/**
 * Crea TODOS los subelementos de la orden en UNA sola solicitud: una raíz `create_subitem` por
 * producto, cada una con su alias (`s0`, `s1`, …), en la misma mutación. Los argumentos viajan como
 * variables y no interpolados: un nombre con comillas rompería el documento.
 *
 * GraphQL ejecuta las raíces de una MUTACIÓN en orden, así que los subelementos quedan en el orden
 * en que se cargaron. Devuelve cuántos entraron.
 */
async function crearSubitems(padreId: string, lineas: readonly LineaCompra[]): Promise<number> {
  if (lineas.length === 0) return 0
  const unidades = await unidadesDeCompra()
  const declaraciones = lineas.map((_, i) => `$n${i}: String!, $cv${i}: JSON!`).join(', ')
  const raices = lineas
    .map(
      (_, i) =>
        `  s${i}: create_subitem(parent_item_id: $padre, item_name: $n${i}, column_values: $cv${i}, create_labels_if_missing: false) { id }`,
    )
    .join('\n')
  const variables: Record<string, unknown> = { padre: padreId }
  lineas.forEach((linea, i) => {
    variables[`n${i}`] = linea.producto.nombre
    variables[`cv${i}`] = JSON.stringify(valoresDelSubitem(linea, unidades))
  })
  const data = await mondayApi<Record<string, { id: string } | null>>(
    `mutation ($padre: ID!, ${declaraciones}) {\n${raices}\n}`,
    variables,
  )
  return lineas.filter((_, i) => data[`s${i}`]?.id).length
}

/**
 * Registra la orden ya emitida y enviada: el ítem con su cabecera completa, los subelementos (en
 * una sola solicitud) y el PDF. El ítem nace con la emisión y el envío YA cerrados ("Emitida" y
 * "Enviado"): el documento lo generó la app y el envío ya salió, así que no hay nada que las
 * automatizaciones del tablero tengan que volver a hacer.
 */
export async function registrarOrdenCompra(d: DatosOrdenCompra): Promise<OrdenCompraRegistrada> {
  const resumen = resumenCompra(d.lineas)
  const columnas: Record<string, unknown> = {
    /* El vínculo con la persona. Escribirlo completa sola la mirror "🤖Cta Cte Proveedores". */
    [COL.ordenCompra.proveedor]: { item_ids: [Number(d.proveedor.id)] },
    [COL.ordenCompra.fechaEmision]: { date: isoDe(d.fechaEmision) },
    [COL.ordenCompra.total]: resumen.total,
    // El IVA total de la orden: la suma del IVA de sus productos.
    [COL.ordenCompra.iva]: ivaOrden(d.lineas),
    [COL.ordenCompra.totalEnvases]: resumen.envases,
    [COL.ordenCompra.totalUnidades]: resumen.unidades,
    [COL.ordenCompra.medioEnvio]: { ids: MEDIO_ENVIO_IDS[d.medioEnvio] },
    [COL.ordenCompra.casillaEnvio]: d.casillaEnvio,
    [COL.ordenCompra.contactos]: {
      item_ids: d.contactos.map((c) => Number(c.itemId)).filter((n) => Number.isFinite(n) && n > 0),
    },
    [COL.ordenCompra.estadoEnvio]: { index: ESTADO_DISPARADOR_INDEX.hecho },
    // La orden nace en curso y sin nada recibido.
    [COL.ordenCompra.estadoCancelacion]: { index: ESTADO_ORDEN_INDEX.enCurso },
    [COL.ordenCompra.estadoRecepcion]: { index: ESTADO_RECEPCION_INDEX.pendiente },
    [COL.ordenCompra.fechaHoraEnvio]: fechaHoraUTC(d.enviadaEl),
  }
  // "OC-006" → 6: la parte numérica del número impreso en el PDF.
  const nro = Number(/(\d+)\s*$/.exec(d.numero)?.[1])
  if (Number.isFinite(nro)) columnas[COL.ordenCompra.nroOrden] = nro
  if (d.fechaRecepcionEstimada) {
    columnas[COL.ordenCompra.fechaRecepcionEstimada] = { date: isoDe(d.fechaRecepcionEstimada) }
  }
  // Sin un id de Monday válido el comprador se omite: una `people` inválida tira la mutación entera.
  const persona = personCol(d.comprador?.id)
  if (persona) columnas[COL.ordenCompra.comprador] = persona

  const creado = await mondayApi<{ create_item: { id: string } }>(
    `mutation ($board: ID!, $nombre: String!, $cv: JSON!) {
      create_item(board_id: $board, item_name: $nombre, column_values: $cv, create_labels_if_missing: false) { id }
    }`,
    {
      board: BOARDS.ordenCompra,
      nombre: nombreDeLaOrden(d.numero, d.fechaEmision, d.proveedor),
      cv: JSON.stringify(columnas),
    },
  )
  const id = creado.create_item.id
  const subitemsCreados = await crearSubitems(id, d.lineas)

  await mondaySubirArchivo(
    `mutation ($file: File!) { add_file_to_column(item_id: ${Number(id)}, column_id: "${COL.ordenCompra.pdf}", file: $file) { id } }`,
    d.pdf,
  )
  return { id, subitemsCreados }
}

/* ===== Pendientes de recepción y de factura ===== */

/** Una consulta lista para disparar: el documento GraphQL y sus variables. */
interface ConsultaLista {
  query: string
  variables: Record<string, unknown>
}

/** Arma una mutación que crea, en UNA solicitud, un ítem por pendiente en el tablero indicado. */
function consultaDeItems(
  board: number,
  items: readonly { nombre: string; columnas: Record<string, unknown> }[],
  /** Que Monday cree las etiquetas de status que se escriben por texto y todavía no existen. */
  crearEtiquetas = false,
): ConsultaLista {
  const declaraciones = items.map((_, i) => `$n${i}: String!, $cv${i}: JSON!`).join(', ')
  const raices = items
    .map(
      (_, i) =>
        `  p${i}: create_item(board_id: ${board}, item_name: $n${i}, column_values: $cv${i}, create_labels_if_missing: ${crearEtiquetas}) { id }`,
    )
    .join('\n')
  const variables: Record<string, unknown> = {}
  items.forEach((it, i) => {
    variables[`n${i}`] = it.nombre
    variables[`cv${i}`] = JSON.stringify(it.columnas)
  })
  return { query: `mutation (${declaraciones}) {\n${raices}\n}`, variables }
}

/**
 * Deja ARMADAS las dos consultas de pendientes: un pendiente de RECEPCIÓN y uno de FACTURA por
 * cada subelemento de la orden (así se puede recibir y facturar en forma parcial, producto por
 * producto). Las cantidades son UNIDADES: la escala en la que se mueve el stock al recibir.
 *
 * Se arman ANTES de registrar la orden, con todo lo que ya se sabe; lo único que falta es el id del
 * ítem, que se completa al dispararlas. `disparar` lanza las dos a la vez y NO las espera: la
 * operación no se frena por ellas. Creados, se conectan a la orden; si alguna falla, se deja
 * constancia en un update de la orden, con el motivo que dio Monday.
 *
 * El pendiente de recepción nace con "🤖Estado Del Pedido" en "Pendiente de recibir". Va por TEXTO
 * y con `create_labels_if_missing`: si la etiqueta todavía no existe en el tablero, Monday la crea
 * en vez de rechazar la creación.
 */
export function armarPendientes(proveedor: Proveedor, lineas: readonly LineaCompra[]) {
  // La cuenta corriente del proveedor, si tiene: los dos tableros la conectan.
  const ctaCte = proveedor.ctaCteId ? { item_ids: [Number(proveedor.ctaCteId)] } : null

  const recibir = (orden: { item_ids: number[] }) =>
    lineas.map((l) => ({
      nombre: l.producto.nombre,
      columnas: {
        [COL.pendRecibirCompra.ordenCompra]: orden,
        [COL.pendRecibirCompra.producto]: { item_ids: [Number(l.producto.id)] },
        [COL.pendRecibirCompra.qPedida]: l.cantidad,
        [COL.pendRecibirCompra.estado]: { label: ETIQUETA_PEND_RECIBIR },
        ...(ctaCte ? { [COL.pendRecibirCompra.ctaCte]: ctaCte } : {}),
      },
    }))
  const facturar = (orden: { item_ids: number[] }) =>
    lineas.map((l) => ({
      nombre: l.producto.nombre,
      columnas: {
        [COL.pendRecibirFact.ordenCompra]: orden,
        [COL.pendRecibirFact.producto]: { item_ids: [Number(l.producto.id)] },
        [COL.pendRecibirFact.qAFacturar]: l.cantidad,
        [COL.pendRecibirFact.estado]: { index: ESTADO_PEND_FACT_INDEX.pendiente },
        ...(ctaCte ? { [COL.pendRecibirFact.ctaCte]: ctaCte } : {}),
      },
    }))

  return {
    /** Dispara las dos consultas en simultáneo, sin esperarlas. */
    disparar(ordenId: string): void {
      const orden = { item_ids: [Number(ordenId)] }
      const tandas: { tipo: string; consulta: ConsultaLista; enOrden: string }[] = [
        {
          tipo: 'recepción',
          consulta: consultaDeItems(BOARDS.pendRecibirCompra, recibir(orden), true),
          enOrden: COL.ordenCompra.pendRecibir,
        },
        {
          tipo: 'factura',
          consulta: consultaDeItems(BOARDS.pendRecibirFact, facturar(orden)),
          enOrden: COL.ordenCompra.pendRecibirFact,
        },
      ]
      for (const t of tandas) {
        void mondayApi<Record<string, { id: string } | null>>(t.consulta.query, t.consulta.variables)
          .then((creados) => {
            // Los pendientes quedan también a la vista desde la orden.
            const ids = Object.values(creados)
              .map((x) => Number(x?.id))
              .filter((n) => Number.isFinite(n) && n > 0)
            return cambiarColumnasOrden(ordenId, { [t.enOrden]: { item_ids: ids } })
          })
          .catch((e: unknown) => {
            const motivo = e instanceof Error ? e.message : String(e)
            console.error(`Pendientes de ${t.tipo} de la orden ${ordenId}:`, e)
            void crearUpdate(
              ordenId,
              `⚠️ No se pudieron crear (o conectar a la orden) los pendientes de ${t.tipo}. Hay que revisarlos a mano.\nMotivo: ${motivo}`,
            ).catch(() => {})
          })
      }
    },
  }
}

/* ===== Cambios sobre una orden ya registrada ===== */

/** `change_multiple_column_values` sobre una orden de compra. */
export async function cambiarColumnasOrden(
  itemId: string,
  columnas: Record<string, unknown>,
): Promise<void> {
  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $cv: JSON!) {
      change_multiple_column_values(item_id: $id, board_id: $board, column_values: $cv) { id }
    }`,
    { id: itemId, board: BOARDS.ordenCompra, cv: JSON.stringify(columnas) },
  )
}
