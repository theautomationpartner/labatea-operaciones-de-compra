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
  /** "🚛 ❓ Pend de Recibir Compra": un ítem por producto de la orden que falta recibir. */
  pendRecibirCompra: 18425512704,
  /** Subelementos del pendiente de recepción: un remito por subelemento ("🤖Q RTO"). */
  pendRecibirCompraSub: 18425513687,
  /** "🗒️ ❓ Pend de Recibir Fact.": un ítem por producto de la orden que falta facturar. */
  pendRecibirFact: 18425512694,
  /** "⚙️Configuracion - Sistema": textos y parámetros del sistema que se editan en Monday. */
  configuracion: 18421035530,
  /**
   * "Venta Pend de Liq CYO": lo vendido de mercadería CONSIGNADA que todavía no se le liquidó al
   * proveedor. Un proveedor con pendientes acá no puede actualizar su lista de precios.
   */
  ventaPendLiqCyo: 18421465215,
  /**
   * "Maestro de Productos PARA TESTS": copia del Maestro con las MISMAS columnas (mismos ids). Lo
   * usa ACTUALIZAR PRECIOS en modo TEST, ver `MODO_PRECIOS`.
   */
  productosTest: 18434470069,
  /**
   * "Lista Autorizada - Lista Blanca - Whitelist": el tablero PRIVADO que habilita a cada usuario en
   * las apps. De acá salen los emails de los equipos internos (ver `equipoInterno.ts`).
   */
  listaBlanca: 18427866249,
} as const

/**
 * Modo de la operación ACTUALIZAR PRECIOS. Afecta SÓLO a esa operación: la orden de compra y el
 * resto de la app siguen con el Maestro de producción.
 *
 *   · PRODUCCION: lee y escribe los costos en el "📦Maestro de Productos" (18421035535).
 *   · TEST: lee y escribe los costos en el "Maestro de Productos PARA TESTS" (18434470069), y NO
 *     anota la fecha de última actualización en el proveedor real.
 *
 * Para pasar a producción se cambia acá y en ningún otro lado.
 */
export const MODO_PRECIOS: 'TEST' | 'PRODUCCION' = 'TEST'

/** El tablero de productos con el que trabaja ACTUALIZAR PRECIOS, según `MODO_PRECIOS`. */
export const BOARD_PRODUCTOS_PRECIOS =
  MODO_PRECIOS === 'TEST' ? BOARDS.productosTest : BOARDS.productos

/**
 * Equipos de Monday que habilitan las EXCEPCIONES de compras: cantidades que no respetan el envase,
 * productos de otro proveedor y la actualización de precios. Por ID: un equipo se renombra en dos
 * clics y el ID no cambia nunca.
 */
export const EQUIPOS = {
  compras: '1506058',
  administradores: '1480182',
} as const

/**
 * Casilla desde la que sale el correo de la orden de compra, según quién la firma.
 *
 * La regla que dio el cliente: las órdenes de Mercedes (Mechi) salen desde SU correo; las del
 * resto (Tomás, Juan) desde la casilla de logística. Va por ID de usuario de Monday.
 */
export const CASILLA_ENVIO = {
  /** Mercedes Olazábal: sus órdenes salen desde su propio correo. */
  propias: { '116018271': 'm.olazabal@labatea.biz' } as Record<string, string>,
  /** Todos los demás compradores. */
  logistica: 'logistica@labatea.biz',
} as const

/** Ítems FIJOS de "⚙️Configuracion - Sistema" que lee la app. */
export const CONFIG_ITEM = {
  /** "Leyendas" (Tipo de Config = Leyendas): las leyendas de los documentos. */
  leyendas: '13241774022',
} as const

/** Etiqueta de "✋Tipo de Venta" (color_mm48hm74) que marca a un producto como CONSIGNADO. */
export const TIPO_VENTA_CONSIGNADO = 'CO'

/**
 * Índice de "Activo" en "✋Estado" del Maestro (color_mm50nc9j): {"1":"Activo","2":"Inactivo"}.
 * Sólo un producto explícitamente Activo se puede pedir en una orden de compra. Va por ÍNDICE: una
 * etiqueta nueva ("Discontinuado") no entra como activa sin que nadie lo decida.
 */
