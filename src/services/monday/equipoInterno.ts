/**
 * Los destinatarios INTERNOS del comprobante de una actualización de costos: los integrantes de los
 * equipos Administradores y Compras de la cuenta de La Batea.
 *
 * Quiénes son sale de los equipos de Monday (por ID, ver `EQUIPOS`); su email, de la "Lista
 * Blanca" (el tablero privado que habilita a cada usuario en las apps), cruzando por User ID. Se usa
 * el "Correo electrónico" de la lista y, si está vacío, el "Email Del Usuario". Sólo cuentan las
 * filas en estado "Activo": a alguien dado de baja no se le manda nada.
 *
 * Un integrante del equipo que no está en la lista blanca —o está sin email— queda afuera, y se
 * informa como `sinEmail`.
 *
 * `contactosEquipoInterno` los devuelve con la forma de un `Contacto`, que es lo que usa el
 * componente de envío (`EnviarDocumento`).
 */
import type { Contacto } from '@/types'
import { BOARDS, EQUIPOS } from './columns'
import { mondayApi } from './sdk'

/** Columnas de la Lista Blanca (las mismas que lee el guardián de "Operaciones de venta"). */
const LISTA_BLANCA = {
  userId: 'text_mm6hqsmt',
  estado: 'status',
  emailUsuario: 'text_mm6hkk9b',
  correo: 'email_mm6wcn8g',
  whatsapp: 'phone_mm6wbgnq',
} as const

const ACTIVO = 'activo'

export interface DestinatarioInterno {
  /** User ID de Monday. */
  id: string
  nombre: string
  email: string
  /** El WhatsApp de la Lista Blanca, si lo tiene. */
  telefono: string
  /** Los equipos en los que está ("Administradores", "Compras"). */
  equipos: string[]
}

export interface EquipoInterno {
  destinatarios: DestinatarioInterno[]
  /** Integrantes de los equipos sin email en la Lista Blanca. */
  sinEmail: string[]
}

let cache: Promise<EquipoInterno> | null = null

export function getEquipoInterno(): Promise<EquipoInterno> {
  cache ??= cargar().catch((e) => {
    cache = null
    throw e
  })
  return cache
}

async function cargar(): Promise<EquipoInterno> {
  const data = await mondayApi<{
    teams: { id: string; name: string; users: { id: string; name: string; enabled: boolean }[] }[]
    boards: { items_page: { items: { name: string; column_values: { id: string; text: string | null }[] }[] } }[]
  }>(
    `query ($equipos: [ID!], $board: ID!, $cols: [String!]) {
      teams(ids: $equipos) { id name users { id name enabled } }
      boards(ids: [$board]) { items_page(limit: 500) { items { name column_values(ids: $cols) { id text } } } }
    }`,
    {
      equipos: [EQUIPOS.administradores, EQUIPOS.compras],
      board: BOARDS.listaBlanca,
      cols: Object.values(LISTA_BLANCA),
    },
  )

  /* User ID → email y WhatsApp, sólo de las filas activas. */
  const emails = new Map<string, { email: string; telefono: string }>()
  for (const it of data.boards[0]?.items_page.items ?? []) {
    const c = Object.fromEntries(it.column_values.map((v) => [v.id, (v.text ?? '').trim()]))
    const id = c[LISTA_BLANCA.userId]
    const email = c[LISTA_BLANCA.correo] || c[LISTA_BLANCA.emailUsuario]
    if (id && email && c[LISTA_BLANCA.estado].toLowerCase() === ACTIVO) {
      emails.set(id, { email, telefono: c[LISTA_BLANCA.whatsapp] ?? '' })
    }
  }

  /* Cada usuario una sola vez, aunque esté en los dos equipos. */
  const porId = new Map<string, DestinatarioInterno>()
  const sinEmail = new Set<string>()
  for (const equipo of data.teams) {
    for (const u of equipo.users) {
      if (!u.enabled) continue
      const id = String(u.id)
      const datos = emails.get(id)
      if (!datos) {
        sinEmail.add(u.name)
        continue
      }
      const ya = porId.get(id)
      if (ya) ya.equipos.push(equipo.name)
      else porId.set(id, { id, nombre: u.name, ...datos, equipos: [equipo.name] })
    }
  }
  return {
    destinatarios: [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    sinEmail: [...sinEmail].sort((a, b) => a.localeCompare(b, 'es')),
  }
}

const COLORES = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#037f4c', '#ff7575', '#66ccff']

/** Administración y Compras como contactos del envío: todos arrancan seleccionados. */
export async function contactosEquipoInterno(): Promise<Contacto[]> {
  const { destinatarios } = await getEquipoInterno()
  return destinatarios.map((d) => ({
    id: d.id,
    name: d.nombre,
    email: d.email,
    phone: d.telefono,
    ini: d.nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
    color: COLORES[[...d.id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length],
    status: d.equipos.join(' · '),
    ok: true,
    paraEnviar: [],
  }))
}
