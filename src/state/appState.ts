import { cantPorEnvase } from '@/lib/compras'
import { pasosKeysDe } from '@/lib/pasos'
import type {
  Comprador,
  Contacto,
  Filtro,
  LineaCompra,
  MedioEnvio,
  LogEntry,
  Operacion,
  Paso,
  Producto,
  Proveedor,
  UsuarioActual,
} from '@/types'

export interface AppState {
  /** Pantalla en curso. Arranca en el paso 0 (elegir operación y comprador). */
  paso: Paso
  /** Índice MÁS AVANZADO del stepper alcanzado: hasta ahí se puede volver a saltar. */
  pasoMaxIdx: number
  operacion: Operacion | null
  /** Quien firma la compra. Por defecto, el usuario dueño del token de Monday. */
  comprador: Comprador | null
  compradores: Comprador[]
  /** `true` mientras se traen los usuarios de Monday: el selector muestra "Cargando…". */
  compradoresCargando: boolean
  /** El usuario que abrió la app (query `me`). Define el comprador por defecto. */
  usuarioActual: UsuarioActual | null

  /* ===== ETAPA 1 · proveedor ===== */
  /** A quién se le compra. Es lo que restringe el catálogo de la etapa 2. */
  proveedor: Proveedor | null

  /* ===== ETAPA 2 · productos ===== */
  /** Las líneas de la orden. Todas son del mismo proveedor, por construcción. */
  lineas: LineaCompra[]
  /** Filtros de taxonomía aplicados al buscador del catálogo. */
  filtros: Filtro[]

  /* ===== ETAPA 3 · emisión y envío ===== */
  /** ID del ítem de la orden en Monday. Nace al emitir; `null` mientras no se creó. */
  ordenCompraId: string | null
  /** La orden ya se emitió en el tablero. Bandera GLOBAL: sobrevive a navegar con el stepper. */
  documentoEmitido: boolean
  /** El documento ya se envió a los contactos. Misma persistencia que la de emisión. */
  documentoEnviado: boolean
  /** Contactos del proveedor elegidos como destinatarios. */
  contactos: Contacto[]
  medioEnvio: MedioEnvio
  /** Avisos de lo último que pasó en el envío. `null` = no hay nada que informar. */
  log: LogEntry[] | null

  /**
   * Qué se estaba intentando hacer cuando la API de Monday falló. Es lo ÚNICO que dispara la
   * ventana global de error (`ModalErrorMonday`); `null` = no hay error en pantalla.
   */
  errorMonday: string | null
}

export const initialState: AppState = {
  paso: 'inicio',
  pasoMaxIdx: 0,
  operacion: null,
  comprador: null,
  compradores: [],
  compradoresCargando: true,
  usuarioActual: null,
  proveedor: null,
  lineas: [],
  filtros: [],
  ordenCompraId: null,
  documentoEmitido: false,
  documentoEnviado: false,
  contactos: [],
  medioEnvio: 'Email',
  log: null,
  errorMonday: null,
}

export type Action =
  | { type: 'goto'; paso: Paso }
  | { type: 'setOperacion'; operacion: Operacion }
  /** Cambio de operación con datos ya cargados: descarta la transacción y arranca de cero. */
  | { type: 'cambiarOperacion'; operacion: Operacion }
  | { type: 'setComprador'; comprador: Comprador }
  | { type: 'setCompradores'; compradores: Comprador[] }
  | { type: 'setUsuarioActual'; usuario: UsuarioActual | null }
  | { type: 'setProveedor'; proveedor: Proveedor }
  | { type: 'addLinea'; producto: Producto; cantidad: number }
  | { type: 'setCantidadLinea'; id: string; cantidad: number }
  | { type: 'removeLinea'; id: string }
  | { type: 'addFiltro'; filtro: Filtro }
  | { type: 'removeFiltro'; filtro: Filtro }
  | { type: 'setOrdenCompraId'; value: string }
  | { type: 'setDocumentoEmitido'; value: boolean }
  | { type: 'setDocumentoEnviado'; value: boolean }
  | { type: 'setContactos'; contactos: Contacto[] }
  | { type: 'addContacto'; contacto: Contacto }
  | { type: 'removeContacto'; id: string }
  | { type: 'setMedioEnvio'; value: MedioEnvio }
  | { type: 'setLog'; entries: LogEntry[] | null }
  | { type: 'reset' }
  | { type: 'errorMonday'; accion: string }
  | { type: 'limpiarErrorMonday' }

