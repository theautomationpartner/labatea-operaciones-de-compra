/**
 * Quién puede hacer las EXCEPCIONES de compras.
 *
 * El negocio las reserva a los equipos "Compras" y "Administradores" de Monday:
 *   · pedir una cantidad que no respeta el envase del producto;
 *   · agregar a la orden un producto que no está asociado al proveedor elegido;
 *   · actualizar los costos del Maestro de Productos.
 *
 * Se decide sobre el USUARIO QUE OPERA la app (el dueño de la sesión), no sobre el comprador
 * elegido en el selector: el comprador es a nombre de quién sale la orden, y cambiarlo no puede ser
 * la forma de conseguir un permiso que no se tiene.
 */
import { CASILLA_ENVIO, EQUIPOS } from '@/services/monday/columns'
import type { Comprador, UsuarioActual } from '@/types'

const EQUIPOS_HABILITADOS: readonly string[] = [EQUIPOS.compras, EQUIPOS.administradores]

/** El usuario pertenece a Compras o a Administradores (o es admin de la cuenta de Monday). */
export const puedeHacerExcepciones = (usuario: UsuarioActual | null): boolean =>
  Boolean(usuario) &&
  (usuario!.isAdmin || usuario!.equiposIds.some((id) => EQUIPOS_HABILITADOS.includes(id)))

/**
 * El usuario es del equipo Administradores (o admin de la cuenta). Es el único que puede alterar la
 * "Cant x Envase" de un producto en la orden: cambia el escalón de la cantidad y los envases que se
 * le piden al proveedor, así que no alcanza con ser de Compras.
 */
export const esAdministrador = (usuario: UsuarioActual | null): boolean =>
  Boolean(usuario) && (usuario!.isAdmin || usuario!.equiposIds.includes(EQUIPOS.administradores))

/** Casilla desde la que sale el correo de la orden firmada por ese comprador. */
export const casillaDeEnvio = (comprador: Comprador | null): string =>
  (comprador && CASILLA_ENVIO.propias[comprador.id]) || CASILLA_ENVIO.logistica
