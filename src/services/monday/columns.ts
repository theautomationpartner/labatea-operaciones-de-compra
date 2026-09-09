/**
 * IDs de tableros y columnas de Monday (cuenta de La Batea). Son los MISMOS que usan las apps de
 * "Operaciones de venta" y "Registrar cobros y recibos": los tableros son compartidos, así que un
 * id acá tiene que coincidir con el de allá.
 *
 * Todo lo que la app lee o escribe pasa por este archivo; ningún id se escribe suelto en un
 * servicio. Los ids se verificaron uno por uno contra los tableros reales.
 */

export const BOARDS = {
  /** "Personas": clientes Y proveedores, con su Cta Cte conectada. Los distingue "✋Categoria". */
  personas: 18420688238,
  /** Cuenta corriente: un ítem por persona. De ahí salen los dos saldos que muestra la ficha. */
  ctaCte: 18421858736,
  /** "Contactos": los contactos de cada persona. De acá salen los destinatarios del envío. */
  contactos: 18420688239,
  /** "📦Maestro de Productos". */
  productos: 18421035535,
  /** "🧮Stock y Movimientos": el ítem de stock que cuelga de cada producto. */
  stock: 18421752251,
  /** "🛒 Orden Compra": la cabecera de la orden. Es el único tablero en el que esta app escribe. */
  ordenCompra: 18425512714,
  /** Subelementos de la orden: una línea por producto pedido. */
  ordenCompraSub: 18425513538,
} as const

/**
 * Índice de "Activo" en "✋️Estado de Persona" (color_mm588vd6). Se compara contra ESTE índice, no
 * contra el texto: una persona sólo es operable si está explícitamente activa, así una etiqueta
 * nueva del board ("Suspendido", "Dado de baja") no entra como activa sin que nadie lo decida.
 */
export const PERSONA_ACTIVA_INDEX = 1

/**
 * Índice de "Proveedores" en "✋Categoria" (dropdown_mm54e5ag), que es multi-valor. Es lo único que
 * distingue a un proveedor de un cliente en el board de Personas.
 *
 * Leído del tablero: {"1":"Clientes","2":"Proveedores","3":"Transporte","6":"Comisionistas",
 * "8":"Terceros","9":"Vendedores"}. Va por ÍNDICE y no por texto: aguanta que lo renombren.
 */
export const CATEGORIA_PROVEEDOR_INDEX = 2

export const SITUACION_PERSONA_INDEX = {
  liberadoConCredito: 0,
  liberadoSinCredito: 1,
  bloqueado: 2,
} as const

