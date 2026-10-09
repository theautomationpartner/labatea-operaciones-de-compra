import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { alto, px } from '@/features/emision/pdf/comun'
import { round2 } from '@/lib/format'
import { conCondiciones, costoFinalDe, type ActualizacionHecha } from '@/lib/precios'

export interface DatosActualizacionCostosPdf {
  actualizacion: ActualizacionHecha
  /** Nombre del archivo, sin extensión: también es el título del documento. */
  nombre: string
  /** Logo de la empresa, como data URL. */
  logoSrc?: string
}

/*
 * Mismo encabezado, paleta y medidas que la Orden de Compra (`OrdenCompraPdf`): los documentos de
 * la app se ven como una familia. La hoja va apaisada porque la tabla tiene las mismas columnas que
 * la de la app (costo anterior, variación, costo nuevo, descuentos, bonificación y costo final).
 */

const VIOLETA = '#5c4b8e'
const VERDE = '#00a859'
const ROJO = '#d00000'

const AR = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DEC = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const num = (n: number): string => AR.format(round2(n))
const pct = (n: number): string => `${DEC.format(n)}%`

const s = StyleSheet.create({
  page: {
    paddingTop: '10mm',
    paddingRight: '12mm',
    paddingBottom: '14mm',
    paddingLeft: '12mm',
    fontFamily: 'Helvetica',
    fontSize: px(10.5),
    color: '#333',
    backgroundColor: '#fff',
  },
  bold: { fontFamily: 'Helvetica-Bold' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: px(2),
    borderBottomColor: VIOLETA,
    paddingBottom: px(10),
    marginBottom: px(14),
  },
  headerCelda: { flex: 1 },
  logo: { width: px(190), height: px((190 * 110) / 315) },
  empresaInfo: { flex: 1, textAlign: 'right', fontSize: px(10), lineHeight: alto(10, 1.4), color: '#555' },
  empresaNombre: { fontFamily: 'Helvetica-Bold', color: '#333', fontSize: px(13), marginBottom: px(3) },

  tituloSeccion: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: px(14) },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: px(22), color: '#222', letterSpacing: px(1) },
  noValido: { fontSize: px(9), color: '#888' },
  fechasBox: { flex: 1, textAlign: 'right', fontSize: px(11), lineHeight: alto(11, 1.5) },
  strong: { fontFamily: 'Helvetica-Bold', color: '#000' },

  datosBox: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderLeftWidth: px(4),
    borderLeftColor: VERDE,
    paddingVertical: px(10),
    paddingHorizontal: px(15),
    marginBottom: px(16),
  },
  datosCol: { flex: 1 },
  datosLinea: { lineHeight: alto(11, 1.5) },

  tabla: { marginBottom: px(16) },
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
    fontSize: px(9),
    textTransform: 'uppercase',
    paddingVertical: px(7),
    paddingHorizontal: px(5),
    textAlign: 'center',
  },
  tdFila: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: px(1), borderBottomColor: '#eee' },
  td: { paddingVertical: px(6), paddingHorizontal: px(5), textAlign: 'center', color: '#444' },
  izq: { textAlign: 'left' },
  der: { textAlign: 'right' },
  tachado: { color: '#98a2b3', textDecoration: 'line-through' },
  nuevo: { fontFamily: 'Helvetica-Bold', color: VERDE },
  sube: { color: ROJO },
  baja: { color: VERDE },
  cCod: { width: px(62) },
  cDesc: { flex: 1 },
  cCosto: { width: px(92) },
  cVar: { width: px(118) },
  cDto: { width: px(78) },
  cBonif: { width: px(64) },
  cFinal: { width: px(98) },

  resumen: {
    alignSelf: 'flex-end',
    width: px(300),
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: px(2),
    borderTopColor: VIOLETA,
    paddingTop: px(8),
    fontFamily: 'Helvetica-Bold',
    fontSize: px(13),
    color: '#000',
    marginBottom: px(16),
  },
  pie: {
    paddingTop: px(12),
    borderTopWidth: px(1),
    borderTopColor: '#eee',
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    lineHeight: alto(10.5, 1.6),
  },
})

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "3,4% ($ 145,67)": la variación del costo, como en la tabla de la app. */
function variacion(anterior: number, nuevo: number): string {
  const dif = round2(nuevo - anterior)
  if (Math.abs(dif) < 0.005) return 'Sin cambio'
  const signo = dif < 0 ? '−' : '+'
  const p = anterior > 0 ? `${signo}${DEC.format(Math.abs((dif / anterior) * 100))}% ` : ''
  return `${p}(${signo}$ ${num(Math.abs(dif))})`
}

/**
 * El comprobante de una actualización de costos: encabezado de La Batea, datos de la actualización
 * (proveedor, fecha, responsable, vía) y la lista EXACTA de productos actualizados en el Maestro,
 * con su costo anterior tachado y el nuevo en verde.
 */
