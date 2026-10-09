import type { DatosComprobante } from '@/types'

interface Campo {
  clave: keyof DatosComprobante
  label: string
  /** Importe: lleva el signo `$` delante y el teclado numérico en el celular. */
  importe?: boolean
  placeholder?: string
  /** Ocupa las dos columnas (los textos largos: la razón social). */
  ancho?: boolean
}

/**
 * Los campos del comprobante, por grupo. El orden de cada grupo es el que tiene el comprobante
 * impreso, así se lee de arriba hacia abajo comparándolo con el papel.
 */
const GRUPOS: { titulo: string; icono: string; campos: Campo[] }[] = [
  {
    titulo: 'Emisor',
    icono: 'fa-building',
    campos: [
      { clave: 'razonSocialEmisor', label: 'Razón Social del Emisor', ancho: true },
      { clave: 'idFiscalEmisor', label: 'ID Fiscal del Emisor', placeholder: 'CUIT' },
      { clave: 'condicionPago', label: 'Condición de Pago' },
    ],
  },
  {
    titulo: 'Comprobante',
    icono: 'fa-file-invoice',
    campos: [
      { clave: 'nroComprobante', label: 'Nro. Factura', placeholder: '0000-00000000' },
      { clave: 'fechaEmision', label: 'Fecha Emisión', placeholder: 'dd/mm/aaaa' },
      { clave: 'fechaVencimiento', label: 'Fecha Vencimiento', placeholder: 'dd/mm/aaaa' },
    ],
  },
  {
    titulo: 'Importes',
    icono: 'fa-dollar-sign',
    campos: [
      { clave: 'importeNeto', label: 'Importe Neto $', importe: true },
      { clave: 'iva', label: 'IVA $', importe: true },
      { clave: 'percIibb', label: 'Perc. IIBB', importe: true },
      { clave: 'percIg', label: 'Perc. IG', importe: true },
      { clave: 'total', label: 'TOTAL', importe: true },
    ],
  },
  {
    titulo: 'Autorización (CAE)',
    icono: 'fa-shield-halved',
    campos: [
      { clave: 'cae', label: 'CAE' },
      { clave: 'fechaVencCae', label: 'Fecha Venc. CAE', placeholder: 'dd/mm/aaaa' },
    ],
  },
]

interface DatosComprobanteFormProps {
  datos: DatosComprobante
  /** Hay un comprobante cargado: sin él los campos no se muestran. */
  hayArchivo: boolean
  /** El comprobante se está leyendo: los campos se ven pero NO se editan. */
  leyendo: boolean
  /** No se edita nada (p. ej. otra acción en curso). */
  disabled?: boolean
  onCambio: (clave: keyof DatosComprobante, valor: string) => void
}

/**
 * La mitad derecha de "Cargar Datos Iniciales": los datos del comprobante. Aparecen al soltar el
 * archivo y se completan solos con la lectura; mientras se lee, quedan bloqueados para que nadie
 * escriba un dato que la lectura va a pisar.
 */
export function DatosComprobanteForm({ datos, hayArchivo, leyendo, disabled = false, onCambio }: DatosComprobanteFormProps) {
  if (!hayArchivo) {
    return (
      <div className="cdc cdc--vacio">
        <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
        <p>
          Cargá el comprobante en el recuadro de la izquierda: sus datos se completan solos y
          aparecen acá.
        </p>
      </div>
    )
  }

  const bloqueado = leyendo || disabled
  return (
    <div className={`cdc ${leyendo ? 'cdc--leyendo' : ''}`} aria-busy={leyendo}>
      <h3 className="cdc-titulo">
        <i className="fas fa-clipboard-list" /> Datos del comprobante
        {leyendo && (
          <span className="cdc-estado">
            <i className="fas fa-circle-notch spin" /> Completando…
          </span>
        )}
      </h3>

      {GRUPOS.map((g) => (
        <fieldset className="cdc-grupo" key={g.titulo} disabled={bloqueado}>
          <legend className="cdc-grupo-t">
            <i className={`fas ${g.icono}`} /> {g.titulo}
          </legend>
          <div className="cdc-grid">
            {g.campos.map((c) => {
              const id = `comp-${c.clave}`
              return (
                <div className={`cdc-campo ${c.ancho ? 'cdc-campo--ancho' : ''}`} key={c.clave}>
                  <label htmlFor={id} className="cdc-label">
                    {c.label}
                  </label>
                  <div className={`cdc-input-box ${c.importe ? 'cdc-input-box--importe' : ''}`}>
                    {c.importe && <span className="cdc-signo">$</span>}
                    <input
                      id={id}
                      type="text"
                      className={`cdc-input ${c.clave === 'total' ? 'cdc-input--total' : ''}`}
                      value={datos[c.clave]}
                      placeholder={leyendo ? '' : (c.placeholder ?? (c.importe ? '0,00' : ''))}
                      inputMode={c.importe ? 'decimal' : undefined}
                      readOnly={bloqueado}
                      onChange={(e) => onCambio(c.clave, e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
