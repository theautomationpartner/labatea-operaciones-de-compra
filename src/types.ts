/** Tipos del dominio de compras. La mercadería ENTRA y el dinero SALE. */

/**
 * Las operaciones que ofrece el selector superior. Por ahora tres; el orden en que se muestran
 * vive en `OPERACIONES` (`lib/pasos.ts`).
 */
export type Operacion =
  | 'CREAR ORDEN DE COMPRA'
  | 'CARGAR COMPROBANTE DE COMPRA'
  | 'CARGAR REMITO'
  | 'CONSULTAR ÓRDENES DE COMPRA'
  | 'ACTUALIZAR PRECIOS'

/**
 * Cada pantalla del flujo. `inicio` es el paso 0: elegir operación y comprador.
 *
 * Las tres etapas de la ORDEN DE COMPRA son `proveedor` → `productos` → `emision`. CARGAR
 * COMPROBANTE DE COMPRA arranca por la MISMA elección de proveedor y sigue en `comprobante` (los
 * datos iniciales). CARGAR REMITO todavía no tiene recorrido propio y comparte el de la orden.
 * CONSULTAR ÓRDENES DE COMPRA y ACTUALIZAR PRECIOS son pantallas únicas, sin stepper: `consultar`
 * y `precios`.
 */
export type Paso =
  | 'inicio'
  | 'proveedor'
  | 'productos'
  | 'emision'
  | 'consultar'
  | 'precios'
  | 'preciosComprobante'
  | 'comprobante'

/**
 * Quien firma la operación de compra: el espejo del "vendedor" de la app de ventas.
 *
 * Sale de los usuarios de la cuenta de Monday. Por defecto queda seleccionado el dueño del token
 * (ver `services/monday/usuarios.ts`), que es quien está operando la app.
 */
export interface Comprador {
  /** ID numérico del usuario de Monday. Se guarda para asignar la compra en las mutaciones. */
  id: string
  ini: string
  name: string
  /** Correo del usuario de Monday. */
  email: string
  color: string
  /** Equipos de Monday del usuario. De acá va a salir el rol cuando se sume el RBAC. */
  equiposIds: string[]
  /** Admin de la CUENTA de Monday (`is_admin`). */
  esAdminDeCuenta: boolean
}

/** Usuario logueado en Monday: define el comprador por defecto. */
export interface UsuarioActual {
  /** ID numérico del usuario de Monday (query `me`). */
  id: string
  name: string
  /** Admin de la CUENTA de Monday (`is_admin`). */
  isAdmin: boolean
  /** IDs de los equipos de Monday a los que pertenece. Por ID y no por nombre: un equipo se
      renombra en dos clics y el ID no cambia nunca. */
  equiposIds: string[]
}

/* ===== Personas (board 18420688238) ===== */

export type SituacionPersona = 'Liberado con crédito' | 'Liberado sin crédito' | 'Bloqueado'
export type ActividadPersona = 'Activo' | 'Inactivo'
/** Etiquetas de "✋️Cond Pago Habilitadas". Ninguna restringe la orden: deciden si rige el crédito. */
export type CondicionPago =
  | 'CONTADO'
  | 'CUENTA CORRIENTE'
  | 'PROVEED 45 DIAS'
  | 'PROVEED 90 DIAS'

/**
 * Una persona del board de Personas. En el sistema NO hay un tablero de proveedores: cliente y
 * proveedor son la misma clase de ítem y los distingue su "✋Categoria" (ver `lib/personas`).
 * Por eso el modelo es el mismo que el de la app de ventas y cobros, campo por campo.
 */
