import { type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import type { ResumenCompra } from '@/lib/compras'
import { money } from '@/lib/format'
import { fechaHoyAR, fechaRecepcionEstimada } from '@/lib/ordenDoc'
import { useApp } from '@/state/hooks'

interface ResumenEmisionProps {
  resumen: ResumenCompra
  /** El PDF se está generando: bloquea el botón y muestra el spinner. */
  generando: boolean
  /** El PDF de la orden ya se generó: el botón queda en verde, como el de envío. */
  emitido: boolean
  /** react-pdf no pudo generar el PDF: el botón queda en rojo con "Error de emisión". */
  errorPdf?: boolean
  /** La orden ya se envió: no se puede volver a emitir (cambiaría lo que recibió el proveedor). */
  enviado?: boolean
  onGenerar: () => void
  /** Lo que va pegado debajo del botón de emisión: "Ver OC emitida". */
  children?: ReactNode
}

interface FilaProps {
  label: string
  /** Campo que viaja al documento: se marca con asterisco. */
  requerido?: boolean
  /** Color del valor: verde (favorable), rojo (alerta) o "total" (destacado). */
  tono?: 'verde' | 'total' | 'rojo'
  children: ReactNode
}

function Fila({ label, requerido = true, tono, children }: FilaProps) {
  const clase =
    tono === 'total'
      ? 'rvalue--total'
      : tono === 'verde'
        ? 'rvalue--green'
        : tono === 'rojo'
          ? 'rvalue--red'
          : ''
  return (
    <div className="rrow">
      <span className="rlabel">
        {label}
        {requerido && <span className="rreq">*</span>}
      </span>
      <span className={`rvalue ${clase}`}>{children}</span>
    </div>
  )
}

/** Resumen final antes de emitir. Sólo lectura: todo viene de las etapas anteriores. */
export function ResumenEmision({
  resumen,
  generando,
  emitido,
  errorPdf = false,
  enviado = false,
  onGenerar,
  children,
}: ResumenEmisionProps) {
  const { comprador, proveedor, nroOrden } = useApp()

  return (
    <div className="card card--flush resumen-emision">
      <h3 className="resumen-title">Resumen de la orden de compra</h3>

      <div className="rgroup">
        <Fila label="Comprador asignado">
          {comprador && (
            <>
              <Avatar ini={comprador.ini} color={comprador.color} size="sm" /> {comprador.name}
            </>
          )}
        </Fila>
        <Fila label="Proveedor">{proveedor?.name ?? '--'}</Fila>
        <Fila label="CUIT/CUIL">{proveedor?.cuit ?? '--'}</Fila>
        <Fila label="Condición de pago">{proveedor?.condicionPago ?? '--'}</Fila>
        {/* El próximo "🤖ID Compra" del tablero: el que se imprime en el PDF. */}
        <Fila label="N° de orden">{nroOrden ?? 'Calculando...'}</Fila>
        {/* Emisión (hoy) + los días del proveedor en "✋️OC 100% Recibida en:". */}
        <Fila label="Fecha de Recepcion Estimada" requerido={false}>
          {fechaRecepcionEstimada(fechaHoyAR(), proveedor?.diasRecepcion ?? null) ?? (
            <span className="rvalue--falta">Sin días de recepción cargados</span>
          )}
        </Fila>
        <Fila label="Cantidad de productos">{resumen.lineas}</Fila>
      </div>

      <hr className="rsep" />

      {/* Lo que se le pide al proveedor y cuánto suma. Una orden de compra no liquida IVA ni
          bonifica, así que el importe total es la suma directa de sus líneas. */}
      <div className="rgroup">
        <Fila label="Importe total" tono="total">
          {money(resumen.total)}
        </Fila>
        {/* Sin tono: son CANTIDADES, no importes ni indicadores de salud de la operación. El verde
            de esta ficha señala un valor favorable, y "2 envases" no es ni bueno ni malo — pintarlo
            le daba un peso que compite con el único número que sí lo merece, el importe total. */}
        <Fila label="Envases a pedir">{resumen.envases}</Fila>
        <Fila label="Unidades a pedir">{resumen.unidades}</Fila>
      </div>

      <button
        type="button"
        className="btn-generar"
        onClick={onGenerar}
        /* Emitida sigue habilitado: se puede volver a emitir para corregir un error. Ya enviada, no:
           cambiaría el documento que recibió el proveedor. */
        disabled={generando || enviado}
        aria-busy={generando}
        title={
          generando
            ? undefined
            : enviado
              ? 'La orden ya se envió al proveedor: no se puede volver a emitir.'
              : emitido
                ? 'Tocá para volver a emitir con los datos actuales'
                : errorPdf
                  ? 'Tocá para reintentar la emisión'
                  : undefined
        }
        /* Emitida: verde para confirmar, como el de "Enviado". Error del PDF: rojo; sigue habilitado
           por si el reintento anda. */
        style={
          emitido
            ? { backgroundColor: 'var(--green)', color: '#fff' }
            : errorPdf && !generando
              ? { backgroundColor: 'var(--red)', color: '#fff' }
              : undefined
        }
      >
        {generando ? (
          <>
            <i className="fas fa-circle-notch spin" /> Generando PDF...
          </>
        ) : emitido ? (
          <>
            <i className="fas fa-check" /> Orden de compra emitida
          </>
        ) : errorPdf ? (
          <>
            <i className="fas fa-xmark" /> Error de emisión
          </>
        ) : (
          <>
            <i className="far fa-file-pdf" /> EMITIR ORDEN DE COMPRA
          </>
        )}
      </button>

      {children}
    </div>
  )
}