/**
 * El comprador por defecto es el usuario que abrió la app: el dueño del token de Monday.
 *
 * Se busca por ID —no por nombre— porque el ID es lo que la API devuelve en `me` y lo que después
 * viaja en las mutaciones. Si ese usuario no está en la lista, no se preselecciona nada: es
 * preferible un selector vacío antes que firmar la compra a nombre de otro.
 */
const compradorPorDefecto = (
  compradores: Comprador[],
  usuario: UsuarioActual | null,
): Comprador | null => (usuario ? compradores.find((c) => c.id === usuario.id) ?? null : null)

/** Id local de la línea. No viaja a Monday: sólo distingue filas en la tabla. */
let proximaLinea = 0
const nuevoIdLinea = (): string => `l${++proximaLinea}`

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'goto': {
      /* Al ir a un paso se recuerda el índice MÁS AVANZADO alcanzado: volver atrás no lo baja, así
         el stepper deja volver a saltar hacia adelante a las etapas ya completadas. */
      const idx = pasosKeysDe(state.operacion).indexOf(action.paso)
      const pasoMaxIdx = idx >= 0 ? Math.max(state.pasoMaxIdx, idx) : state.pasoMaxIdx
      return { ...state, paso: action.paso, pasoMaxIdx }
    }

    case 'setOperacion':
      if (state.operacion === action.operacion) return state
      // Nueva operación: se reinicia el progreso navegable del stepper.
      return { ...state, operacion: action.operacion, pasoMaxIdx: 0 }

    /* Deep reset al cambiar de operación con datos ya cargados: se descarta TODO lo de la
       transacción (proveedor, líneas, filtros). Sólo se conservan el comprador y la sesión de
       Monday, que no dependen de la operación y se leen una sola vez al arrancar. */
    case 'cambiarOperacion':
      return {
        ...initialState,
        comprador: state.comprador,
        compradores: state.compradores,
        compradoresCargando: state.compradoresCargando,
        usuarioActual: state.usuarioActual,
        operacion: action.operacion,
        paso: 'proveedor',
      }

    case 'setComprador':
      return { ...state, comprador: action.comprador }

    /* Llegaron los usuarios de Monday: se guardan y el selector deja de estar "Cargando…". Si
       todavía no hay comprador elegido, se preselecciona el que coincide con el usuario logueado. */
    case 'setCompradores':
      return {
        ...state,
        compradores: action.compradores,
        compradoresCargando: false,
        comprador: state.comprador ?? compradorPorDefecto(action.compradores, state.usuarioActual),
      }

    /* Llegó la sesión de Monday. Las dos consultas corren en paralelo y no hay orden garantizado,
       así que la preselección se intenta desde los DOS lados: gane la que gane, el comprador por
       defecto queda puesto una sola vez (el `??` no pisa una elección ya hecha por el usuario). */
    case 'setUsuarioActual':
      return {
        ...state,
        usuarioActual: action.usuario,
        comprador: state.comprador ?? compradorPorDefecto(state.compradores, action.usuario),
      }

    /**
     * Cambiar de proveedor VACÍA la orden.
     *
     * No es una precaución: es la restricción del negocio aplicada al estado. Una orden es de un
     * solo proveedor, así que las líneas cargadas para el anterior no pueden sobrevivir al cambio
     * —quedarían mezclando mercadería de dos—. Los filtros también se limpian: son la taxonomía
     * de un catálogo que acaba de cambiar entero.
     *
     * Volver a elegir al MISMO proveedor no borra nada: no hubo cambio de catálogo, y perder el
     * trabajo cargado por confirmar dos veces al mismo sería un castigo sin motivo.
     */
    case 'setProveedor':
      if (state.proveedor?.id === action.proveedor.id) {
        return { ...state, proveedor: action.proveedor }
      }
      return { ...state, proveedor: action.proveedor, lineas: [], filtros: [] }

    /**
     * Alta de una línea. Un producto que ya está cargado NO se duplica: se le suman las unidades a
     * la línea que ya existe. Dos renglones del mismo producto en una orden de compra son un error
     * de carga, y el proveedor recibiría dos pedidos por lo mismo.
     */
    case 'addLinea': {
      const existente = state.lineas.find((l) => l.producto.id === action.producto.id)
      if (existente) {
        return {
          ...state,
          lineas: state.lineas.map((l) =>
            l.id === existente.id ? { ...l, cantidad: l.cantidad + action.cantidad } : l,
          ),
        }
      }
      return {
        ...state,
        lineas: [
          ...state.lineas,
          { id: nuevoIdLinea(), producto: action.producto, cantidad: action.cantidad },
        ],
      }
    }

    /* Una línea YA CARGADA nunca baja del primer envase: una línea en cero no es una línea, es
       quitarla, y para eso está el tacho de la tabla. Es el único piso distinto del de la tarjeta
       de carga, que sí arranca en cero porque ahí todavía no hay nada pedido. */
    case 'setCantidadLinea':
      return {
        ...state,
        lineas: state.lineas.map((l) =>
          l.id === action.id
            ? { ...l, cantidad: Math.max(cantPorEnvase(l.producto), action.cantidad) }
            : l,
        ),
      }

    case 'removeLinea':
      return { ...state, lineas: state.lineas.filter((l) => l.id !== action.id) }

    /* Un filtro repetido no se agrega dos veces: sería una chip duplicada y una regla redundante. */
    case 'addFiltro':
      if (state.filtros.some((f) => f.campo === action.filtro.campo && f.valor === action.filtro.valor)) {
        return state
      }
      return { ...state, filtros: [...state.filtros, action.filtro] }

    case 'removeFiltro':
      return {
        ...state,
        filtros: state.filtros.filter(
          (f) => !(f.campo === action.filtro.campo && f.valor === action.filtro.valor),
        ),
      }

    case 'setOrdenCompraId':
      return { ...state, ordenCompraId: action.value }

    case 'setDocumentoEmitido':
      return { ...state, documentoEmitido: action.value }

    case 'setDocumentoEnviado':
      return { ...state, documentoEnviado: action.value }

    case 'setContactos':
      return { ...state, contactos: action.contactos }

    /* Un contacto no se agrega dos veces: el picker ya no lo reofrece, pero el estado no depende
       de que la UI se acuerde. */
    case 'addContacto':
      if (state.contactos.some((c) => c.id === action.contacto.id)) return state
      return { ...state, contactos: [...state.contactos, action.contacto] }

    case 'removeContacto':
      return { ...state, contactos: state.contactos.filter((c) => c.id !== action.id) }

    case 'setMedioEnvio':
      return { ...state, medioEnvio: action.value }

    case 'setLog':
      return { ...state, log: action.entries }

    /* Operación terminada: se vuelve a cero. Los usuarios y la sesión NO se vuelven a pedir —se
       leen una sola vez al iniciar la app—, así que se conservan junto con el comprador. */
    case 'reset':
      return {
        ...initialState,
        comprador: state.comprador,
        compradores: state.compradores,
        compradoresCargando: state.compradoresCargando,
        usuarioActual: state.usuarioActual,
      }

    case 'errorMonday':
      return { ...state, errorMonday: action.accion }

    case 'limpiarErrorMonday':
      return { ...state, errorMonday: null }

    default:
      return state
  }
}
