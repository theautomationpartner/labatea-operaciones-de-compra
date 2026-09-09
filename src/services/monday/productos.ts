/**
 * Catálogo del "📦Maestro de Productos" (18421035535), visto desde COMPRAS.
 *
 * Los criterios de búsqueda, la paginación y el armado dinámico de `query_params` son EXACTAMENTE
 * los de la app de ventas (`services/monday/presupuestar`): código exacto, taxonomía con OR dentro
 * de cada criterio y AND entre criterios, nombre por `contains_text`, y páginas de a 15 con el
 * cursor de Monday. Lo que cambia es qué se lee de cada producto y una regla nueva:
 *
 *   · el PRECIO no sale de una lista L1..L8 —un proveedor no tiene lista asignada— sino de
 *     "🤖Costo de Reposicion" (formula_mm54wx0w), que es lo que cuesta UN ENVASE de compra;
 *   · se leen "✋Tipo Envase Compra" y "✋Cant x Envase", que definen el escalón de la cantidad;
 *   · TODA búsqueda va restringida al PROVEEDOR de la orden (ver `reglaProveedor`).
 *
 * LECTURA PURA. Este módulo no escribe una sola columna del tablero.
 */
import type { CampoFiltro, Filtro, Producto } from '@/types'
import { BOARDS, COL } from './columns'
import { byId, numCol, sumaMirror, valor, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/** Ítems por página. La búsqueda nunca baja el board entero: se pagina contra la API. */
export const PRODUCTOS_POR_PAGINA = 15

/** Una página de resultados: sus ítems y el cursor de la siguiente (null = última). */
export interface PaginaProductos {
  productos: Producto[]
  /** Cursor que devuelve Monday. Se guarda tal cual y se manda para pedir la página siguiente. */
  cursor: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

/* ===== 1) Qué se lee de cada producto ===== */

/** Columnas del producto que necesita la app de compras. */
const COLUMNAS_PRODUCTO = JSON.stringify([
  COL.producto.codigo,
  COL.producto.rubro,
  COL.producto.subrubro,
  COL.producto.categoria,
  COL.producto.unidadMedida,
  COL.producto.tipoMercaderia,
  COL.producto.proveedor,
  COL.producto.proveedorCodigo,
  COL.producto.costoReposicion,
  COL.producto.tipoEnvaseCompra,
  COL.producto.cantXEnvase,
  COL.producto.stock,
])

/**
 * Columnas del ítem de stock del producto ("🧮Stock y Movimientos"). Se piden ANIDADAS en la
 * relación del maestro: una sola consulta trae el producto y su stock.
 */
const COLUMNAS_STOCK = JSON.stringify([
  COL.stockItem.ingresos,
  COL.stockItem.egresos,
  COL.stockItem.pendEntregaVta,
  COL.stockItem.pendRecepcionCompra,
  COL.stockItem.fisico,
  COL.stockItem.comercial,
  COL.stockItem.disponible,
])

/**
 * Selección GraphQL de un producto: es la misma en la primera página y en las siguientes.
 *
 * OJO con los fragmentos: hay que pedir los TRES. `display_value` trae el valor calculado de las
 * fórmulas (el costo de reposición y los tres saldos de stock) y de las mirror (el código del
 * proveedor, y el Ingreso/Egreso Total que espejan los subelementos de movimiento). El fragmento
 * que falte vuelve en cero sin avisar.
 *
 * Las columnas de stock se piden para TODAS las relaciones del producto (proveedor incluido), pero
 * eso no molesta: la API devuelve sólo las que existen en el tablero del ítem, así que en el
 * proveedor la lista vuelve vacía.
 */
const SELECCION_PRODUCTO = `
  id name
  column_values(ids: ${COLUMNAS_PRODUCTO}) {
    id text
    ... on FormulaValue { display_value }
    ... on MirrorValue { display_value }
    ... on BoardRelationValue {
      linked_items {
        id
        name
        column_values(ids: ${COLUMNAS_STOCK}) {
          id text
          ... on FormulaValue { display_value }
          ... on MirrorValue { display_value }
        }
      }
    }
  }
`

function mapProducto(item: MondayItem): Producto {
  const c = byId(item)
  /* Ítem de "🧮Stock y Movimientos" conectado al producto (board_relation_mm57jgks): de ahí salen
     las cantidades de stock. Viene anidado en la relación, así que no hay una segunda consulta. */
  const itemStock = c[COL.producto.stock]?.linked_items?.[0]
  const stock = itemStock?.column_values ? byId(itemStock) : {}
  const proveedor = c[COL.producto.proveedor]?.linked_items?.[0]
  return {
    // ID del ítem en Monday: lo necesita el subelemento de la orden para linkear el producto.
    id: item.id,
    codigo: valor(c[COL.producto.codigo]),
    nombre: item.name,
    /* "🤖Costo de Reposicion" (fórmula): el precio de UN ENVASE de compra. Se lee por
       `display_value`; en `text` las fórmulas vienen vacías. */
    costoReposicion: numCol(c[COL.producto.costoReposicion]),
    unidadCompra: valor(c[COL.producto.tipoEnvaseCompra]),
    cantXUnidad: numCol(c[COL.producto.cantXEnvase]),
    /* El proveedor es el ítem conectado. Su ID es lo que la orden compara para no mezclar
       mercadería de dos proveedores; sin conexión queda null y el producto no es comprable. */
    provId: proveedor?.id ?? null,
    provNombre: proveedor?.name ?? '',
    provCod: valor(c[COL.producto.proveedorCodigo]),
    tipo: valor(c[COL.producto.tipoMercaderia]),
    rubro: valor(c[COL.producto.rubro]),
    subrubro: valor(c[COL.producto.subrubro]),
    categoria: valor(c[COL.producto.categoria]),
    um: valor(c[COL.producto.unidadMedida]),
    /* Ingresos y egresos son MIRRORS de los subelementos de movimiento: su `display_value` puede
       venir como lista separada por comas, así que hay que SUMARLA y no pasarla por `num()`, que
       borra las comas y las concatena en un número gigante. Los pendientes son numéricas comunes
       y los tres saldos, fórmulas. */
    ingresos: sumaMirror(stock[COL.stockItem.ingresos]),
    egresos: sumaMirror(stock[COL.stockItem.egresos]),
    pendEntregaVta: numCol(stock[COL.stockItem.pendEntregaVta]),
    pendRecepcionCompra: numCol(stock[COL.stockItem.pendRecepcionCompra]),
    fisico: numCol(stock[COL.stockItem.fisico]),
    comercial: numCol(stock[COL.stockItem.comercial]),
    disponible: numCol(stock[COL.stockItem.disponible]),
    // El mismo ítem de stock, para afectarlo cuando la compra se reciba.
    stockId: itemStock?.id,
  }
}

/** Página tal como la devuelve la API, antes de mapear los ítems a `Producto`. */
interface PaginaCruda {
  cursor: string | null
  items: MondayItem[]
}

const mapPagina = (pagina: PaginaCruda | undefined): PaginaProductos => ({
  productos: (pagina?.items ?? []).map(mapProducto),
  cursor: pagina?.cursor ?? null,
})

/* ===== 2) Constructor dinámico de la consulta (query_params) ===== */

/**
 * Una regla de `query_params`. Sólo se arman las de los criterios que el usuario eligió: un
 * criterio vacío NO genera regla (una regla con `compare_value: []` devuelve 0 resultados).
 */
interface ReglaBusqueda {
  column_id: string
  /** Lista de valores para `any_of`; texto suelto para `contains_text`. */
  compare_value: string | (string | number)[]
  operator: 'any_of' | 'contains_text'
}

/** `query_params` completo: las reglas válidas, todas intersectadas (AND entre criterios). */
interface QueryParamsProductos {
  rules: ReglaBusqueda[]
  operator: 'and'
}

/** Campo de filtro → columna dropdown del Maestro de Productos. */
const CAMPO_COLUMNA: Record<CampoFiltro, string> = {
  Rubro: COL.producto.rubro,
  Subrubro: COL.producto.subrubro,
  Categoría: COL.producto.categoria,
}

/** Sólo dígitos = código interno del producto. */
const esCodigo = (t: string): boolean => /^\d+$/.test(t)

/** label normalizado → id de la etiqueta, por campo. Es lo que aceptan las reglas de la API. */
type IndicesFiltros = Record<CampoFiltro, Record<string, number>>

/**
 * El id de un ítem de Monday, como NÚMERO y no como texto.
 *
 * Existe por lo que se explica en `reglaProveedor`: un id entre comillas en una regla de
 * `board_relation` no falla, simplemente no matchea nada. Convertirlo en un solo lugar —y lanzar si
 * no es convertible— evita que el próximo filtro por relación repita el mismo error en silencio.
 */
function idNumerico(id: string): number {
  const n = Number(id)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Id de Monday inválido en una regla de board_relation: "${id}"`)
  }
  return n
}

/**
 * RESTRICCIÓN DE NEGOCIO — una orden de compra es de UN solo proveedor.
 *
 * No se pueden mezclar productos de proveedores distintos en la misma orden, así que la regla va
 * en la CONSULTA y no filtrando la respuesta: el catálogo que el usuario ve es directamente el del
 * proveedor elegido, y un producto de otro no llega a aparecer ni siquiera para ser rechazado.
 *
 * OJO con el tipo del id: en una columna `board_relation`, `any_of` compara contra el id del ítem
 * vinculado y lo espera como NÚMERO. Con el MISMO id entre comillas la API no da error: devuelve
 * cero ítems. O sea que el filtro parece funcionar —la consulta es válida, la respuesta llega bien
 * formada— y lo único que se ve es un catálogo vacío para todos los proveedores, que se confunde
 * con un problema de datos. Es la misma trampa que ya documenta `saldos.ts` para la cuenta
 * corriente; por eso la conversión pasa por `idNumerico` y no por un cast suelto.
 *
 * La regla se vuelve a verificar en memoria al mapear (`esDelProveedor`): una regla de negocio que
 * sólo vive en un string de GraphQL se pierde de vista, y esa segunda pasada es la que la deja
 * escrita en el código.
 */
const reglaProveedor = (proveedorId: string): ReglaBusqueda => ({
  column_id: COL.producto.proveedor,
  compare_value: [idNumerico(proveedorId)],
  operator: 'any_of',
})

/** El producto es comprable a ESTE proveedor. Sin proveedor conectado, no lo es. */
export const esDelProveedor = (p: Producto, proveedorId: string): boolean =>
  p.provId !== null && p.provId === proveedorId

/**
 * Reglas de taxonomía, una por criterio con valores elegidos:
 *   - OR dentro del criterio: todos sus valores en un mismo `any_of` (Rubro = A ó B).
 *   - AND entre criterios: cada criterio es una regla aparte bajo el `operator: and` raíz.
 *
 * Un criterio sin valores se OMITE por completo: no viaja como regla vacía.
 */
function reglasTaxonomia(filtros: Filtro[], indices: IndicesFiltros): ReglaBusqueda[] {
  const porCampo = new Map<CampoFiltro, number[]>()
  for (const f of filtros) {
    // Las columnas dropdown se filtran por el id de la etiqueta, no por su texto.
    const id = indices[f.campo]?.[norm(f.valor)]
    if (id === undefined) continue
    porCampo.set(f.campo, [...(porCampo.get(f.campo) ?? []), id])
  }
  const reglas: ReglaBusqueda[] = []
  for (const [campo, valores] of porCampo) {
    if (valores.length === 0) continue
    reglas.push({ column_id: CAMPO_COLUMNA[campo], compare_value: valores, operator: 'any_of' })
  }
  return reglas
}

/**
 * Arma el `query_params` de la búsqueda. Es 100% dinámico: sólo entran las columnas que el
 * usuario completó, MÁS la regla del proveedor, que va siempre.
 *
 * - RAMA A · código interno: anula el nombre y los filtros y consulta por valor exacto contra
 *   "✋Codigo Prod". El código identifica un único producto. La regla del proveedor SIGUE
 *   aplicando: buscar por código no es una puerta trasera para meter mercadería de otro.
 * - RAMA B · sólo filtros: no hace falta nombre; las reglas de taxonomía se mandan solas.
 * - RAMA C · híbrida: el nombre es un criterio más (`contains_text` sobre el nombre del ítem)
 *   que se intersecta con la taxonomía.
 *
 * A diferencia de la app de ventas, acá NUNCA devuelve `undefined`: la regla del proveedor está
 * siempre, así que la consulta jamás sale sin `query_params`.
 */
export function construirQueryProductos(
  termino: string,
  filtros: Filtro[],
  indices: IndicesFiltros,
  proveedorId: string,
): QueryParamsProductos {
  const t = termino.trim()
  if (esCodigo(t)) {
    return {
      rules: [
        { column_id: COL.producto.codigo, compare_value: [t], operator: 'any_of' },
        reglaProveedor(proveedorId),
      ],
      operator: 'and',
    }
  }
  const rules = reglasTaxonomia(filtros, indices)
  if (t) rules.push({ column_id: 'name', compare_value: t, operator: 'contains_text' })
  rules.push(reglaProveedor(proveedorId))
  return { rules, operator: 'and' }
}

/* ===== 3) Las dos consultas paginadas ===== */

/**
 * Página de resultados del catálogo. TODA la combinación de criterios y el corte de a
 * `PRODUCTOS_POR_PAGINA` los resuelve el servidor de Monday (`query_params` + `items_page`): acá
 * no se descarga el board para recortarlo después.
 *
 * `proveedorId` es obligatorio: sin proveedor elegido no hay catálogo que mostrar, porque no se
 * sabe de quién se está comprando.
 */
export async function buscarProductos(
  termino: string,
  filtros: Filtro[],
  proveedorId: string,
): Promise<PaginaProductos> {
  const { indices } = await getTaxonomiaProductos()
  const qp = construirQueryProductos(termino, filtros, indices, proveedorId)
  const data = await mondayApi<{ boards: { items_page: PaginaCruda }[] }>(
    `query ($limit: Int!, $qp: ItemsQuery) {
      boards(ids: [${BOARDS.productos}]) {
        items_page(limit: $limit, query_params: $qp) {
          cursor
          items { ${SELECCION_PRODUCTO} }
        }
      }
    }`,
    { limit: PRODUCTOS_POR_PAGINA, qp },
  )
  return filtrarPorProveedor(mapPagina(data.boards[0]?.items_page), proveedorId)
}

/**
 * Página siguiente. Va SÓLO con el cursor: Monday guarda en él la consulta original, así que no se
 * reenvían ni los filtros, ni el término, ni la regla del proveedor. Un cursor vence a la hora;
 * agotado el listado, la API deja de devolver cursor y la navegación se termina.
 *
 * Igual se vuelve a verificar el proveedor sobre lo que llega: el cursor es opaco y la app no
 * puede dar por sentado qué consulta guardó adentro.
 */
export async function siguientePaginaProductos(
  cursor: string,
  proveedorId: string,
): Promise<PaginaProductos> {
  const data = await mondayApi<{ next_items_page: PaginaCruda }>(
    `query ($limit: Int!, $cursor: String!) {
      next_items_page(limit: $limit, cursor: $cursor) {
        cursor
        items { ${SELECCION_PRODUCTO} }
      }
    }`,
    { limit: PRODUCTOS_POR_PAGINA, cursor },
  )
  return filtrarPorProveedor(mapPagina(data.next_items_page), proveedorId)
}

/**
 * Segunda pasada de la restricción, ya sobre el modelo de la app.
 *
 * La consulta ya la aplicó del lado del servidor, así que en la práctica esto no descarta nada.
 * Existe igual porque es la única forma de que la regla quede escrita en TypeScript y no
 * únicamente adentro de un string de GraphQL: si alguna vez alguien arma una consulta sin
 * `reglaProveedor`, acá se corta.
 */
const filtrarPorProveedor = (pagina: PaginaProductos, proveedorId: string): PaginaProductos => ({
  ...pagina,
  productos: pagina.productos.filter((p) => esDelProveedor(p, proveedorId)),
})

/* ===== 4) Opciones de los filtros (labels reales de las columnas dropdown) ===== */

/** Opciones disponibles para cada filtro de taxonomía. */
export type OpcionesFiltros = Record<CampoFiltro, string[]>

/** Taxonomía del Maestro: los labels que se muestran y los ids con los que se filtra. */
interface TaxonomiaProductos {
  opciones: OpcionesFiltros
  indices: IndicesFiltros
}

/** Etiquetas de una columna dropdown a partir de su `settings_str`. */
const etiquetasDropdown = (settingsStr: string): { id: number; name: string }[] => {
  const parsed = JSON.parse(settingsStr) as { labels?: { id: number; name: string }[] }
  return parsed.labels ?? []
}

/** Se lee una sola vez por sesión: las etiquetas del board no cambian mientras se opera. */
let taxonomiaCache: Promise<TaxonomiaProductos> | null = null

/**
 * Lee las columnas dropdown de Rubro/Subrubro/Categoría del Maestro: de ahí salen tanto los labels
 * de los selectores como los IDS de etiqueta, que son los que aceptan las reglas de `query_params`
 * (una columna dropdown no se filtra por su texto).
 */
function getTaxonomiaProductos(): Promise<TaxonomiaProductos> {
  if (taxonomiaCache) return taxonomiaCache
  taxonomiaCache = mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    `query {
      boards(ids: [${BOARDS.productos}]) {
        columns(ids: ["${COL.producto.rubro}","${COL.producto.subrubro}","${COL.producto.categoria}"]) {
          id settings_str
        }
      }
    }`,
  )
    .then((data) => {
      const cols = data.boards[0]?.columns ?? []
      const de = (id: string) => {
        const col = cols.find((c) => c.id === id)
        return col ? etiquetasDropdown(col.settings_str) : []
      }
      const opciones = {} as OpcionesFiltros
      const indices = {} as IndicesFiltros
      for (const [campo, columna] of Object.entries(CAMPO_COLUMNA) as [CampoFiltro, string][]) {
        const etiquetas = de(columna)
        opciones[campo] = etiquetas.map((l) => l.name)
        indices[campo] = Object.fromEntries(etiquetas.map((l) => [norm(l.name), l.id]))
      }
      return { opciones, indices }
    })
    .catch((e) => {
      // Un error no puede dejar cacheada una taxonomía vacía: se reintenta en la próxima búsqueda.
      taxonomiaCache = null
      throw e
    })
  return taxonomiaCache
}

/**
 * Opciones de Rubro/Subrubro/Categoría para poblar los selectores de filtro. Salen de las mismas
 * columnas dropdown que después se usan para filtrar del lado del servidor.
 */
export async function getOpcionesFiltros(): Promise<OpcionesFiltros> {
  return (await getTaxonomiaProductos()).opciones
}