export interface Persona {
  /** ID del ítem en Monday. Es el que se compara contra el proveedor del producto. */
  id: string
  /** El código del sistema, que es el que ve el usuario. */
  codigo: string
  name: string
  cuit: string
  /** Etiquetas de "✋Categoria". De acá sale si la persona sirve como proveedor. */
  categorias: string[]
  ptype: string
  status: string
  /** "✋Lista de Precio": no rige la compra, pero la ficha la muestra igual que en las otras apps. */
  list: string | null
  ret: string
  agenteRetencion: boolean
  condicionPago: CondicionPago | null
  limit: number
  /**
   * "✋️OC 100% Recibida en:": días en que debería recibirse toda la mercadería de una orden.
   * `null` = el proveedor no lo tiene cargado.
   */
  diasRecepcion: number | null
  /** Deuda de la cuenta corriente: total facturado − total pagado. */
  saldoCtaCte: number
  lineaUtilizada: number
  remitosPendFacturar: number
  disponible: number
  addr: string
  activity: ActividadPersona
  situation: SituacionPersona
}

/** El proveedor de la operación: una persona más el dato con el que la etapa 1 decide si opera. */
export interface Proveedor extends Persona {
  /** Tiene su "💵Cta Cte" conectada. Sin ella no hay cuenta contra la cual comprar. */
  tieneCtaCte: boolean
  /**
   * ID del ítem de su cuenta corriente. Es la ÚNICA relación que el tablero de órdenes ofrece
   * hacia la persona, así que es por ahí que la orden queda atada al proveedor (ver
   * `services/monday/ordenCompra`). `null` cuando no tiene cuenta conectada.
   */
  ctaCteId: string | null
}

/** Los dos saldos del ítem de cuenta corriente. Llegan en su propia consulta, después de la ficha. */
export interface SaldosPersona {
  pendienteDeCancelar: number
  anticipos: number
}

/* ===== Maestro de Productos (board 18421035535) ===== */

/** Criterios de taxonomía del Maestro por los que se puede filtrar la búsqueda. */
export type CampoFiltro = 'Rubro' | 'Subrubro' | 'Categoría'

export interface Filtro {
  campo: CampoFiltro
  valor: string
}

/**
 * Un producto del Maestro, visto desde COMPRAS.
 *
 * La diferencia con el modelo de ventas está en el precio: acá no hay listas L1..L8 —los
 * proveedores no tienen lista asignada—, sino un único "🤖Costo de Reposicion"
 * (`formula_mm54wx0w`), que es lo que cuesta UN ENVASE de compra, no una unidad suelta.
 */
export interface Producto {
  /** ID del ítem en el Maestro. Es el que se conecta en el subelemento de la orden. */
  id: string
  codigo: string
  nombre: string
  /**
   * "🤖Costo de Reposicion": el precio de UN envase de compra, o sea de `cantXUnidad` unidades.
   * NO es el precio unitario; ése se deriva (ver `lib/compras`).
   */
  costoReposicion: number
  /** "✋️Costo x Unid": el precio de lista del proveedor, ANTES de descuentos y bonificación. */
  precioUnitario: number
  /** "✋️Descuento 1..4" en %, sólo los cargados (distintos de cero), en orden. */
  descuentos: number[]
  /** "✋️Bonif En Mercaderia" en %. 0 = sin bonificación. */
  bonifMercaderia: number
  /** "✋IVA" en % (21, 10,5…). `null` si el producto no lo tiene cargado. */
  iva: number | null
  /** "✋Tipo Envase Compra": en qué se compra el producto (Kilos, Paquete, Frasco…). */
  unidadCompra: string
  /**
   * "✋Cant x Envase": cuántas unidades trae cada envase de compra. Es el ESCALÓN de la cantidad:
   * al producto sólo se le puede sumar o restar de a esta cantidad. Sin el dato cargado vale 1.
   */
  cantXUnidad: number
  /**
   * La "Cant x Envase" del Maestro, cuando un administrador la ALTERÓ para esta orden. Sólo existe
   * en ese caso: `cantXUnidad` lleva el valor de la orden y éste el original, para mostrarlo.
   */
  cantXUnidadMaestro?: number
  /**
   * "🤖Proveedor" (board_relation_mm7wfzw8): a quiénes se les puede comprar. Un producto puede
   * estar asociado a VARIOS proveedores; es la regla que restringe el catálogo de la orden.
   */
  provIds: string[]
  /** El primero de `provIds`, el que se muestra. `null` sin proveedor asociado. */
  provId: string | null
  provNombre: string
  provCod: string
  tipo: string
  /** "✋Tipo de Venta" = CO. Es informativo: no bloquea nada, sólo se etiqueta. */
  consignado: boolean
  /** "✋Estado" = Activo. Un producto inactivo NO se puede pedir en una orden de compra. */
  activo: boolean
  rubro: string
  subrubro: string
  categoria: string
  /** "✋Unidad de Venta": la U.M. del producto. */
  um: string
  /* Las cantidades de stock son del ítem conectado en "🧮Stock y Movimientos"
     (board_relation_mm57jgks). El Maestro no las tiene. Sin ítem conectado quedan en 0. */
  ingresos: number
  egresos: number
  pendEntregaVta: number
  pendRecepcionCompra: number
  fisico: number
  comercial: number
  disponible: number
  /** El ítem de stock, para afectarlo cuando la compra se reciba. */
  stockId?: string
}

