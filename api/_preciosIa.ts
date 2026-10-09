/**
 * Análisis con Claude de la LISTA DE PRECIOS de un proveedor contra sus productos del Maestro.
 *
 * La app manda la lista ya pasada a texto (CSV por hoja, ver `src/lib/listaExcel.ts`) y los productos
 * del proveedor con su costo y sus condiciones vigentes (descuentos y bonificación en mercadería). La
 * IA identifica qué productos cambiaron —de precio, de descuentos o de bonificación— y devuelve cada
 * uno con lo nuevo. Una condición que la lista no informa vuelve en `null`: se mantiene la vigente. La salida va atada a un JSON Schema (structured
 * outputs): la respuesta siempre parsea, y la consigna se queda con lo que importa —emparejar bien y
 * no inventar—.
 *
 * Lo que vuelve se FILTRA acá contra los productos recibidos: un id que no es del proveedor, un
 * precio no positivo o un precio igual al vigente no llegan a la pantalla. El precio anterior y la
 * variación los calcula la app con el costo del Maestro, no con lo que diga la IA.
 */
import Anthropic from '@anthropic-ai/sdk'
import { leerPrompt, type NombrePrompt } from './_prompts.js'

/** El modelo del análisis. Un precio mal emparejado es un costo mal cargado: va Opus. */
const MODELO = 'claude-opus-5-5'

export interface ProductoMaestro {
  id: string
  codigo: string
  codigoProveedor: string
  nombre: string
  precioActual: number
  /** Descuentos 1..4 vigentes, en % (5 = 5%), en orden de cascada. */
  descuentosActuales: number[]
  /** Bonificación en mercadería vigente, en %. */
  bonifActual: number
}

export interface PedidoAnalisis {
  proveedor: string
  productos: ProductoMaestro[]
  /** La lista del proveedor como texto: una tabla CSV por hoja. */
  lista: string
}

export interface ProductoActualizado {
  id: string
  codigo: string
  nombre: string
  precioAnterior: number
  precioNuevo: number
  /** Los descuentos que trae la lista, o `null` si no informa descuentos (o no cambian). */
  descuentosNuevos: number[] | null
  /** La bonificación en mercadería que trae la lista, o `null` si no la informa (o no cambia). */
  bonifNueva: number | null
  codigoEnLista: string
  coincidencia: 'codigo' | 'nombre'
}

/** Lo que falló, dicho para quien mira la pantalla. El detalle técnico va al log. */
export class ErrorAnalisis extends Error {
  constructor(
    mensaje: string,
    readonly status = 502,
  ) {
    super(mensaje)
  }
}

const SOPORTE = 'Por favor, contactate con el soporte de TAP para ver lo ocurrido, CODIGO:'

function prompt(nombre: NombrePrompt): string {
  try {
    return leerPrompt(nombre)
  } catch (e) {
    console.error('[precios-ia] no se pudo leer el prompt', nombre, e)
    throw new ErrorAnalisis(
      `Ocurrió un error al intentar analizar la lista con IA. ${SOPORTE} ERROR_PROMPT_IA (${nombre})`,
      500,
    )
  }
}

const ESQUEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['productos'],
  properties: {
    productos: {
      type: 'array',
      description:
        'Los productos del Maestro que están en la lista con un precio, descuentos o bonificación distintos de los actuales.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'codigo',
          'nombre',
          'precioAnterior',
          'precioNuevo',
          'descuentosNuevos',
          'bonifNueva',
          'codigoEnLista',
          'coincidencia',
        ],
        properties: {
          id: { type: 'string', description: 'El "id" del producto del Maestro, tal cual.' },
          codigo: { type: 'string', description: 'El "codigo" interno del producto del Maestro.' },
          nombre: { type: 'string', description: 'El "nombre" del producto del Maestro.' },
          precioAnterior: { type: 'number', description: 'El "precioActual" del Maestro, copiado tal cual.' },
          precioNuevo: {
            type: 'number',
            description: 'El precio de la lista nueva, con punto decimal. Si la lista no lo cambia, el actual.',
          },
          descuentosNuevos: {
            type: ['array', 'null'],
            items: { type: 'number' },
            description:
              'Los descuentos del producto en la lista, en % (5 = 5%), en orden de cascada y sin ceros. null si la lista no informa descuentos.',
          },
          bonifNueva: {
            type: ['number', 'null'],
            description: 'La bonificación en mercadería del producto en la lista, en %. null si la lista no la informa.',
          },
          codigoEnLista: { type: 'string', description: 'El código (o la descripción) del artículo en la lista.' },
          coincidencia: { type: 'string', enum: ['codigo', 'nombre'] },
        },
      },
    },
  },
}

/**
 * Avance del análisis, para la barra de progreso de la app.
 *
 *   · `analizando`: Claude recibió la lista y está razonando (todavía no escribe nada).
 *   · `respondiendo`: ya escribe la respuesta; `hechos` de `total` es la posición en el Maestro del
 *     último producto que devolvió. La consigna le pide los productos EN EL ORDEN del Maestro, así
 *     que esa posición crece sola y dice cuánto del catálogo ya recorrió —sin pedirle un solo token
 *     de más—.
 */
export type Progreso = { fase: 'analizando' } | { fase: 'respondiendo'; hechos: number; total: number }