export const PRODUCTO_ACTIVO_INDEX = 1

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
    /**
     * "✋️OC 100% Recibida en:" (numbers): los días en que el proveedor debería entregar TODA la
     * mercadería de una orden. Con la fecha de emisión da la "Fecha de Recepción Estimada".
     */
    diasRecepcion: 'numeric_mm7yeax',
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
    /** "✋Estado": Activo / Inactivo. Sólo los activos se piden (ver `PRODUCTO_ACTIVO_INDEX`). */
    estado: 'color_mm50nc9j',
    /** "✋Tipo de Venta": COM / CO. "CO" = consignado (ver `TIPO_VENTA_CONSIGNADO`). */
    tipoMercaderia: 'color_mm48hm74',
    /**
     * "🤖Proveedor" (→ Personas 18420688238), la columna NUEVA que admite VARIOS proveedores por
     * producto. Es la que hace cumplir la regla de la orden: el catálogo que se ofrece es el de los
     * productos asociados a ESTE proveedor.
     *
     * Reemplaza a `board_relation_mm4812az` (un solo proveedor), que quedó con 6 productos
     * conectados de 1285: la carga del cliente se hizo sobre esta columna.
     */
    proveedor: 'board_relation_mm7wfzw8',
    /** "✋Codigo Prod Proveedor": el código del producto EN LA LISTA del proveedor. Cruza el Excel. */
    codigoProveedor: 'text_mm5geh66',
    /**
     * "✋️Costo x Unid": el costo de lista del proveedor. Es el ÚNICO costo que se escribe al
     * actualizar precios: "🤖Costo de Reposicion" es una fórmula que sale de éste, los descuentos,
     * la bonificación y el flete.
     */
    costoUnid: 'numeric_mm51f70h',
    /** "✋Variacion Costo": el % de la última variación del costo. */
    variacionCosto: 'numeric_mm54j7f5',
    /**
     * "✋️Descuento 1..4": descuentos del proveedor sobre el precio, en % (25 = 25%). Se aplican en
     * cascada, igual que en la fórmula de "🤖Costo de Reposicion".
     */
    descuentos: ['numeric_mm51nabp', 'numeric_mm51af5x', 'numeric_mm51abwq', 'numeric_mm511z1v'],
    /** "✋️Bonif En Mercaderia": la bonificación en mercadería, en % (28 = 28%). */
    bonifMercaderia: 'numeric_mm51ea99',
    /** "✋IVA" (numbers, en %): la alícuota del producto (21, 10,5…). */
    iva: 'numeric_mm5gyrnb',
    /** "✋️Flete": importe en $ que se suma al costo final para formar los precios de venta. */
    flete: 'numeric_mm589hex',
    /** "🤖Costo Final" (fórmula): el costo con descuentos y bonificación. Base de las listas. */
    costoFinal: 'formula_mm54qnz9',
    /**
     * Lo que define cada lista de venta, en % (40 = 40%). L1, L7 y L8 son costo final + flete +
     * margen; L2 y L3 son L1 menos su descuento. Las fórmulas del tablero, verificadas contra
     * productos reales, están replicadas en `lib/precios`.
     */
    margenL1: 'numeric_mm58135k',
    descuentoL2: 'numeric_mm58g3jr',
    descuentoL3: 'numeric_mm596bhf',
    margenL7: 'numeric_mm5rnj0',
    margenL8: 'numeric_mm5r3ap5',
    /** "🤖Imagen de Producto" (file): la foto del producto. */
    imagen: 'file_mm6zfsmf',
    /**
     * "🤖Cod Interno Prov" (mirror): espeja el "✋Cód Persona" de los proveedores conectados en
     * `proveedor`. Con varios proveedores viene como lista separada por comas, en el mismo orden.
     */
    proveedorCodigo: 'lookup_mm7x8mx1',
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
    /* "🤖 Estado de Emision PDF" (color_mm5z7nhz) ya NO existe en el tablero: el PDF lo genera la
       app. No se escribe más. */
    /** "🤖Estado de Envío PDF": Enviar / Enviando / Enviado / Error de Envio. */
    estadoEnvio: 'color_mm5zfts1',
    /** "🤖 Orden de Compra PDF" (file): el documento que genera el tablero al emitir. */
    pdf: 'file_mm5zgtkw',
    /** "🤖ID Compra": el identificador que ve el usuario. */
    idCompra: 'pulse_id_mm5zskj8',
    /** "🤖Nro Orden" (numbers): el número de la orden ("OC-006" → 6), el que se imprime en el PDF. */
    nroOrden: 'numeric_mm7xfvh3',
    /** "🤖IVA $" (numbers): el IVA total de la orden, la suma del IVA de sus productos. */
    iva: 'numeric_mm7z19n0',
    /** "🤖 Fecha Estimada de Recepcion" (date): emisión + "✋️OC 100% Recibida en:" del proveedor. */
    fechaRecepcionEstimada: 'date_mm7yvm4v',
    /** "🤖Casilla de Envío" (text): desde qué correo sale la orden (ver `CASILLA_ENVIO`). */
    casillaEnvio: 'text_mm7wqzwc',
    /** "🤖Fecha Hora de Envío" (date con hora): cuándo se confirmó el envío al proveedor. */
    fechaHoraEnvio: 'date_mm7wjs39',
    /** "🤖Estado Consulta Proveedor": Enviar Consulta / Enviando / Consulta Enviada / Error. */
    estadoConsulta: 'color_mm7wpa6s',
    /** "🤖Texto Consulta" (long_text): el mensaje de la consulta que se le manda al proveedor. */
    textoConsulta: 'long_text_mm7w2384',
    /**
     * "🤖Estado de la Orden": En Curso / Completada / Cancelada (ver `ESTADO_ORDEN_INDEX`). Antes se
     * llamaba "🤖Estado De Cancelacion" y era un disparador; el ID quedó igual.
     */
    estadoCancelacion: 'color_mm5z77hz',
    /** "🤖Estado de Recepcion": ver `ESTADO_RECEPCION_INDEX`. */
    estadoRecepcion: 'color_mm7y8s54',
    /**
     * "🚛 ❓ Pend de Recibir Compra" (→ 18425512704): los pendientes de recepción de la orden. La
     * columna se recreó en el tablero (antes `board_relation_mm5zzm6f`). Para LEER los pendientes
     * de una orden no se usa: se filtran desde su propio tablero (ver `getLineasOrden`).
     */
    pendRecibir: 'board_relation_mm7yqxkw',
    /** "🗒️ ❓ Pend de Recibir Fact." (→ 18425512694). Recreada (antes `board_relation_mm5zrhng`). */
    pendRecibirFact: 'board_relation_mm7yypmz',
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
    /** "🤖 Unidad de Compra" (dropdown): en qué se compra el producto. */
    unidadCompra: 'dropdown_mm7xte8r',
    /** "🤖 Cant x Envase" (numbers): unidades por envase al momento de la orden. */
    cantXEnvase: 'numeric_mm7xsw4y',
    /** "🤖Cant Recibida" (numbers): las unidades que ya entraron. */
    cantRecibida: 'numeric_mm7ydrms',
    /** "🤖Pend de Recibir" (fórmula): cant total pedida − cant recibida. */
    pendRecibir: 'formula_mm7yhada',
    /** "🤖Estado de Recepcion": {"0":"Parcialmente Recibido","1":"100% Recibido","2":"Pend de Recibir"}. */
    estadoRecepcion: 'color_mm7yw2rx',
    /** "🤖P. Unitario" (numbers): el precio de lista del proveedor ("✋️Costo x Unid"). */
    precioUnitario: 'numeric_mm7x7q5r',
    /** "🤖Descuento" (numbers): el % de descuento total del proveedor (los "✋️Descuento 1..4" en cascada). */
    descuento: 'numeric_mm7xgb34',
    /** "🤖Bonif.en Mercaderia" (numbers): el % de bonificación en mercadería. */
    bonifMercaderia: 'numeric_mm7x9vq',
    /** "🤖IVA $" (numbers): el IVA del producto en pesos (subtotal × "✋IVA" del Maestro). */
    iva: 'numeric_mm7zbe7z',
    /** "🤖IVA %" (numbers, en %): la alícuota de IVA aplicada al producto ("✋IVA" del Maestro). */
    ivaTasa: 'numeric_mm7zaraf',
  },
  /* Columnas de COMPRAS en el board de Personas. Van aparte de `persona` a propósito: ese grupo se
     pide entero en la búsqueda de proveedores, y éstas sólo las necesitan las pantallas de compras. */
  personaCompras: {
    /** "✋Plazo de Entrega (días)": vacío = sin alerta de demora para ese proveedor. */
    plazoEntrega: 'numeric_mm7wzjf7',
    /** "✋Día de Actualización de Lista": el día del mes en que el proveedor manda su lista. */
    diaActualizacionLista: 'numeric_mm7wqp95',
    /** "🤖Última Actualización de Lista": la escribe la app al confirmar una actualización. */
    ultimaActualizacionLista: 'date_mm7w42dk',
  },
  /* "⚙️Configuracion - Sistema" (18421035530). */
  configuracion: {
    /** "✋Leyenda Orden de Compra" (text): las condiciones de entrega del pie del PDF de la orden. */
    leyendaOrdenCompra: 'text_mm7y7sdy',
  },
  /* "🚛 ❓ Pend de Recibir Compra" (18425512704): un ítem por producto de la orden. */
  pendRecibirCompra: {
    ctaCte: 'board_relation_mm5zc4dd',
    ordenCompra: 'board_relation_mm5z3f96',
    producto: 'board_relation_mm5zsb5x',
    /** "🤖Q Pedida": las UNIDADES pedidas. */
    qPedida: 'numeric_mm5zyk4y',
    /** "🤖Q Remitada" (mirror de los "🤖Q RTO" de sus subelementos): lo ya recibido. */
    qRemitada: 'lookup_mm7xwdqc',
    /** "🤖Estado Del Pedido": ver `ESTADO_PEND_RECIBIR_INDEX`. */
    estado: 'color_mm5z3qgt',
  },
  /* Subelementos del pendiente de recepción (18425513687): un remito por subelemento. */
  pendRecibirCompraSub: {
    /** "🤖Q RTO": las unidades que entraron con ese remito. */
    qRecibida: 'numeric_mm5z7kgh',
  },
  /* "🗒️ ❓ Pend de Recibir Fact." (18425512694): un ítem por producto de la orden. */
  pendRecibirFact: {
    ctaCte: 'board_relation_mm5znhc7',
    ordenCompra: 'board_relation_mm5zhp5e',
    producto: 'board_relation_mm5z32pw',
    /** "🤖 Q a facturar": las UNIDADES pedidas, que son las que el proveedor va a facturar. */
    qAFacturar: 'numeric_mm5zm6c2',
    /** "🤖Estado Pendientes": ver `ESTADO_PEND_FACT_INDEX`. */
    estado: 'color_mm5zhek7',
  },
  /* "Venta Pend de Liq CYO" (18421465215). No tiene proveedor: se llega a él por el producto. */
  ventaPendLiqCyo: {
    /** "📦Productos" (→ Maestro 18421035535). */
    producto: 'board_relation_mm5p5kma',
    /** "🤖Estado de Liquidacion": ver `ESTADO_LIQUIDACION_INDEX`. Puede estar VACÍO. */
    estado: 'status',
    /** "🤖Pend de Liq" (fórmula): unidades vendidas que todavía no se liquidaron. */
    pendLiq: 'formula_mm5nk0bd',
    /** "🤖Cant Liq CYO" (mirror de los subelementos): unidades ya liquidadas. */
    cantLiq: 'lookup_mm5n9273',
  },
} as const

