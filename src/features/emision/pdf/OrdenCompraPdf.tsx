import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { round2 } from '@/lib/format'
import type { FilaOrden } from '@/lib/ordenDoc'
import { alto, px } from './comun'

/** Lo que el documento necesita saber. Sale del estado de la app al emitir. */
export interface DatosOrdenCompraPdf {
  /** Número de la orden ("OC-006"). */
  numero: string
  /** Nombre del archivo, sin extensión: también es el título del documento (el de la pestaña). */
  nombre: string
  proveedor: { name: string; addr: string }
  filas: FilaOrden[]
  total: number
  /**
   * Las condiciones de entrega del pie ("ATENCIÓN! En CAPITAL FEDERAL…"). Salen de Monday
   * ("⚙️Configuracion - Sistema" → "✋Leyenda Orden de Compra"). Vacía, el bloque no se dibuja.
   */
  leyenda: string
  /** Logo de la empresa, como data URL. Sin él, el documento sale sin logo. */
  logoSrc?: string
}

/*
 * La plantilla es el HTML de la orden de compra que pasó el cliente: misma estructura, mismos
 * colores y mismas medidas. El HTML mide en px CSS y react-pdf en puntos; `px()` hace la misma
 * conversión que el navegador al imprimir (ver `comun.ts`).
 *
 * Diferencias forzadas por react-pdf: Helvetica es la fuente estándar del PDF (la que el HTML usa
 * de respaldo) y no tiene peso 500, así que los importes de la tabla van en peso normal.
 */

const VIOLETA = '#5c4b8e'
const VERDE = '#00a859'
const ROJO = '#d00000'

/* Importes: miles con punto y coma decimal, sin símbolo (el símbolo lo pone la plantilla). */
const AR = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n: number): string => AR.format(round2(n))

const s = StyleSheet.create({
  // @page { margin: 10mm 15mm 15mm 15mm } · body { font-size: 11px; color: #333 }
  page: {
    paddingTop: '10mm',
    paddingRight: '15mm',
    paddingBottom: '15mm',
    paddingLeft: '15mm',
    fontFamily: 'Helvetica',
    fontSize: px(11),
    color: '#333',
    backgroundColor: '#fff',
  },
  bold: { fontFamily: 'Helvetica-Bold' },

  // .header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: px(2),
    borderBottomColor: VIOLETA,
    paddingBottom: px(10),
    marginBottom: px(15),
  },
  headerCelda: { flex: 1 },
  // .logo img { max-width: 190px; height: auto } — el logo del documento mide 315 × 110.
  logo: { width: px(190), height: px((190 * 110) / 315) },
  // .empresa-info
  empresaInfo: { flex: 1, textAlign: 'right', fontSize: px(10), lineHeight: alto(10, 1.4), color: '#555' },
  // .empresa-info h2
  empresaNombre: { fontFamily: 'Helvetica-Bold', color: '#333', fontSize: px(13), marginBottom: px(3) },

  // .titulo-seccion
  tituloSeccion: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: px(15) },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: px(24), color: '#222', letterSpacing: px(1) },
  noValido: { fontSize: px(9), color: '#888' },
  // .fechas-box
  fechasBox: { flex: 1, textAlign: 'right', fontSize: px(11) },
  strong: { fontFamily: 'Helvetica-Bold', color: '#000' },

  // .cliente-box (borde verde) · .cliente-col { line-height: 1.5 }
  clienteBox: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: px(4),
    borderLeftColor: VERDE,
    paddingVertical: px(10),
    paddingHorizontal: px(15),
    marginBottom: px(20),
  },
  clienteLinea: { lineHeight: alto(11, 1.5) },

  // .mensaje-previo
  mensajePrevio: { fontFamily: 'Helvetica-Bold', marginBottom: px(10), fontSize: px(11), color: '#333' },

  // table.productos
  tabla: { marginBottom: px(20) },
  thFila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
    borderBottomWidth: px(2),
    borderBottomColor: '#ccc',
  },
  th: {
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    fontSize: px(10),
    textTransform: 'uppercase',
    paddingVertical: px(8),
    paddingHorizontal: px(5),
    textAlign: 'center',
  },
  tdFila: { flexDirection: 'row', borderBottomWidth: px(1), borderBottomColor: '#eee' },
  td: { paddingVertical: px(6), paddingHorizontal: px(5), textAlign: 'center', color: '#444' },
  izq: { textAlign: 'left' },
  der: { textAlign: 'right' },
  // Anchos de columna: la tabla del HTML es automática; la descripción se lleva el resto.
  cCant: { width: px(65) },
  cCod: { width: px(70) },
  cDesc: { flex: 1 },
  cCosto: { width: px(95) },
  cBonif: { width: px(65) },
  cTotal: { width: px(105) },

  // .totales-container / .totales-box
  totalesBox: { alignSelf: 'flex-end', width: px(280), marginBottom: px(20) },
  // .totales-fila.total-pesos
  totalPesos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: px(2),
    borderTopColor: VIOLETA,
    fontFamily: 'Helvetica-Bold',
    color: '#000',
    paddingTop: px(8),
    paddingBottom: px(5),
    marginTop: px(4),
    fontSize: px(15),
  },

  // .footer-oc
  footer: {
    paddingTop: px(15),
    borderTopWidth: px(1),
    borderTopColor: '#eee',
    color: '#333',
    fontSize: px(11),
  },
  // .entrega-info
  entrega: { textAlign: 'center', marginBottom: px(15), lineHeight: alto(11, 1.6) },
  atencion: { fontFamily: 'Helvetica-Bold', color: ROJO, textTransform: 'uppercase' },
  rojo: { fontFamily: 'Helvetica-Bold', color: ROJO },
  // .precios-iva
  preciosIva: {
    textAlign: 'center',
    marginBottom: px(15),
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    lineHeight: alto(11, 1.6),
  },
  // .notas-finales
  notas: {
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    color: '#000',
    marginBottom: px(20),
    lineHeight: alto(11, 1.6),
  },
})

