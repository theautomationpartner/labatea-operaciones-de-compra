/**
 * Compradores y usuario logueado. Las dos cosas salen del MISMO viaje a Monday: la app las pide al
 * montar, casi en el mismo instante, y sin compartir la promesa serían dos consultas por lo mismo.
 *
 * El usuario logueado (`me`) es el dueño del token cargado en `.env.local`, y es el que queda
 * PRESELECCIONADO en el selector de comprador (ver `state/appState.ts`).
 *
 * Hoy la lista de compradores son los usuarios activos de la cuenta. En "Operaciones de venta" esa
 * lista sale de un tablero privado de habilitados; acá todavía no hay uno equivalente, así que la
 * fuente se cambia en `leerEquipo()` cuando se defina cuál es.
 */
import type { Comprador, UsuarioActual } from '@/types'
import { mondayApi, mondayHabilitado } from './sdk'

/** Paleta de colores para el avatar del comprador, asignada por posición. */
const COLORES_COMPRADOR = [
  'var(--avatar-orange)',
  'var(--red)',
  'var(--green)',
  '#575ce5',
  'var(--primary-blue)',
  'var(--purple)',
] as const

/** Iniciales del nombre: la primera letra de las dos primeras palabras, en mayúscula. */
const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

interface UsuarioApi {
  id: string
  name: string
  is_admin?: boolean | null
  enabled?: boolean | null
  teams?: { id: string }[] | null
}

interface Equipo {
  usuarios: UsuarioApi[]
  yo: UsuarioApi | null
}

/** Un solo pedido para las dos consultas. Un fallo NO se cachea: el próximo intento repregunta. */
let enCurso: Promise<Equipo> | null = null

function equipo(): Promise<Equipo> {
  enCurso ??= leerEquipo().catch((e) => {
    enCurso = null
    throw e
  })
  return enCurso
}

async function leerEquipo(): Promise<Equipo> {
  // Sin token no hay a quién preguntarle: se devuelve vacío y la UI lo refleja.
  if (!mondayHabilitado()) return { usuarios: [], yo: null }

  /* OJO con los campos de `users`: la app fija `API-Version: 2024-10` (ver `sdk.ts`) y ahí NO
     existe `User.kind`. Pedirlo hace que Monday rechace el documento ENTERO en la validación —no
     sólo ese campo—, así que la respuesta vendría sin `users` ni `me`. El admin de la cuenta se lee
     con `is_admin`, que sí existe en esa versión. */
  const data = await mondayApi<{ users?: UsuarioApi[] | null; me?: UsuarioApi | null }>(
    `query {
      users(limit: 200) { id name is_admin enabled teams { id } }
      me { id name is_admin teams { id } }
    }`,
  )
  return { usuarios: data.users ?? [], yo: data.me ?? null }
}

const equiposDe = (u: UsuarioApi): string[] => (u.teams ?? []).map((t) => String(t.id))

/**
 * Los compradores que puebla el selector.
 *
 * Se filtran los usuarios desactivados: siguen existiendo en la cuenta pero no pueden firmar una
 * operación. Ante un error, la app deja la lista vacía y sigue: no querer leer un catálogo no
 * puede trabar la operación.
 */
export async function getCompradores(): Promise<Comprador[]> {
  const { usuarios } = await equipo()
  return usuarios
    .filter((u) => u.enabled !== false)
    .map((u, i) => ({
      id: String(u.id),
      name: u.name,
      ini: iniciales(u.name),
      color: COLORES_COMPRADOR[i % COLORES_COMPRADOR.length],
      equiposIds: equiposDe(u),
      esAdminDeCuenta: u.is_admin === true,
    }))
}

/** El usuario que abrió la app: el dueño del token. Es el comprador por defecto. */
export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  const { yo } = await equipo()
  if (!yo) return null
  return {
    id: String(yo.id),
    name: yo.name,
    isAdmin: yo.is_admin === true,
    equiposIds: equiposDe(yo),
  }
}