export const COL = {
  /* Board de Personas. Las MISMAS columnas valen para clientes y proveedores. */
  persona: {
    categoria: 'dropdown_mm54e5ag', // multi-valor: "Clientes, Proveedores"
    codigo: 'text_mm542r9d',
    cuit: 'text_mm54btnd',
    dirFiscal: 'location_mm54jt1g',
    tipoPersona: 'color_mm54k8hr',
    condFiscal: 'color_mm54yakw',
    listaPrecio: 'dropdown_mm582vqy',
    agenteRet: 'dropdown_mm54fnwn',
    situacion: 'color_mm58nd7b',
    estado: 'color_mm588vd6',
    condPago: 'dropdown_mm54yq06',
    limite: 'numeric_mm57tw48',
    /** "💵Cta Cte": la cuenta corriente conectada. Sin ítem vinculado no hay cuenta. */
    ctaCte: 'board_relation_mm5ep5qd',
    /** "Contactos" (account_contact): los contactos de la persona. De acá sale a quién enviarle. */
    contactos: 'account_contact',
  },
  ctaCte: {
    /** "🤖Total Ventas": todo lo facturado a la cuenta. */
    totalVentas: 'lookup_mm5g2exg',
    /** "🤖Total Cobros": todo lo cobrado. Vacío = 0. */
    totalCobros: 'lookup_mm5gx0d5',
    /** "🤖Remito Pends de Facturar": entregado y todavía sin facturar. */
    remitosPendFacturar: 'numeric_mm5f2npa',
    /** "🤖Limite de credito": el límite de la persona, espejado en su cuenta. */
    limite: 'lookup_mm585jgv',
    /** Relación a la persona. Es por donde se busca SU cuenta corriente. */
    persona: 'board_relation_mm58dyn',
    /** "Fact Vent pend de Aplciar": el total que todavía se debe. Ya calculado por el tablero. */
    ventasPendCancelar: 'numeric_mm677127',
    /** "Anticipo pend de Aplicar": el saldo a favor sin usar. */
    anticiposPendAplicar: 'numeric_mm67j0rv',
  },
  /* Board "Contactos" (18420688239): a quién se le manda el documento. */
  contacto: {
    /** "🤖ID Contacto": el código que se muestra (CONTACT-009). */
    codigo: 'pulse_id_mm572ncq',
    /** El nombre se arma con estas dos columnas, no con el `name` del ítem. */
    nombre: 'text_mm5848zg',
    apellido: 'text_mm58q0bx',
    email: 'contact_email',
    /** La columna se llama "Whatsapp" en el board: es el teléfono del contacto. */
    telefono: 'contact_phone',
    /**
     * "✋Para Enviar" (dropdown multi-valor): qué documentos acepta recibir. Es lo que decide si
     * el contacto arranca preseleccionado en la etapa de envío.
     */
    paraEnviar: 'dropdown_mm57p8ja',
  },
  /* "📦Maestro de Productos" (18421035535). Verificado contra el tablero. */
  producto: {
    /** "✋Codigo Prod": el código que ve el usuario. Es por el que se busca directo. */
    codigo: 'text_mm5ghnv7',
    rubro: 'dropdown_mm509v8g',
    subrubro: 'dropdown_mm51jz35',
    categoria: 'dropdown_mm50pcb8',
    /** "✋Unidad de Venta": la U.M. del producto. */
    unidadMedida: 'dropdown_mm4vhc0h',
    tipoMercaderia: 'color_mm48hm74',
    /**
     * "🤖Proveedor" (→ Personas 18420688238). Es la columna que hace cumplir la regla de la orden:
     * sólo se pueden comprar productos de ESTE proveedor.
     */
    proveedor: 'board_relation_mm4812az',
    /** "🤖Código Sistema Prov": espeja el código del proveedor conectado. */
    proveedorCodigo: 'lookup_mm5fh97p',
    /**
     * "🤖Costo de Reposicion" (fórmula): el PRECIO DE COMPRA. Reemplaza a las listas L1..L8 de la
     * app de ventas —un proveedor no tiene lista asignada—, y expresa lo que cuesta UN ENVASE de
     * compra (`cantXEnvase` unidades), no una unidad suelta.
     */
    costoReposicion: 'formula_mm54wx0w',
    /** "✋Tipo Envase Compra" (dropdown): en qué se compra. La UI lo rotula "Unidad de Compra". */
    tipoEnvaseCompra: 'dropdown_mm5f1ac2',
    /** "✋Cant x Envase" (numbers): unidades por envase. La UI lo rotula "Cant x Unidad". */
    cantXEnvase: 'numeric_mm502fat',
    /** "🧮Stock y Movimientos": el ítem de stock del producto (board 18421752251). */
    stock: 'board_relation_mm57jgks',
  },
  /* Ítem de "🧮Stock y Movimientos" (18421752251). */
  stockItem: {
    /** "🤖Ingreso Total" (mirror de los subelementos de movimiento). */
    ingresos: 'lookup_mm578v5m',
    /** "🤖Egreso Total": el espejo gemelo. Se guarda en POSITIVO y se RESTA. */
    egresos: 'lookup_mm57sf80',
    /** "🤖Pend de Entrega Vta": saldo pendiente de entregar por ventas. */
    pendEntregaVta: 'numeric_mm5nscx',
    /** "🤖Pend de Recibir Compra": lo que va a entrar por compras; suma al disponible. */
    pendRecepcionCompra: 'numeric_mm57p2wq',
    /** "🤖Stock Fisico": ingresos − egresos registrados. */
    fisico: 'formula_mm57f9pn',
    /** "🤖Stock Comercial": el físico menos lo pendiente de entregar por ventas. */
    comercial: 'formula_mm57sk64',
    /** "🤖Stock Disponible": el comercial más lo pendiente de recibir por compras. */
    disponible: 'formula_mm5nntd2',
  },
  /* "🛒 Orden Compra" (18425512714): la cabecera. ETAPA 3, todavía sin implementar. */
  ordenCompra: {
    /** "🤖Proveedor" (→ Personas 18420688238): a quién se le compra. */
    proveedor: 'board_relation_mm71hn3y',
    /** "🤖Comprador" (people): quién firma la orden. */
    comprador: 'multiple_person_mm71n2et',
    /** "🤖 Fecha de Emision" (date, ISO YYYY-MM-DD). */
    fechaEmision: 'date_mm719jdh',
    /** "🤖TOTAL $" (numbers): el importe de la orden. */
    total: 'numeric_mm71rzdw',
    /** "🤖 Total Envases" (numbers): cuántos envases se le piden al proveedor. */
    totalEnvases: 'numeric_mm711ygw',
    /** "🤖Total Unidades" (numbers): a cuántas unidades equivalen esos envases. */
    totalUnidades: 'numeric_mm71w51w',
    /** "🤖Contactos" (→ Contactos 18420688239): los destinatarios del envío. */
    contactos: 'board_relation_mm71ny58',
    /** "🤖Medio de Envio" (dropdown): ver `MEDIO_ENVIO_IDS`. */
    medioEnvio: 'dropdown_mm71c6pm',
    /** "🤖 Estado de Emision PDF": Enviar / Emitiendo / Emitida / Error de Emision. */
    estadoEmision: 'color_mm5z7nhz',
    /** "🤖Estado de Envío PDF": Enviar / Enviando / Enviado / Error de Envio. */
    estadoEnvio: 'color_mm5zfts1',
    /** "🤖 Orden de Compra PDF" (file): el documento que genera el tablero al emitir. */
    pdf: 'file_mm5zgtkw',
    /** "🤖ID Compra": el identificador que ve el usuario. */
    idCompra: 'pulse_id_mm5zskj8',
    /* "🤖Cta Cte Proveedores" (lookup_mm719ar1) NO figura acá a propósito: es una MIRROR de la
       cuenta corriente del proveedor conectado, así que se completa sola en cuanto se escribe
       `proveedor`. Escribirla sería imposible —las mirror son de sólo lectura— y listarla acá
       invitaría a intentarlo. */
  },
  /* Subelementos de la orden (18425513538): una línea por producto pedido. */
  ordenCompraSub: {
    /** "📦Maestro de Productos" (→ 18421035535): qué producto se pide. */
    producto: 'board_relation_mm5zvnmq',
    /** "🤖Cant de Envases" (numbers): cuántos envases cerrados se piden. */
    cantEnvases: 'numeric_mm5zj9dt',
    /** "🤖Cant  Total Pedida" (numbers): las unidades que salen de esos envases. */
    cantTotal: 'numeric_mm71cfb3',
    /** "🤖Precio de Costo" (numbers): el costo de reposición, que es por ENVASE. */
    precio: 'numeric_mm5zbksv',
    /** "🤖Total" (numbers): cant de envases × precio de costo. */
    total: 'numeric_mm5zswve',
    /* "🤖 Unidad de Compra" (lookup_mm71avws) y "🤖 Cant x Envase" (lookup_mm71ykz0) tampoco
       figuran: son MIRRORS del Maestro que se completan solas al conectar el producto. */
  },
} as const

/**
 * Ids de las etiquetas de "🤖Medio de Envio" (dropdown_mm71c6pm), leídos del tablero:
 * [{"id":1,"name":"Whatsapp"},{"id":2,"name":"Email"}].
 *
 * Van por ID y no por texto —igual que el resto de la app— y "Ambos" no es una etiqueta del
 * tablero sino las DOS a la vez, que es lo que una columna multi-valor sabe representar.
 */
export const MEDIO_ENVIO_IDS: Record<'Email' | 'WhatsApp' | 'Ambos', number[]> = {
  WhatsApp: [1],
  Email: [2],
  Ambos: [1, 2],
}
