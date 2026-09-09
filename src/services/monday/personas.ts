/**
 * Búsqueda del PROVEEDOR contra el board de Personas (18420688238).
 *
 * Es la MISMA consulta y el mismo mapeo que usan el paso 1 de Cobros y la etapa 1 de Pagos: no hay
 * un board de proveedores, una persona es cliente o proveedor según su "✋Categoria", y todo lo
 * demás —código, CUIT, condición fiscal, condición de pago, cuenta corriente— son exactamente las
 * mismas columnas.
 *
 * La consulta se resuelve EN EL SERVIDOR (reglas de `items_page`), no trayendo el tablero entero y
 * filtrando en memoria: Personas tiene miles de ítems, así que cualquier filtrado del lado del
 * cliente devolvería "no existe" para todo el que caiga fuera de la primera página.
 *
 * LECTURA PURA. Este módulo no escribe una sola columna del tablero.
 */
import type { ActividadPersona, CondicionPago, Persona, Proveedor, SituacionPersona } from '@/types'
import {
  BOARDS,
  CATEGORIA_PROVEEDOR_INDEX,
  COL,
  PERSONA_ACTIVA_INDEX,
  SITUACION_PERSONA_INDEX,
} from './columns'
import { byId, num, numCol, sumaMirror, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/**
 * Qué ingresó el usuario. NO se intenta distinguir código de CUIT por la cantidad de dígitos: los
 * códigos del tablero van de 1 a 4 dígitos hoy y nada impide que mañana lleguen a 6, así que
 * cualquier corte por longitud tarde o temprano manda un código al ramal del CUIT. Un término
 * NUMÉRICO se busca en las DOS columnas y se unen los resultados.
 */
const esNumerico = (t: string): boolean => /^[\d.\s-]+$/.test(t) && /\d/.test(t)

/**
 * Situación a partir del ÍNDICE de la columna status, no de su texto: las etiquetas del board
 * ("0-Liberado Con Credito"…) se pueden reescribir, los índices no.
 *
 * Sin índice cargado se asume la situación más restrictiva que NO bloquea ("Liberado sin
 * crédito"): que a alguien le falte la etiqueta no es una decisión de nadie de bloquearlo, y
 * bloquearlo por omisión frenaría operaciones legítimas. El bloqueo tiene que ser explícito.
 */
function situacionDe(indice: number | null | undefined): SituacionPersona {
  switch (indice) {
    case SITUACION_PERSONA_INDEX.liberadoConCredito:
      return 'Liberado con crédito'
    case SITUACION_PERSONA_INDEX.bloqueado:
      return 'Bloqueado'
    default:
      return 'Liberado sin crédito'
  }
}

/** "30709067881" → "30-70906788-1". El board lo guarda corrido; se formatea en el borde de entrada. */
export function formatearCuit(valor: string | null | undefined): string {
  const d = String(valor ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(valor ?? '')
}

const columnasPersona = Object.values(COL.persona)

/** Campos que trae cada persona, con la Cta Cte conectada anidada (de ahí sale el crédito). */
const CAMPOS_PERSONA = `
  id name
  column_values(ids: ${JSON.stringify(columnasPersona)}) {
    id text
    ... on StatusValue { index }
    ... on BoardRelationValue {
      linked_items {
        id name
        column_values(ids: ["${COL.ctaCte.totalVentas}","${COL.ctaCte.totalCobros}","${COL.ctaCte.remitosPendFacturar}","${COL.ctaCte.limite}"]) {
          id text
          ... on MirrorValue { display_value }
        }
      }
    }
  }`

/**
 * Reglas que TODA búsqueda de proveedores arrastra, resueltas en el servidor junto con el término:
 * la persona tiene que ser de categoría "Proveedores" y estar ACTIVA.
 *
 * Van por ÍNDICE de etiqueta, no por texto: aguantan que en el board renombren "Activo" o
 * "Proveedores" sin que la app deje de encontrar a nadie. Y van en la consulta —no filtrando la
 * respuesta— para que los lugares del resultado los ocupen sólo proveedores utilizables.
 */
const REGLAS_PROVEEDOR_OPERABLE = [
  `{column_id: "${COL.persona.estado}", compare_value: [${PERSONA_ACTIVA_INDEX}], operator: any_of}`,
  `{column_id: "${COL.persona.categoria}", compare_value: [${CATEGORIA_PROVEEDOR_INDEX}], operator: any_of}`,
].join(', ')

/**
 * Cómo se compara el término contra la columna.
 *
 * `contains_text` es por SUBCADENA y sirve para el nombre, donde buscar un pedazo es justamente lo
 * que se quiere. `any_of` es la comparación EXACTA contra cualquiera de los valores que se le
 * pasen: es la del código y la del CUIT, que son identificadores y no admiten parecidos.
 */
type Comparacion = 'contains_text' | 'any_of'

/**
 * Cuántas coincidencias trae CADA página de la consulta. No es el tope de la búsqueda: el cursor
 * de Monday se sigue hasta agotar los resultados (ver `buscarPersonas`).
 *
 * 100 y no 500 porque la consulta trae, por cada persona, su cuenta corriente anidada: pedir de a
 * 500 hace que la API corte la conexión.
 */
const PAGINA = 100

/**
 * Tope de SEGURIDAD: hasta cuántas coincidencias se traen antes de cortar y pedir que se afine.
 *
 * Existe porque un término corto matchea muchísimo y ni la red ni el desplegable tienen sentido
 * con esos números. Lo importante es que al cortar se AVISA: el problema no es el tope sino que
 * sea MUDO —con un tope callado, quien busca un apellido común ve una parte y concluye que su
 * proveedor no está cargado—.
 */
const TOPE_RESULTADOS = 300

/** Escapa el término para poder interpolarlo en la query sin romperla. */
const literal = (t: string): string => JSON.stringify(t).slice(1, -1)

/**
 * Una consulta con nombre propio: `alias` la identifica en la respuesta.
 *
 * `valores` es una lista porque una misma búsqueda exacta puede tener más de una forma válida de
 * escribirse —el CUIT vive en el tablero con y sin guiones— y `any_of` acepta todas de una.
 */
const consultaPersonas = (
  alias: string,
  columna: string,
  valores: readonly string[],
  comparacion: Comparacion,
): string => `
  ${alias}: boards(ids: [${BOARDS.personas}]) {
    items_page(
      limit: ${PAGINA},
      query_params: {rules: [
        {column_id: "${columna}", compare_value: [${valores.map((v) => `"${literal(v)}"`).join(', ')}], operator: ${comparacion}},
        ${REGLAS_PROVEEDOR_OPERABLE}
      ]}
    ) {
      cursor
      items { ${CAMPOS_PERSONA} }
    }
  }`

/** La página SIGUIENTE de una consulta ya abierta. El cursor la identifica; las reglas ya viajaron. */
const consultaSiguiente = (alias: string, cursor: string): string => `
  ${alias}: next_items_page(limit: ${PAGINA}, cursor: "${literal(cursor)}") {
    cursor
    items { ${CAMPOS_PERSONA} }
  }`

interface PaginaPersonas {
  cursor: string | null
  items: MondayItem[]
}
type RespuestaPersonas = Record<string, { items_page: PaginaPersonas }[] | PaginaPersonas>

/** Lo que devuelve una búsqueda: las personas y si quedaron más afuera del tope. */
export interface ResultadoBusqueda<T> {
  personas: T[]
  /**
   * Se cortó por el tope y hay más coincidencias sin traer. La pantalla lo dice: callarlo es
   * exactamente el problema que este diseño evita.
   */
  truncado: boolean
}

/**
 * Busca personas EN EL SERVIDOR, por una o más columnas a la vez (una consulta con alias por
 * columna, todas en la misma solicitud), SIGUIENDO EL CURSOR hasta agotar las coincidencias.
 *
 * Ese seguimiento es lo importante. Pidiendo UNA sola página, lo que no entra simplemente no
 * existe para la app y sin ningún aviso: un término que coincide con más proveedores que el
 * tamaño de página deja a los demás inencontrables, y el usuario concluye que no están cargados.
 *
 * Las páginas siguientes de todas las columnas viajan JUNTAS, en una sola consulta por vuelta:
 * `next_items_page` es un campo de nivel raíz, así que se lo puede aliasar igual que la primera.
 */
async function buscarPersonas(
  porColumna: readonly { columna: string; valores: readonly string[]; comparacion: Comparacion }[],
): Promise<ResultadoBusqueda<MondayItem>> {
  const usables = porColumna
    .map((x) => ({ ...x, valores: x.valores.map((v) => v.trim()).filter(Boolean) }))
    .filter((x) => x.valores.length > 0)
  if (usables.length === 0) return { personas: [], truncado: false }

  const vistos = new Set<string>()
  const items: MondayItem[] = []
  /* Se acumula respetando el orden en que se pidieron las columnas, y sin repetir: una persona
     puede caer por código Y por CUIT, y en el desplegable tiene que figurar una sola vez. */
  const juntar = (pagina: PaginaPersonas | undefined) => {
    for (const it of pagina?.items ?? []) {
      if (vistos.has(it.id)) continue
      vistos.add(it.id)
      items.push(it)
    }
  }

  const primera = await mondayApi<RespuestaPersonas>(
    `query { ${usables.map((x, i) => consultaPersonas(`q${i}`, x.columna, x.valores, x.comparacion)).join('')} }`,
  )
  /* Cursor abierto por consulta. `null` = esa columna ya entregó todo lo que tenía. */
  let cursores = usables.map((_, i) => {
    const pagina = (primera[`q${i}`] as { items_page: PaginaPersonas }[] | undefined)?.[0]?.items_page
    juntar(pagina)
    return pagina?.cursor ?? null
  })

  let truncado = false
  while (cursores.some((c) => c !== null)) {
    if (items.length >= TOPE_RESULTADOS) {
      truncado = true
      break
    }
    const abiertos = cursores
      .map((cursor, i) => ({ cursor, i }))
      .filter((x): x is { cursor: string; i: number } => x.cursor !== null)

    const siguiente = await mondayApi<RespuestaPersonas>(
      `query { ${abiertos.map((x) => consultaSiguiente(`p${x.i}`, x.cursor)).join('')} }`,
    )
    cursores = [...cursores]
    for (const { i } of abiertos) {
      const pagina = siguiente[`p${i}`] as PaginaPersonas | undefined
      juntar(pagina)
      cursores[i] = pagina?.cursor ?? null
    }
  }

  /* Recortado al tope: se devuelve lo que entra y se avisa. Traer de más sólo para descartarlo
     sería gastar red en resultados que nadie va a mirar. */
  return { personas: items.slice(0, TOPE_RESULTADOS), truncado }
}

/**
 * Las formas válidas de escribir un mismo CUIT. En el tablero conviven los dos formatos —hay
 * personas con "30-70906788-1" y otras con "30709067881"—, y como la comparación es exacta hay que
 * preguntar por ambas o se pierde la mitad del padrón según cómo lo hayan cargado.
 *
 * Con menos de once dígitos no se arma el formato con guiones: no es un CUIT, es un código.
 */
const CUIT_DIGITOS = 11
const variantesCuit = (termino: string): string[] => {
  const d = termino.replace(/\D/g, '')
  if (!d) return []
  const variantes = new Set([d, termino.trim()])
  if (d.length === CUIT_DIGITOS) variantes.add(`${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`)
  return [...variantes]
}

/** Una fila del board de Personas → el modelo de la app. */
function mapPersona(item: MondayItem): Persona {
  const c = byId(item)
  /* Cta Cte conectada. El crédito se calcula acá a partir de las columnas base, no de las
     fórmulas del board:
        saldo            = total ventas − total cobros
        línea utilizada  = saldo + remitos pendientes de facturar
        disponible       = límite − línea utilizada
     El límite sale de la mirror de la cuenta y, si no viene, de la propia persona. */
  const cta = c[COL.persona.ctaCte]?.linked_items?.[0]
  const ctaCols = cta ? byId(cta) : {}
  const limitePersona = num(c[COL.persona.limite]?.text)
  /* Ventas y cobros son mirror de VARIOS movimientos: su display llega como lista ("977,
     3161621") y hay que sumarla. Remitos es un numérico común, y el límite una mirror de un
     solo valor: con `sumaMirror` un valor único se suma consigo mismo, así que va con numCol. */
  const totalVentas = sumaMirror(ctaCols[COL.ctaCte.totalVentas])
  const totalCobros = sumaMirror(ctaCols[COL.ctaCte.totalCobros])
  const remitosPendFacturar = numCol(ctaCols[COL.ctaCte.remitosPendFacturar])
  const limite = numCol(ctaCols[COL.ctaCte.limite]) || limitePersona
  const saldoCtaCte = totalVentas - totalCobros
  const lineaUtilizada = saldoCtaCte + remitosPendFacturar
  const agente = c[COL.persona.agenteRet]?.text ?? ''
  return {
    id: item.id,
    // El código del sistema es el que ve el usuario; el id del ítem queda para la API.
    codigo: c[COL.persona.codigo]?.text?.trim() || item.id,
    name: item.name,
    cuit: formatearCuit(c[COL.persona.cuit]?.text),
    /* "✋Categoria" es multi-valor y Monday devuelve su texto como lista separada por comas
       ("Clientes, Proveedores"): se parte y se limpia. De acá sale si la persona sirve. */
    categorias: (c[COL.persona.categoria]?.text ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    ptype: c[COL.persona.tipoPersona]?.text ?? '',
    status: c[COL.persona.condFiscal]?.text ?? '',
    list: c[COL.persona.listaPrecio]?.text || null,
    ret: agente || 'Ninguna',
    agenteRetencion: agente.trim().length > 0,
    // Sin condición de pago en el board llega null: no se asume ninguna.
    condicionPago: (c[COL.persona.condPago]?.text?.trim() || null) as CondicionPago | null,
    limit: limite,
    saldoCtaCte,
    lineaUtilizada,
    remitosPendFacturar,
    /* Sin Cta Cte conectada queda el límite completo: sin movimientos no se puede asumir deuda. */
    disponible: cta ? limite - lineaUtilizada : limite,
    addr: c[COL.persona.dirFiscal]?.text ?? '',
    activity: (c[COL.persona.estado]?.index === PERSONA_ACTIVA_INDEX
      ? 'Activo'
      : 'Inactivo') as ActividadPersona,
    situation: situacionDe(c[COL.persona.situacion]?.index),
  }
}

/**
 * La persona tiene su cuenta corriente conectada.
 *
 * Se mira "💵Cta Cte" (board_relation_mm5ep5qd), que es la MISMA columna para clientes y
 * proveedores. Sin ítem vinculado no hay cuenta: es lo que frena la operación cuando el proveedor
 * opera en CUENTA CORRIENTE (ver `proveedorSinCtaCte` en `lib/proveedorCompra`).
 */
const ctaCteConectada = (item: MondayItem): string | null =>
  byId(item)[COL.persona.ctaCte]?.linked_items?.[0]?.id ?? null

const mapProveedor = (item: MondayItem): Proveedor => {
  const ctaCteId = ctaCteConectada(item)
  return {
    ...mapPersona(item),
    tieneCtaCte: ctaCteId !== null,
    ctaCteId,
  }
}

/**
 * Busca proveedores por nombre, código o CUIT/CUIL. Un término numérico se busca a la vez por
 * código y por CUIT; uno con letras, por nombre.
 *
 * El nombre se busca por SUBCADENA —escribir un pedazo de la razón social es la forma normal de
 * llegar a un proveedor—, pero el código y el CUIT se comparan EXACTO. La subcadena ahí devuelve
 * personas sin relación con lo buscado: el código "7001" traía también al 2385, cuyo CUIT
 * (30619677001) TERMINA en 7001. Un identificador o es el que se buscó o no lo es, y ofrecer dos
 * proveedores cuando se escribió uno solo es peor que no ofrecer ninguno: invita a elegir al que
 * no era, y de ahí sale una orden emitida a otro.
 *
 * La categoría ("Proveedores") y el estado ACTIVO ya vienen aplicados en la consulta: lo que llega
 * es directamente operable, y un proveedor inactivo se comporta como inexistente.
 */
export async function buscarProveedores(termino: string): Promise<ResultadoBusqueda<Proveedor>> {
  const t = termino.trim()
  if (!t) return { personas: [], truncado: false }

  /* El código se compara tal como se escribió y también en dígitos pelados, por si vino con puntos
     o espacios. El CUIT, por sus variantes de formato (ver `variantesCuit`). Escribir un CUIT con
     guiones o sin ellos da lo mismo, y en las dos columnas la comparación es exacta. */
  const { personas, truncado } = esNumerico(t)
    ? await buscarPersonas([
        {
          columna: COL.persona.codigo,
          valores: [...new Set([t, t.replace(/\D/g, '')])],
          comparacion: 'any_of',
        },
        { columna: COL.persona.cuit, valores: variantesCuit(t), comparacion: 'any_of' },
      ])
    : await buscarPersonas([{ columna: 'name', valores: [t], comparacion: 'contains_text' }])

  return { personas: personas.map(mapProveedor), truncado }
}