/** Una línea de la orden de compra: el producto y cuántas unidades se le piden al proveedor. */
export interface LineaCompra {
  /** Id local de la línea (no viaja a Monday). */
  id: string
  producto: Producto
  /** Unidades. Siempre múltiplo de `producto.cantXUnidad`. */
  cantidad: number
}

/* ===== Emisión y envío (etapa 3) ===== */

/**
 * Un contacto del proveedor (board "Contactos", 18420688239). Llega por la columna conectada
 * `account_contact` de la persona: son los mismos contactos que usan las otras apps.
 */
export interface Contacto {
  /** Código del board ("CONTACT-009"): es el que se muestra. */
  id: string
  /** ID del ítem en Monday: el que se linkea al despachar el documento. */
  itemId?: string
  name: string
  phone: string
  email: string
  ini: string
  color: string
  /** "ACEPTA ORDEN DE COMPRA" / "NO ACEPTA ...", derivado de su "✋Para Enviar". */
  status: string
  /** Su "✋Para Enviar" incluye este documento: arranca preseleccionado. */
  ok: boolean
  /** Todas las etiquetas de su "✋Para Enviar", tal como están en Monday. */
  paraEnviar: string[]
}

export type MedioEnvio = 'Email' | 'WhatsApp' | 'Ambos'

export type LogTipo = 'ok' | 'err' | 'info'

/** Un aviso del envío, que se muestra al lado del botón. */
export interface LogEntry {
  id: string
  tipo: LogTipo
  titulo: string
  detalle: string
}

/* ===== Comprobante de compra (CARGAR COMPROBANTE DE COMPRA) ===== */

/** Qué comprobante del proveedor se carga. Es obligatorio elegirlo antes de soltar el archivo. */
export type TipoComprobante = 'Factura A' | 'Factura C' | 'Nota de Crédito A' | 'Nota de Débito'

/**
 * Los datos del comprobante que se completan solos al cargar el archivo. Todos van como texto, tal
 * como se leen del documento: el formato (fechas, importes) se resuelve cuando se definan la lectura
 * y el registro en Monday.
 */
export interface DatosComprobante {
  nroComprobante: string
  fechaEmision: string
  fechaVencimiento: string
  importeNeto: string
  iva: string
  percIibb: string
  percIg: string
  total: string
  condicionPago: string
  razonSocialEmisor: string
  idFiscalEmisor: string
  cae: string
  fechaVencCae: string
}

/** Lo cargado en la etapa de datos iniciales. Vive en el estado global: sobrevive al stepper. */
export interface BorradorComprobante {
  tipo: TipoComprobante | null
  archivo: File | null
  datos: DatosComprobante
}
