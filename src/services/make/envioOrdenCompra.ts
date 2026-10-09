/**
 * Envío de la orden de compra PDF a los contactos del proveedor, por el escenario de Make.com.
 *
 * Mismo esquema que el envío del presupuesto en "Operaciones de venta": NUNCA se pega directo al
 * webhook, sino a `/api/make-envio-oc` (función de Vercel en producción, middleware de Vite en
 * desarrollo), que tiene la dirección del lado servidor.
 *
 * El cuerpo es la MISMA estructura de datos que el escenario de envío de documentos de ventas
 * (`appJobId`, `documento`, `cliente`, `vendedor`, `medio`, `destinatarios[]`, `adjuntos[]`, `pdf`),
 * con la orden como documento: el proveedor viaja en `cliente` y el comprador en `vendedor`. Cada
 * destinatario ya trae por qué canales se le manda y los textos del mensaje, así el escenario no
 * decide nada. El PDF va en base64; en Make se pasa a archivo con `toBinary(pdf.data; "base64")`.
 *
 * Qué contesta el escenario (módulo "Webhook response", 200 o 400), igual que en ventas:
 *   { "operacion", "medio", "mensajeError", "enviosEmail": [...], "enviosWhatsapp": [...] }
 * Un ítem por contacto y canal: `{ envio_email }` y `{ envio_mensaje_texto, envio_mensaje_documentos }`
 * (o el formato anterior `{ envio_whatsapp }`). Lo que el escenario no confirma no se da por enviado.
 *
 * No se reintenta solo: si el escenario llegó a correr, reintentar mandaría la orden dos veces.
 */
import { nroOrdenMensaje } from '@/lib/ordenDoc'
import { faltaParaMedio } from '@/lib/validaciones'
import type { Comprador, Contacto, MedioEnvio, Proveedor } from '@/types'

const ENDPOINT = '/api/make-envio-oc'

export interface DatosEnvioOrden {
  numero: string
  /** "dd/mm/yyyy". */
  fechaEmision: string
  /** "dd/mm/yyyy": emisión + días del proveedor. Va como `fechaVencimiento` del documento. */
  fechaRecepcionEstimada?: string | null
  proveedor: Proveedor
  comprador: Comprador | null
  /** Casilla desde la que tiene que salir el correo (Mechi o logística). */
  casilla: string
  medio: MedioEnvio
  contactos: readonly Contacto[]
  total: number
  pdf: File
  /**
   * La orden ya se había enviado y se vuelve a mandar porque se EDITÓ: cambian el asunto y el texto
   * del mensaje. `fecha` ("dd/mm/yyyy") es la del reenvío, la que se nombra en el texto.
   */
  reenvioPorEdicion?: { fecha: string }
}

/** `aviso`: el envío salió, pero no a todos por todos los canales pedidos. */
export type ResultadoEnvioOrden = { ok: true; aviso?: string } | { ok: false; mensaje: string }

type Canal = 'email' | 'whatsapp'

/* ===== El cuerpo ===== */

