/**
 * Qué ES una persona del board de Personas (18420688238), y si sirve para esta operación.
 *
 * En el sistema no hay un tablero de clientes y otro de proveedores: hay UN tablero de personas, y
 * lo único que las distingue es la etiqueta de "✋Categoria" (dropdown_mm54e5ag). Esa columna es
 * MULTI-VALOR, así que una misma persona puede ser "Clientes, Proveedores" a la vez y operar por
 * los dos lados del mostrador.
 *
 * Las reglas viven acá —puras, sin React ni servicios— y se aplican DOS veces, a propósito:
 *
 *   · en la CONSULTA, como regla de `items_page`, para que la búsqueda no traiga a quien no sirve;
 *   · al SELECCIONAR, con estas funciones, porque un rechazo tiene que poder explicarse en pantalla
 *     y porque una regla de negocio que sólo vive en un string de GraphQL se pierde de vista.
 */
import type { Persona } from '@/types'

/** La etiqueta de "✋Categoria" que habilita comprarle a alguien. */
export const CATEGORIA_PROVEEDOR = 'Proveedores'

/** Cómo se nombra al proveedor en pantalla. Escrito una vez, para que no lo invente cada aviso. */
export const ROTULO = { singular: 'proveedor', plural: 'proveedores', titulo: 'Proveedor' } as const

/**
 * La persona tiene esa categoría. Se compara sin distinguir mayúsculas ni espacios: las etiquetas
 * del tablero se escriben a mano y un espacio de más no debería cambiar el veredicto.
 */
export const tieneCategoria = (
  persona: Pick<Persona, 'categorias'> | null | undefined,
  categoria: string,
): boolean =>
  (persona?.categorias ?? []).some((c) => c.trim().toLowerCase() === categoria.trim().toLowerCase())

/**
 * La persona sirve como proveedor.
 *
 * Tener las DOS categorías alcanza: lo que habilita es tener la etiqueta, no tenerla en exclusiva.
 * A alguien que es "Clientes, Proveedores" se le puede vender Y comprar, porque el tablero afirma
 * las dos cosas. Lo que se rechaza es a quien no la tiene.
 *
 * Sin categoría cargada NO se asume nada: una persona sin clasificar no es un proveedor, y dejarla
 * pasar por omisión sería exactamente lo que esta regla existe para evitar.
 */
export const esProveedor = (persona: Pick<Persona, 'categorias'> | null | undefined): boolean =>
  tieneCategoria(persona, CATEGORIA_PROVEEDOR)
