/**
 * Cálculos derivados que comparten varias vistas: el estado del crédito de la cuenta corriente y
 * lo que la cantidad en curso le hace al stock del producto.
 *
 * Son los MISMOS selectores de la app de ventas, con una diferencia de sentido: acá la mercadería
 * ENTRA, así que el stock se proyecta sumando y no restando (ver `stockConIngreso`).
 */
import { aplicaCredito, creditoDisponibleProyectado, personaBloqueada } from '@/lib/credito'
import { round2 } from '@/lib/format'
import type { Persona, Producto } from '@/types'

/* ===== Crédito ===== */

/** Umbrales del semáforo del crédito, en % de línea utilizada. */
const CREDITO_ALERTA = 70
const CREDITO_CRITICO = 90
/** Umbral con el que el resumen de la operación pinta el donut en rojo. */
const CREDITO_FOOTER_CRITICO = 90

export interface CreditoPersona {
  disponible: number
  usadoPct: number
  disponiblePct: number
  color: string
  clase: 'v-green' | 'v-orange' | 'v-red'
  bloqueado: boolean
}

/** Estado del crédito TAL COMO ESTÁ HOY en el tablero, sin la operación en curso. Lo usa la ficha. */
export function creditoPersona(p: Persona): CreditoPersona {
  const disponible = p.disponible
  const usado = p.limit - disponible
  const usadoPct = p.limit > 0 ? Math.round((usado / p.limit) * 100) : 0
  const disponiblePct = p.limit > 0 ? Math.round((disponible / p.limit) * 100) : 100

  let color = 'var(--green)'
  let clase: CreditoPersona['clase'] = 'v-green'
  if (usadoPct >= CREDITO_CRITICO) {
    color = 'var(--red)'
    clase = 'v-red'
  } else if (usadoPct >= CREDITO_ALERTA) {
    color = 'var(--yellow)'
    clase = 'v-orange'
  }

  return { disponible, usadoPct, disponiblePct, color, clase, bloqueado: personaBloqueada(p) }
}

export interface ImpactoCredito {
  /** Crédito que quedaría si la orden se confirma. */
  disponible: number
  usadoPct: number
  critico: boolean
  /** El límite rige esta operación. Con `false` los tres campos de arriba quedan neutros. */
  aplica: boolean
}

/**
 * Proyecta el crédito sumando el importe de la orden en curso: el disponible del tablero baja y el
 * uso crece a medida que se cargan productos.
 *
 * Si el crédito no rige (contado, o proveedor liberado sin crédito) no se proyecta nada: no hay
 * línea que consumir, así que la operación nunca "usa" ni "excede".
 */
export function impactoCredito(persona: Persona | null, importe: number): ImpactoCredito {
  if (!aplicaCredito(persona)) {
    return { disponible: persona?.disponible ?? 0, usadoPct: 0, critico: false, aplica: false }
  }
  const limite = persona?.limit ?? 0
  const usado = (persona ? persona.limit - persona.disponible : 0) + importe
  const usadoPct = limite > 0 ? Math.min((usado / limite) * 100, 100) : 0
  return {
    disponible: creditoDisponibleProyectado(persona, importe),
    usadoPct,
    critico: usadoPct >= CREDITO_FOOTER_CRITICO,
    aplica: true,
  }
}

/* ===== Stock ===== */

export interface StockProyectado {
  ingresos: number
  fisico: number
  comercial: number
  disponible: number
}

/**
 * Cómo quedaría el stock si la mercadería de esta línea ENTRARA.
 *
 * Se recalculan las cuatro métricas con las MISMAS fórmulas del tablero, en cascada desde los
 * ingresos: así la proyección no puede discrepar de lo que Monday va a calcular después.
 */
export function stockConIngreso(p: Producto, cantidad: number): StockProyectado {
  const ingresos = round2(p.ingresos + cantidad)
  const fisico = round2(ingresos - p.egresos)
  const comercial = round2(fisico - p.pendEntregaVta)
  return { ingresos, fisico, comercial, disponible: round2(comercial + p.pendRecepcionCompra) }
}
