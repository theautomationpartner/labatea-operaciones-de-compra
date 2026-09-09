/**
 * Validaciones del envío del documento. Son las MISMAS de la app de ventas, palabra por palabra:
 * el usuario que opera las dos apps se topa con los mismos frenos y los mismos textos.
 */
import type { MedioEnvio } from '@/types'

/** Qué dato le falta al contacto para el medio elegido. */
export function faltaParaMedio(
  contacto: { phone: string; email: string },
  medio: MedioEnvio,
): { telefono: boolean; email: boolean } {
  return {
    telefono: (medio === 'WhatsApp' || medio === 'Ambos') && !contacto.phone.trim(),
    email: (medio === 'Email' || medio === 'Ambos') && !contacto.email.trim(),
  }
}

/**
 * El contacto NO tiene por dónde recibir el documento con el medio elegido.
 *
 * Con "Ambos" alcanza con UNO de los dos datos: se envía por el canal que tenga y se omite el
 * otro. Tratarlo como incompleto por faltarle cualquiera de los dos marcaría como problemáticos a
 * contactos perfectamente alcanzables.
 */
export function sinViaDeEnvio(
  contacto: { phone: string; email: string },
  medio: MedioEnvio,
): boolean {
  const falta = faltaParaMedio(contacto, medio)
  return medio === 'Ambos' ? falta.telefono && falta.email : falta.telefono || falta.email
}

/** Los contactos elegidos que no pueden recibir el documento. Con "Ambos" nunca frena. */
export function contactosSinVia<T extends { phone: string; email: string }>(
  contactos: readonly T[],
  medio: MedioEnvio,
): T[] {
  if (medio === 'Ambos') return []
  return contactos.filter((c) => sinViaDeEnvio(c, medio))
}

/** Cómo se nombra en el mensaje el dato que cada medio necesita. */
const DATO_DEL_MEDIO: Record<Exclude<MedioEnvio, 'Ambos'>, string> = {
  Email: 'una dirección de email cargada',
  WhatsApp: 'un número de teléfono cargado',
}

/**
 * Por qué ese contacto no puede recibir el documento. Nombra las TRES cosas que hacen falta para
 * entenderlo sin ir a buscar nada: el medio elegido, el contacto, y qué le falta.
 */
export const msgContactoSinVia = (nombre: string, medio: MedioEnvio): string =>
  medio === 'Ambos'
    ? ''
    : `Seleccionó ${medio.toLowerCase()} como medio de envío, pero el contacto ${nombre} NO tiene ${DATO_DEL_MEDIO[medio]}.`
