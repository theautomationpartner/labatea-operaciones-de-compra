/**
 * Contactos del PROVEEDOR (board "Contactos", 18420688239).
 *
 * Cuelgan de la persona por su columna conectada `account_contact`, que es la MISMA para clientes y
 * proveedores: por eso la consulta es idéntica a la de la app de ventas y sólo cambia de quién se
 * parte. De cada contacto sale a quién enviarle el documento y por qué vía.
 *
 * Lo único que escribe es la edición de un contacto desde el envío (`actualizarContacto`): su email
 * y si acepta la orden de compra.
 */
import type { Contacto } from '@/types'
import { BOARDS, COL } from './columns'
import { byId, type CV, type MondayItem } from './parse'
import { mondayApi } from './sdk'

/** Nombre del documento que este circuito emite, tal como se busca en "✋Para Enviar". */
export const DOCUMENTO_ORDEN_COMPRA = 'Orden de Compra'

const norm = (s: string) => s.trim().toLowerCase()

function mapContacto(
  item: { id: string; name: string; column_values?: CV[] },
  documento: string,
): Contacto {
  const c = byId({ column_values: item.column_values ?? [] })
  /* "✋Para Enviar" es multi-valor: Monday devuelve su texto como lista separada por comas
     ("Factura, Remito, Presupuesto"). El contacto acepta el documento si figura entre sus valores. */
  const paraEnviar = (c[COL.contacto.paraEnviar]?.text ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const ok = paraEnviar.some((x) => norm(x) === norm(documento))

  /* El nombre se arma con las columnas Nombre + Apellido del board, no con el `name` del ítem
     (que suele traer la empresa). Si ninguna vino cargada, se cae al nombre del ítem. */
  const nombre = (c[COL.contacto.nombre]?.text ?? '').trim()
  const apellido = (c[COL.contacto.apellido]?.text ?? '').trim()
  const completo = [nombre, apellido].filter(Boolean).join(' ') || item.name

  return {
    id: c[COL.contacto.codigo]?.text || item.id,
    itemId: item.id,
    name: completo,
    phone: c[COL.contacto.telefono]?.text ?? '',
    email: c[COL.contacto.email]?.text ?? '',
    // Iniciales: la del nombre y la del apellido cuando existen.
    ini: completo
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase(),
    color: '#0073ea',
    status: estadoDe(ok, documento),
    ok,
    paraEnviar,
  }
}

/** El rótulo del badge: "ACEPTA ORDEN DE COMPRA" / "NO ACEPTA ORDEN DE COMPRA". */
const estadoDe = (ok: boolean, documento: string): string =>
  ok ? `ACEPTA ${documento.toUpperCase()}` : `NO ACEPTA ${documento.toUpperCase()}`

/**
 * Memoiza por proveedor: la etapa de emisión se vuelve a montar cada vez que se navega con el
 * stepper, y sin esto la consulta se repetiría en cada visita —haciendo parpadear el "Cargando
 * contactos…", que además tapa el estado de "Enviado exitosamente"—.
 *
 * Un fallo NO se cachea: el próximo intento vuelve a preguntar.
 */
const cache = new Map<string, Promise<Contacto[]>>()

async function pedirContactos(proveedorId: string, documento: string): Promise<Contacto[]> {
  const data = await mondayApi<{ items: MondayItem[] }>(
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        column_values(ids: ["${COL.persona.contactos}"]) {
          ... on BoardRelationValue {
            linked_items {
              id name
              column_values(ids: ["${COL.contacto.codigo}","${COL.contacto.nombre}","${COL.contacto.apellido}","${COL.contacto.email}","${COL.contacto.telefono}","${COL.contacto.paraEnviar}"]) { id text }
            }
          }
        }
      }
    }`,
    { ids: [proveedorId] },
  )
  const linked = data.items[0]?.column_values[0]?.linked_items ?? []
  return linked.map((it) => mapContacto(it, documento))
}

/**
 * Todos los contactos del proveedor, clasificados según si aceptan el documento.
 *
 * Devuelve la lista COMPLETA, no sólo los que aceptan: los que no, quedan disponibles en el
 * buscador por si igual se los quiere sumar a mano. La preselección la hace la vista con `ok`.
 */
export function getContactosProveedor(
  proveedorId: string,
  documento: string = DOCUMENTO_ORDEN_COMPRA,
): Promise<Contacto[]> {
  const clave = `${proveedorId}·${documento}`
  let pendiente = cache.get(clave)
  if (!pendiente) {
    pendiente = pedirContactos(proveedorId, documento).catch((e) => {
      cache.delete(clave)
      throw e
    })
    cache.set(clave, pendiente)
  }
  return pendiente
}

/** Email con forma válida (algo@algo.algo). */
export const emailValido = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/**
 * Edita un contacto del proveedor en el tablero "Contactos": su email y si acepta la orden de
 * compra (la etiqueta "Orden de Compra" de su "✋Para Enviar"). Las demás etiquetas de "✋Para
 * Enviar" (Factura, Orden de Pago…) se conservan tal cual.
 *
 * Devuelve el contacto ya actualizado, y descarta la lista cacheada de ese proveedor para que la
 * próxima lectura traiga lo que quedó en Monday.
 */
export async function actualizarContacto(
  contacto: Contacto,
  cambios: { email: string; aceptaOrdenCompra: boolean },
  proveedorId: string,
  documento: string = DOCUMENTO_ORDEN_COMPRA,
): Promise<Contacto> {
  if (!contacto.itemId) throw new Error('El contacto no tiene ítem en Monday.')
  const email = cambios.email.trim()
  const sinDocumento = contacto.paraEnviar.filter((x) => norm(x) !== norm(documento))
  const paraEnviar = cambios.aceptaOrdenCompra ? [...sinDocumento, documento] : sinDocumento

  await mondayApi(
    `mutation ($id: ID!, $board: ID!, $cv: JSON!) {
      change_multiple_column_values(item_id: $id, board_id: $board, column_values: $cv, create_labels_if_missing: false) { id }
    }`,
    {
      id: contacto.itemId,
      board: BOARDS.contactos,
      cv: JSON.stringify({
        [COL.contacto.email]: { email, text: email },
        [COL.contacto.paraEnviar]: { labels: paraEnviar },
      }),
    },
  )

  for (const clave of [...cache.keys()]) if (clave.startsWith(`${proveedorId}·`)) cache.delete(clave)
  return {
    ...contacto,
    email,
    paraEnviar,
    ok: cambios.aceptaOrdenCompra,
    status: estadoDe(cambios.aceptaOrdenCompra, documento),
  }
}