export async function analizarLista(
  p: PedidoAnalisis,
  onProgreso: (e: Progreso) => void = () => {},
): Promise<ProductoActualizado[]> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new ErrorAnalisis(
      `Ocurrió un error al intentar analizar la lista con IA. ${SOPORTE} ERROR_API_KEY_ANTHROPIC`,
      503,
    )
  }
  if (!p.productos.length) throw new ErrorAnalisis('El proveedor no tiene productos en el Maestro.', 400)
  if (!p.lista.trim()) throw new ErrorAnalisis('La lista llegó vacía.', 400)

  const sistema = prompt('lista-precios.sistema')
  const pedido = prompt('lista-precios.pedido')
  const client = new Anthropic()

  /* Streaming: una lista larga con razonamiento puede tardar más de lo que aguanta un pedido sin
     stream. `finalMessage()` junta la respuesta entera. */
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: 64000,
    /* Si Opus rechaza el pedido por una política de seguridad, la API lo vuelve a correr en el
       modelo de respaldo que corresponda, en el mismo pedido. */
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    /* `high`: emparejar bien cada producto importa más que la demora. */
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: [{ type: 'text', text: sistema }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<proveedor>${p.proveedor}</proveedor>\n\n<productos_maestro>\n${JSON.stringify(p.productos)}\n</productos_maestro>`,
          },
          { type: 'text', text: `<lista_de_precios>\n${p.lista}\n</lista_de_precios>` },
          { type: 'text', text: pedido },
        ],
      },
    ],
  })
  onProgreso({ fase: 'analizando' })

  /* Cada `"id":"…"` completo que aparece en el texto es un producto ya resuelto. Se busca desde
     donde terminó el último encontrado: un id que llegó cortado se encuentra en el próximo trozo. */
  const posicion = new Map(p.productos.map((x, i) => [x.id, i]))
  const ID = /"id"\s*:\s*"([^"]+)"/g
  let hechos = 0
  let respondiendo = false
  stream.on('text', (_delta, texto) => {
    if (!respondiendo) {
      respondiendo = true
      onProgreso({ fase: 'respondiendo', hechos: 0, total: p.productos.length })
    }
    let m: RegExpExecArray | null
    let avanzo = false
    while ((m = ID.exec(texto))) {
      const i = posicion.get(m[1])
      if (i !== undefined && i + 1 > hechos) {
        hechos = i + 1
        avanzo = true
      }
    }
    /* `exec` deja `lastIndex` en 0 al no encontrar más: se retoma desde el último match. */
    ID.lastIndex = Math.max(0, texto.lastIndexOf('"id"'))
    if (avanzo) onProgreso({ fase: 'respondiendo', hechos, total: p.productos.length })
  })

  const mensaje = await stream.finalMessage()

  if (mensaje.stop_reason === 'refusal') throw new ErrorAnalisis('La IA no pudo procesar esta lista.')
  if (mensaje.stop_reason === 'max_tokens') {
    throw new ErrorAnalisis('La lista es demasiado larga para analizarla de una vez.')
  }

  /* Con structured outputs el texto ES el JSON. Si hubo un respaldo, el último bloque de texto es el
     del modelo que terminó la respuesta. */
  const bloques = mensaje.content.filter((b) => b.type === 'text')
  const salida = bloques[bloques.length - 1]?.text ?? ''
  let leido: { productos?: ProductoActualizado[] }
  try {
    leido = JSON.parse(salida) as { productos?: ProductoActualizado[] }
  } catch {
    throw new ErrorAnalisis('La IA devolvió una respuesta que no se pudo leer.')
  }

  /* Se queda lo que es del proveedor y cambió algo. Una condición IGUAL a la vigente vuelve como
     `null` ("no cambia"): así la app sólo marca y escribe lo que de verdad cambió. */
  const delProveedor = new Map(p.productos.map((x) => [x.id, x]))
  const vistos = new Set<string>()
  const resultado: ProductoActualizado[] = []
  for (const r of Array.isArray(leido.productos) ? leido.productos : []) {
    const original = delProveedor.get(String(r.id))
    if (!original || vistos.has(original.id)) continue
    if (!Number.isFinite(r.precioNuevo) || r.precioNuevo <= 0) continue
    const descuentos = Array.isArray(r.descuentosNuevos)
      ? r.descuentosNuevos.filter((d) => Number.isFinite(d) && d > 0 && d < 100).slice(0, 4)
      : null
    const bonif =
      typeof r.bonifNueva === 'number' && Number.isFinite(r.bonifNueva) && r.bonifNueva >= 0 ? r.bonifNueva : null
    const cambiaPrecio = Math.abs(r.precioNuevo - original.precioActual) >= 0.005
    const cambianDescuentos = descuentos !== null && !mismosDescuentos(descuentos, original.descuentosActuales)
    const cambiaBonif = bonif !== null && Math.abs(bonif - original.bonifActual) >= 0.005
    if (!cambiaPrecio && !cambianDescuentos && !cambiaBonif) continue
    vistos.add(original.id)
    resultado.push({
      ...r,
      id: original.id,
      precioAnterior: original.precioActual,
      precioNuevo: cambiaPrecio ? r.precioNuevo : original.precioActual,
      descuentosNuevos: cambianDescuentos ? descuentos : null,
      bonifNueva: cambiaBonif ? bonif : null,
    })
  }
  return resultado
}

/** Dos juegos de descuentos son el mismo si coinciden uno a uno (al centésimo), sin contar los ceros. */
function mismosDescuentos(a: readonly number[], b: readonly number[]): boolean {
  const x = a.filter((d) => d !== 0)
  const y = b.filter((d) => d !== 0)
  return x.length === y.length && x.every((d, i) => Math.abs(d - y[i]) < 0.005)
}
