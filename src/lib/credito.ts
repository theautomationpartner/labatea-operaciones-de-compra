/**
 * Reglas de uso del límite de crédito de la cuenta corriente. Un único lugar decide si el crédito
 * entra en juego, para que la ficha, los totales de la orden y los bloqueos respondan todos al
 * mismo criterio.
 *
 * Son las MISMAS reglas de la app de ventas y de la de cobros, leídas desde el otro lado del
 * mostrador: acá el límite es el que el PROVEEDOR nos tiene asignado a nosotros, y lo que lo
 * consume es lo que le estamos por comprar.
 */
import { money, round2 } from '@/lib/format'
import type { CondicionPago, Persona } from '@/types'

/** Condiciones de pago que operan contra la cuenta corriente (y por lo tanto consumen línea). */
const CONDICIONES_A_CREDITO: readonly CondicionPago[] = [
  'CUENTA CORRIENTE',
  'PROVEED 45 DIAS',
  'PROVEED 90 DIAS',
]

/** La operación se paga después, contra la cuenta corriente. */
export const esACredito = (p: Persona): boolean =>
  !!p.condicionPago && CONDICIONES_A_CREDITO.includes(p.condicionPago)

/** Bloqueado: no puede operar en el sistema, sea cual sea su condición de pago. */
export const personaBloqueada = (p: Persona | null | undefined): boolean =>
  p?.situation === 'Bloqueado'

/**
 * El límite de crédito rige esta operación. Es la pregunta que hacen los cálculos: con `false`
 * no se proyecta uso, no se pinta la barra y no se bloquea nada por crédito.
 */
export const aplicaCredito = (p: Persona | null | undefined): boolean =>
  !!p && !personaBloqueada(p) && esACredito(p) && p.situation === 'Liberado con crédito'

/**
 * Por qué el límite no se va a considerar, para avisarlo en la ficha. `null` cuando sí rige o
 * cuando la persona está bloqueada (eso se avisa aparte, con más peso).
 */
export function motivoCreditoIgnorado(p: Persona): string | null {
  if (personaBloqueada(p) || aplicaCredito(p)) return null
  if (!p.condicionPago) {
    return 'No se considerará el crédito porque el proveedor no tiene asignada una condición de pago en el sistema.'
  }
  if (!esACredito(p)) {
    return 'No se considerará el crédito asignado al proveedor porque su condición de pago es CONTADO.'
  }
  return 'El límite de crédito no será considerado durante la operación porque el proveedor tiene estado "Liberado sin Crédito".'
}

/** Mensaje único de la persona bloqueada: se usa igual en la ficha y en los bloqueos. */
export const MENSAJE_PROVEEDOR_BLOQUEADO =
  'El proveedor se encuentra bloqueado por lo que no es posible utilizarlo en el sistema.'

/**
 * Base de la línea ya consumida: la deuda de la cuenta corriente más los remitos pendientes de
 * facturar. Es lo que ya se descontó del límite antes de esta orden.
 */
export const creditoUsado = (p: Persona): number => round2(p.saldoCtaCte + p.remitosPendFacturar)

/** Crédito que queda tras la orden en curso, nunca por debajo de cero. */
export const creditoDisponibleProyectado = (p: Persona | null, importe: number): number =>
  p ? Math.max(round2(p.disponible - importe), 0) : 0

/**
 * El importe de la orden no entra en la línea disponible.
 *
 * Sólo tiene sentido preguntarlo cuando el límite rige (`aplicaCredito`): al contado no hay línea
 * que consumir y una persona liberada sin crédito opera sin tope.
 */
export function excedeCredito(p: Persona | null | undefined, importe: number): boolean {
  if (!aplicaCredito(p)) return false
  const persona = p as Persona
  return round2(creditoUsado(persona) + importe) > round2(persona.limit)
}

/**
 * Por qué se frena la operación cuando la línea no alcanza, con los números que lo sustentan:
 * cuánto hay tomado, cuánto suma esta orden y sobre cuánto está asignado.
 */
export const mensajeCreditoExcedido = (p: Persona, importe: number): string =>
  `Esta orden de compra por ${money(importe)} deja a ${p.name} con ` +
  `${money(creditoUsado(p) + importe)} tomados de los ${money(p.limit)} asignados a su cuenta ` +
  `corriente. Quitá productos o bajá las cantidades para poder continuar.`