export function ActualizacionCostosPdf({ actualizacion: a, nombre, logoSrc }: DatosActualizacionCostosPdf) {
  const via =
    a.tipo === 'Excel'
      ? `Lista de precios del proveedor${a.archivo ? ` (${a.archivo})` : ''}`
      : a.tipo === 'Porcentaje'
        ? `Porcentaje sobre toda la lista (${a.porcentaje !== undefined ? `${a.porcentaje > 0 ? '+' : ''}${pct(a.porcentaje)}` : '—'})`
        : 'Artículo individual'

  return (
    <Document title={nombre} author="La Batea S.A." subject="Actualización de Costos">
      <Page size="A4" orientation="landscape" style={s.page}>
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
            <Text style={s.h1}>ACTUALIZACIÓN DE COSTOS</Text>
            <Text style={s.noValido}>Comprobante interno · Documento no válido como factura</Text>
          </View>
          <View style={s.fechasBox}>
            <Text>
              <Text style={s.strong}>Fecha de actualización:</Text> {fechaHora(a.fecha)}
            </Text>
            <Text>
              <Text style={s.strong}>Localidad:</Text> TANDIL, 7000
            </Text>
          </View>
        </View>

        <View style={s.datosBox}>
          <View style={s.datosCol}>
            <Text style={s.datosLinea}>
              <Text style={s.bold}>Proveedor:</Text> {a.proveedor.name}
            </Text>
            <Text style={s.datosLinea}>
              <Text style={s.bold}>Código de proveedor:</Text> {a.proveedor.codigo || '—'}
            </Text>
          </View>
          <View style={s.datosCol}>
            <Text style={s.datosLinea}>
              <Text style={s.bold}>Responsable:</Text> {a.usuario?.name ?? '—'}
            </Text>
            <Text style={s.datosLinea}>
              <Text style={s.bold}>Actualizado por:</Text> {via}
            </Text>
          </View>
        </View>

        <View style={s.tabla}>
          <View style={s.thFila} fixed>
            <Text style={[s.th, s.cCod]}>Código</Text>
            <Text style={[s.th, s.cDesc, s.izq]}>Producto</Text>
            <Text style={[s.th, s.cCosto]}>{'Costo\nanterior'}</Text>
            <Text style={[s.th, s.cVar]}>{'Variación\ncosto'}</Text>
            <Text style={[s.th, s.cCosto]}>{'Costo\nnuevo'}</Text>
            <Text style={[s.th, s.cDto]}>Descuentos</Text>
            <Text style={[s.th, s.cBonif]}>{'Bonif.\nen Merc.'}</Text>
            <Text style={[s.th, s.cFinal]}>{'Costo final\nnuevo'}</Text>
          </View>
          {a.productos.map(({ producto: p, nuevo, condiciones }) => {
            const con = conCondiciones(p, condiciones)
            const cambiaCosto = Math.abs(nuevo - p.costo) >= 0.005
            const cambianDto = condiciones.descuentos !== undefined
            const cambiaBonif = condiciones.bonif !== undefined
            return (
              <View key={p.id} style={s.tdFila} wrap={false}>
                <Text style={[s.td, s.cCod]}>{p.codigo || '—'}</Text>
                <Text style={[s.td, s.cDesc, s.izq]}>{p.nombre}</Text>
                <Text style={[s.td, s.cCosto, s.der, ...(cambiaCosto ? [s.tachado] : [])]}>{`$ ${num(p.costo)}`}</Text>
                <Text style={[s.td, s.cVar, s.der, ...(cambiaCosto ? [nuevo < p.costo ? s.baja : s.sube] : [])]}>
                  {variacion(p.costo, nuevo)}
                </Text>
                <Text style={[s.td, s.cCosto, s.der, ...(cambiaCosto ? [s.nuevo] : [])]}>{`$ ${num(nuevo)}`}</Text>
                <Text style={[s.td, s.cDto, ...(cambianDto ? [s.nuevo] : [])]}>
                  {con.descuentos.length ? con.descuentos.map(pct).join(', ') : '—'}
                </Text>
                <Text style={[s.td, s.cBonif, ...(cambiaBonif ? [s.nuevo] : [])]}>{con.bonif ? pct(con.bonif) : '—'}</Text>
                <Text style={[s.td, s.cFinal, s.der, s.nuevo]}>{`$ ${num(costoFinalDe(con, nuevo))}`}</Text>
              </View>
            )
          })}
        </View>

        <View style={s.resumen} wrap={false}>
          <Text>PRODUCTOS ACTUALIZADOS:</Text>
          <Text>{a.productos.length}</Text>
        </View>

        <Text style={s.pie} wrap={false}>
          ------- COSTOS SIN IVA -------{'\n'}
          Los nuevos costos quedaron registrados en el Maestro de Productos, con su actividad "Actualización de
          precio" en cada producto.
        </Text>
      </Page>
    </Document>
  )
}