/** Las palabras de la leyenda que el template resalta en rojo y negrita. */
const RESALTADAS = /(ATENCI[ÓO]N!|únicamente)/i

/**
 * La leyenda con el formato del template: "ATENCIÓN!" y "únicamente" en rojo y negrita, y la
 * dirección del transporte en su propio renglón. Es texto libre de Monday: si no trae esas
 * palabras, sale tal cual.
 */
function Leyenda({ texto }: { texto: string }) {
  const conSalto = texto.replace(/\s+(Direcci[óo]n:)/, '\n$1')
  return (
    <Text style={s.entrega}>
      {conSalto.split(RESALTADAS).map((parte, i) =>
        /^atenci[óo]n!$/i.test(parte) ? (
          <Text key={i} style={s.atencion}>
            {parte}
          </Text>
        ) : /^únicamente$/i.test(parte) ? (
          <Text key={i} style={s.rojo}>
            {parte}
          </Text>
        ) : (
          parte
        ),
      )}
    </Text>
  )
}

/**
 * El PDF de la orden de compra: encabezado con el logo y los datos de La Batea, título con el
 * número y la localidad, recuadro del proveedor, tabla de productos, importe total y el pie con
 * las condiciones de entrega.
 *
 * Las filas salen de `lib/ordenDoc`, las mismas que muestra la card "Orden de Compra a generar".
 */
export function OrdenCompraPdf({
  numero,
  nombre,
  proveedor,
  filas,
  total,
  leyenda,
  logoSrc,
}: DatosOrdenCompraPdf) {
  return (
    <Document title={nombre} author="La Batea S.A." subject={`Órden de Compra ${numero}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerCelda}>{logoSrc ? <Image style={s.logo} src={logoSrc} /> : null}</View>
          <View style={s.empresaInfo}>
            <Text style={s.empresaNombre}>La Batea S.A.</Text>
            <Text>Macaya 1273 - 7000 TANDIL</Text>
            <Text>Tel. 0249-4442646</Text>
            <Text>Email: info@labatea.biz</Text>
          </View>
        </View>

        <View style={s.tituloSeccion}>
          <View style={s.headerCelda}>
            <Text style={s.h1}>ÓRDEN DE COMPRA</Text>
            <Text style={s.noValido}>Documento no válido como factura</Text>
          </View>
          <View style={s.fechasBox}>
            <Text>
              <Text style={s.strong}>Nº de Órden:</Text> {numero}
            </Text>
            <Text>
              <Text style={s.strong}>Localidad:</Text> TANDIL, 7000
            </Text>
          </View>
        </View>

        <View style={s.clienteBox}>
          <Text style={s.clienteLinea}>
            <Text style={s.bold}>Sres:</Text> {proveedor.name}
          </Text>
          <Text style={s.clienteLinea}>
            <Text style={s.bold}>Dirección:</Text> {proveedor.addr}
          </Text>
        </View>

        <Text style={s.mensajePrevio}>Atento a lo conversado oportunamente acercamos a Uds. lo siguiente</Text>

        <View style={s.tabla}>
          {/* Como el <thead> al imprimir: se repite en cada página cuando la tabla no entra en una. */}
          <View style={s.thFila} fixed>
            <Text style={[s.th, s.cCant]}>Cantidad</Text>
            <Text style={[s.th, s.cCod]}>Código</Text>
            <Text style={[s.th, s.cDesc, s.izq]}>Descripción</Text>
            <Text style={[s.th, s.cCosto]}>{'Costo neto\nen factura'}</Text>
            <Text style={[s.th, s.cBonif]}>{'Bonif.\nen Merc.'}</Text>
            <Text style={[s.th, s.cTotal]}>Total</Text>
          </View>
          {filas.map((f) => (
            // tr { page-break-inside: avoid }
            <View key={f.id} style={s.tdFila} wrap={false}>
              <Text style={[s.td, s.cCant]}>{f.cantidad}</Text>
              <Text style={[s.td, s.cCod]}>{f.codigo}</Text>
              <Text style={[s.td, s.cDesc, s.izq]}>{f.descripcion}</Text>
              <Text style={[s.td, s.cCosto, s.der]}>{num(f.costoNeto)}</Text>
              <Text style={[s.td, s.cBonif, s.der]}>{f.bonificacion}</Text>
              <Text style={[s.td, s.cTotal, s.der]}>{`${num(f.total)} $`}</Text>
            </View>
          ))}
        </View>

        {/* .totales-container { page-break-inside: avoid } */}
        <View style={s.totalesBox} wrap={false}>
          <View style={s.totalPesos}>
            <Text>IMPORTE TOTAL PESOS:</Text>
            <Text>{`$ ${num(total)}`}</Text>
          </View>
        </View>

        <View style={s.footer} wrap={false}>
          {leyenda ? <Leyenda texto={leyenda} /> : null}
          <Text style={s.preciosIva}>------- PRECIOS MAS IVA -------</Text>
          <Text style={s.notas}>
            Solicitamos incorporar a la Factura el número de Órden de Compra.{'\n'}
            La entrega parcial de un pedido dá como concluído al mismo.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