/** "🤖Estado Del Pedido" del pendiente de recepción: {"0":"Parcialmente Recibido","1":"100% Recibido","2":"Cancelado"}. Un pendiente nuevo nace SIN estado: no hay etiqueta "Pend de Recibir". */
export const ESTADO_PEND_RECIBIR_INDEX = { parcial: 0, completo: 1, cancelado: 2 } as const

/**
 * Etiqueta con la que NACE un pendiente de recepción en "🤖Estado Del Pedido". Se escribe por su
 * TEXTO (no tiene un índice fijo todavía) y, si falta en el tablero, Monday la crea.
 */
export const ETIQUETA_PEND_RECIBIR = 'Pendiente de recibir'

/**
 * "🤖Estado de Recepcion" del SUBELEMENTO de la orden (color_mm7yw2rx):
 * {"0":"Parcialmente Recibido","1":"100% Recibido","2":"Pend de Recibir"}.
 */
export const ESTADO_RECEPCION_SUB_INDEX = { parcial: 0, completo: 1, pendiente: 2 } as const

/**
 * "🤖Estado de Liquidacion" de "Venta Pend de Liq CYO":
 * {"0":"Parcialmente Liquidado","1":"Liquidado 100%","2":"Sin Liquidar"}.
 */
export const ESTADO_LIQUIDACION_INDEX = { parcial: 0, liquidado: 1, sinLiquidar: 2 } as const