/** "dd/mm/yyyy" → "yyyy-mm-dd" (lo que Make parsea sin configurar nada). */
const fechaIso = (ddmmyyyy: string): string => {
  const [d, m, a] = ddmmyyyy.split('/')
  return d && m && a ? `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : ddmmyyyy
}

/** "dd/mm/yyyy" → "dd-mm-yyyy", el formato de los mensajes. */
const fechaMensaje = (ddmmyyyy: string | null | undefined): string => (ddmmyyyy ?? '').split('/').join('-')

/** "1045 - LABORATORIO WEIZUR ARGENTINA S.A." → "LABORATORIO WEIZUR ARGENTINA S.A.". */
const razonSocialDe = (nombre: string): string => nombre.replace(/^\s*\d+\s*-\s*/, '').trim() || nombre

/** Los canales por los que se le puede mandar a un contacto con el medio elegido. */
function canalesDe(c: Contacto, medio: MedioEnvio): Canal[] {
  const falta = faltaParaMedio(c, medio)
  const canales: Canal[] = []
  if ((medio === 'Email' || medio === 'Ambos') && !falta.email) canales.push('email')
  if ((medio === 'WhatsApp' || medio === 'Ambos') && !falta.telefono) canales.push('whatsapp')
  return canales
}

/** Los textos que acompañan al PDF: WhatsApp con su formato (*negrita*) y el email en HTML. */
function mensajes(d: DatosEnvioOrden, razonSocial: string) {
  const emision = fechaMensaje(d.fechaEmision)
  const recepcion = d.fechaRecepcionEstimada ? fechaMensaje(d.fechaRecepcionEstimada) : null
  const nro = nroOrdenMensaje(d.numero)

  if (d.reenvioPorEdicion) {
    const fecha = fechaMensaje(d.reenvioPorEdicion.fecha)
    return {
      whatsapp: [
        `👋*¡Hola ${razonSocial} !*`,
        `Te adjuntamos la *ORDEN DE COMPRA ${nro}* emitida el ${fecha} con cambios realizados en lo solicitado. Cualquier duda estamos a tu disposición.`,
        '',
        '*LA BATEA*',
      ].join('\n'),
      email: {
        subject: `Reenviamos cambios en solicitud de la Orden de Compra ${nro} La Batea S.A`,
        content:
          `👋<b>¡Hola ${razonSocial}!</b><br>` +
          `Te adjuntamos la Orden de Compra ${nro} emitida el ${fecha} con cambios realizados en lo solicitado. Cualquier duda estamos a tu disposición.<br><br>` +
          '<b>LA BATEA</b>',
      },
    }
  }

  return {
    whatsapp: [
      `👋*¡Hola ${razonSocial} !*`,
      `Te adjuntamos la *ORDEN DE COMPRA N°${d.numero}* emitida el dia ${emision}. Cualquier duda estamos a tu disposicion.`,
      ...(recepcion ? ['', `*Fecha de Recepción Estimada:* ${recepcion}`] : []),
      '',
      '*LA BATEA*',
    ].join('\n'),
    email: {
      subject: `Solicitud de una nueva Orden de Compra ${nro} La Batea S.A`,
      content:
        `👋<b>¡Hola ${razonSocial}!</b><br>` +
        `Te adjuntamos la <b>Orden de Compra N°${d.numero}</b> emitida el <b>${emision}</b>. Cualquier duda estamos a tu disposición.<br><br>` +
        (recepcion ? `<b>Fecha de Recepción Estimada:</b> ${recepcion}<br><br>` : '') +
        '<b>LA BATEA</b>',
    },
  }
}

/** Un archivo como base64, por tandas: `fromCharCode(...bytes)` de un archivo entero rompe la pila. */
async function aBase64(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

/** Id del envío: vuelve en el historial de Make y permite rastrear un envío puntual. */
const nuevoJobId = (): string =>
  `job_${Date.now()}_${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`

/** El cuerpo del webhook, con la estructura de datos del escenario. */
async function cuerpoEnvio(d: DatosEnvioOrden) {
  const razonSocial = razonSocialDe(d.proveedor.name)
  const mensaje = mensajes(d, razonSocial)
  const destinatarios = d.contactos
    .map((c) => ({
      pulseId: c.itemId ?? c.id,
      nombre: c.name,
      // `null` cuando no hay dato: nunca un string vacío que el escenario tenga que interpretar.
      email: c.email.trim() || null,
      whatsapp: c.phone.trim() || null,
      canales: canalesDe(c, d.medio),
      mensaje,
    }))
    .filter((x) => x.canales.length > 0)
  const pdf = { name: d.pdf.name, mime: d.pdf.type || 'application/pdf', data: await aBase64(d.pdf) }
  return {
    appJobId: nuevoJobId(),
    documento: {
      tipo: 'ORDEN DE COMPRA',
      numero: d.numero,
      fechaEmision: fechaIso(d.fechaEmision),
      // La orden no vence: el campo lleva la fecha en que debería estar recibida toda la mercadería.
      fechaVencimiento: d.fechaRecepcionEstimada ? fechaIso(d.fechaRecepcionEstimada) : null,
      archivo: d.pdf.name,
    },
    // El código interno del proveedor no viaja.
    cliente: { pulseId: d.proveedor.id, razonSocial, cuit: d.proveedor.cuit },
    vendedor: d.comprador ? { pulseId: d.comprador.id, nombre: d.comprador.name } : null,
    medio: d.medio,
    tipo_de_envio_email: 'gmail',
    reenvio_email: d.medio === 'Email' || d.medio === 'Ambos',
    reenvio_whatsapp: d.medio === 'WhatsApp' || d.medio === 'Ambos',
    destinatarios,
    /* Desde qué casilla tiene que salir el correo: la de Mechi para sus órdenes, la de logística
       para el resto. No está en la estructura de ventas: el escenario de compras la usa de remitente. */
    casilla_remitente: d.casilla,
    adjuntos: [pdf],
    pdf,
  }
}

/* ===== La respuesta ===== */

/** El texto de un campo, o `''` si no vino o no es texto. */
const campo = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Una bandera del escenario: booleano o "true"/"false". Sin la clave, `false`. */
const bandera = (v: unknown): boolean => v === true || campo(v).toLowerCase() === 'true'

/** Los ítems de un array del escenario (también serializado como texto, o un objeto suelto). */
function items(v: unknown): Record<string, unknown>[] {
  let valor = v
  if (typeof valor === 'string' && /^\s*[[{]/.test(valor)) {
    try {
      valor = JSON.parse(valor)
    } catch {
      valor = null
    }
  }
  const lista = Array.isArray(valor) ? valor : valor && typeof valor === 'object' ? [valor] : []
  return lista.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
}

/** El id de un mensaje de 360Messenger: `{ id }` o `{ data: { id } }`. */
const idMensaje = (v: unknown): string => {
  if (!v || typeof v !== 'object') return ''
  const o = v as { id?: unknown; data?: unknown }
  return campo(o.id) || idMensaje(o.data)
}

/** Un ítem de WhatsApp salió: con el formato nuevo, el texto y todos los documentos tienen id. */
function salioWhatsapp(item: Record<string, unknown>): boolean {
  if ('envio_mensaje_texto' in item || 'envio_mensaje_documentos' in item) {
    const documentos = items(item.envio_mensaje_documentos).map(idMensaje)
    return (
      Boolean(idMensaje(item.envio_mensaje_texto)) &&
      documentos.length > 0 &&
      documentos.every(Boolean) &&
      (!('envio_whatsapp' in item) || bandera(item.envio_whatsapp))
    )
  }
  return bandera(item.envio_whatsapp)
}

/**
 * Evalúa lo que contestó el escenario. Si no trajo el detalle por canal (respondió sin JSON o sin
 * los arrays), se toma como enviado: el escenario corrió y no informó ningún error.
 */
function evaluar(
  cuerpo: Record<string, unknown> | null,
  destinatarios: { nombre: string; canales: Canal[] }[],
): ResultadoEnvioOrden {
  const motivo = campo(cuerpo?.mensajeError) || campo(cuerpo?.error)
  const tieneDetalle =
    !!cuerpo && ('enviosEmail' in cuerpo || 'enviosWhatsapp' in cuerpo || 'enviados_whatsapp' in cuerpo)
  if (!tieneDetalle) {
    return motivo ? { ok: false, mensaje: motivo } : { ok: true }
  }

  const resultados: Record<Canal, boolean[]> = {
    email: items(cuerpo!.enviosEmail).map((i) => bandera(i.envio_email)),
    whatsapp: items(cuerpo!.enviosWhatsapp ?? cuerpo!.enviados_whatsapp).map(salioWhatsapp),
  }
  // Los ítems se emparejan por ORDEN con los destinatarios que pidieron ese canal.
  const fallas: string[] = []
  let salioAlgo = false
  for (const canal of ['email', 'whatsapp'] as const) {
    destinatarios
      .filter((x) => x.canales.includes(canal))
      .forEach((x, i) => {
        if (resultados[canal][i]) salioAlgo = true
        else fallas.push(`${x.nombre} (${canal === 'email' ? 'email' : 'WhatsApp'})`)
      })
  }
  if (fallas.length === 0) return { ok: true }
  const detalle = `No se pudo enviar a: ${fallas.join(', ')}.${motivo ? ` ${motivo}` : ''}`
  /* Algo salió: la orden ya está en manos del proveedor. Se da por enviada —reintentar se la
     mandaría dos veces a los que sí la recibieron— y se avisa a quiénes no les llegó. */
  return salioAlgo ? { ok: true, aviso: detalle } : { ok: false, mensaje: detalle }
}

/* ===== Envío ===== */

async function postear(cuerpo: unknown): Promise<{ status: number; json: Record<string, unknown> | null } | string> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    return 'No hubo conexión con el servicio de envío. Revisá tu conexión y reintentá.'
  }
  const texto = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    const v = JSON.parse(texto) as unknown
    json = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    json = null
  }
  return { status: res.status, json }
}

export async function enviarOrdenCompraMake(d: DatosEnvioOrden): Promise<ResultadoEnvioOrden> {
  const cuerpo = await cuerpoEnvio(d)
  if (cuerpo.destinatarios.length === 0) {
    return { ok: false, mensaje: `Ningún contacto elegido tiene ${d.medio === 'WhatsApp' ? 'WhatsApp' : 'email'} cargado.` }
  }
  const r = await postear(cuerpo)
  if (typeof r === 'string') return { ok: false, mensaje: r }
  // 200 o 400: el escenario corrió y dice, canal por canal, qué salió.
  if (r.status === 200 || r.status === 400) return evaluar(r.json, cuerpo.destinatarios)
  const motivo = campo(r.json?.mensajeError) || campo(r.json?.error)
  return { ok: false, mensaje: motivo || `El servicio de envío respondió con un error (${r.status}).` }
}

/* ===== Consulta al proveedor ===== */

export interface DatosConsultaOrden {
  numero: string
  proveedor: { id: string; nombre: string }
  comprador: Comprador | null
  casilla: string
  contactos: readonly Contacto[]
  /** El mensaje, tal como lo dejó el usuario. */
  texto: string
}

/**
 * Consulta al proveedor por el estado de una orden ya emitida. Va al MISMO escenario que el envío
 * de la orden: el escenario separa los dos casos por `operacion` ("CONSULTA ORDEN DE COMPRA").
 */
export async function enviarConsultaOrdenMake(d: DatosConsultaOrden): Promise<ResultadoEnvioOrden> {
  const r = await postear({
    operacion: 'CONSULTA ORDEN DE COMPRA',
    numero: d.numero,
    asunto: `Consulta por la Orden de Compra ${nroOrdenMensaje(d.numero)}`,
    mensaje: d.texto,
    casilla: d.casilla,
    proveedor: d.proveedor,
    comprador: d.comprador
      ? { id: d.comprador.id, nombre: d.comprador.name, email: d.comprador.email }
      : null,
    destinatarios: d.contactos.map((c) => ({
      itemId: c.itemId ?? null,
      nombre: c.name,
      email: c.email,
      telefono: c.phone,
    })),
  })
  if (typeof r === 'string') return { ok: false, mensaje: r }
  const motivo = campo(r.json?.mensajeError) || campo(r.json?.error)
  if (r.status !== 200 || motivo || r.json?.ok === false) {
    return { ok: false, mensaje: motivo || `El servicio de envío respondió con un error (${r.status}).` }
  }
  return { ok: true }
}

/* ===== Comprobante de una actualización de costos ===== */

export interface DatosEnvioActualizacion {
  /** "dd/mm/yyyy": el día de la actualización. */
  fecha: string
  proveedor: { id: string; name: string }
  responsable: { id: string; name: string } | null
  /** Casilla desde la que sale el correo. */
  casilla: string
  medio: MedioEnvio
  /** Integrantes de Administración y Compras, como contactos del envío. */
  contactos: readonly Contacto[]
  /** Cuántos productos se actualizaron, para el texto del mensaje. */
  productos: number
  pdf: File
}

/**
 * Manda el comprobante de una actualización de costos al equipo interno (Administración y Compras),
 * por el MISMO escenario de Make que la orden de compra. El escenario separa los casos por
 * `operacion` ("ENVIO ACTUALIZACION DE COSTOS"), igual que la consulta al proveedor; el resto del
 * cuerpo tiene la estructura de siempre (`documento`, `destinatarios[]` con sus canales y mensajes,
 * `adjuntos[]`, `pdf`) y la respuesta se evalúa igual, canal por canal.
 */
export async function enviarActualizacionCostosMake(d: DatosEnvioActualizacion): Promise<ResultadoEnvioOrden> {
  const razonSocial = razonSocialDe(d.proveedor.name)
  const fecha = fechaMensaje(d.fecha)
  const cuantos = `${d.productos} ${d.productos === 1 ? 'producto actualizado' : 'productos actualizados'}`
  const por = d.responsable ? ` por ${d.responsable.name}` : ''
  const mensaje = {
    whatsapp: [
      '👋*¡Hola!*',
      `Te adjuntamos el comprobante de la *ACTUALIZACIÓN DE COSTOS* de *${razonSocial}* realizada el ${fecha}${por}: ${cuantos} en el Maestro de Productos.`,
      '',
      '*LA BATEA*',
    ].join('\n'),
    email: {
      subject: `Actualización de costos ${razonSocial} - ${fecha}`,
      content:
        `👋<b>¡Hola!</b><br>` +
        `Te adjuntamos el comprobante de la <b>actualización de costos</b> de <b>${razonSocial}</b> realizada el <b>${fecha}</b>${por}: ${cuantos} en el Maestro de Productos.<br><br>` +
        '<b>LA BATEA</b>',
    },
  }
  const destinatarios = d.contactos
    .map((c) => ({
      pulseId: c.id,
      nombre: c.name,
      email: c.email.trim() || null,
      whatsapp: c.phone.trim() || null,
      canales: canalesDe(c, d.medio),
      mensaje,
    }))
    .filter((x) => x.canales.length > 0)
  if (destinatarios.length === 0) {
    return { ok: false, mensaje: `Ningún destinatario elegido tiene ${d.medio === 'WhatsApp' ? 'WhatsApp' : 'email'} cargado.` }
  }
  const pdf = { name: d.pdf.name, mime: d.pdf.type || 'application/pdf', data: await aBase64(d.pdf) }
  const r = await postear({
    operacion: 'ENVIO ACTUALIZACION DE COSTOS',
    appJobId: nuevoJobId(),
    documento: {
      tipo: 'ACTUALIZACION DE COSTOS',
      numero: null,
      fechaEmision: fechaIso(d.fecha),
      fechaVencimiento: null,
      archivo: d.pdf.name,
    },
    cliente: { pulseId: d.proveedor.id, razonSocial, cuit: null },
    vendedor: d.responsable ? { pulseId: d.responsable.id, nombre: d.responsable.name } : null,
    medio: d.medio,
    tipo_de_envio_email: 'gmail',
    reenvio_email: d.medio === 'Email' || d.medio === 'Ambos',
    reenvio_whatsapp: d.medio === 'WhatsApp' || d.medio === 'Ambos',
    destinatarios,
    casilla_remitente: d.casilla,
    adjuntos: [pdf],
    pdf,
  })
  if (typeof r === 'string') return { ok: false, mensaje: r }
  if (r.status === 200 || r.status === 400) return evaluar(r.json, destinatarios)
  const motivo = campo(r.json?.mensajeError) || campo(r.json?.error)
  return { ok: false, mensaje: motivo || `El servicio de envío respondió con un error (${r.status}).` }
}