/** "🤖Estado Pendientes" del pendiente de factura: {"0":"Pendiente de Facturar","1":"Listo","2":"Detenido"}. */
export const ESTADO_PEND_FACT_INDEX = { pendiente: 0, listo: 1, detenido: 2 } as const

/**
 * Las cuatro columnas de estado-disparador de la orden comparten la misma forma (ver "🤖Estado de
 * Envío PDF", "🤖Estado De Cancelacion" y "🤖Estado Consulta Proveedor"): el 3 es el que se escribe
 * para pedirle a la automatización que actúe, y la automatización lo lleva a 1 (hecho) o 2 (error).
 */
export const ESTADO_DISPARADOR_INDEX = { enCurso: 0, hecho: 1, error: 2, disparar: 3 } as const

/** "🤖Estado de la Orden" (color_mm5z77hz): {"0":"En Curso","1":"Completada","2":"Cancelada"}. */
export const ESTADO_ORDEN_INDEX = { enCurso: 0, completada: 1, cancelada: 2 } as const

/**
 * "🤖Estado de Recepcion" de la orden (color_mm7y8s54):
 * {"0":"Parcialmente Recibida","1":"100% Recibida","2":"Pend de Recibir"}.
 */
export const ESTADO_RECEPCION_INDEX = { parcial: 0, completa: 1, pendiente: 2 } as const

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
