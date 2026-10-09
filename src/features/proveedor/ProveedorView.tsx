import { useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { MENSAJE_PROVEEDOR_BLOQUEADO, personaBloqueada } from '@/lib/credito'
import { ETAPA, indiceDePaso, pasosDe } from '@/lib/pasos'
import { ROTULO } from '@/lib/personas'
import {
  MSG_SIN_CTA_CTE,
  proveedorSinCtaCte,
  rechazoAlSeleccionar,
  type RechazoProveedor,
} from '@/lib/proveedorCompra'
import { getSaldosPersona } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Proveedor, SaldosPersona } from '@/types'
import { BuscarProveedor, type BusquedaEstado } from './BuscarProveedor'
import { ProveedorFicha } from './ProveedorFicha'

/**
 * Etapa 1 de la ORDEN DE COMPRA —y de ACTUALIZAR PRECIOS y CARGAR COMPROBANTE DE COMPRA—: a quién
 * se le compra.
 *
 * ACTUALIZAR PRECIOS y CARGAR COMPROBANTE DE COMPRA usan esta MISMA pantalla, con el mismo buscador,
 * la misma ficha y la misma regla de selección (tiene que ser proveedor). Lo que no aplica son las
 * validaciones de crédito y de cuenta corriente: ni actualizar su lista ni cargar un comprobante que
 * él emitió le emite nada al proveedor.
 *
 * Es la misma pantalla que la etapa 1 de PAGOS, pieza por pieza —el buscador y la ficha son LOS
 * MISMOS componentes, con la misma consulta al mismo tablero— y con las MISMAS validaciones:
 *
 *   · la persona tiene que ser de categoría "Proveedores" y estar ACTIVA (resuelto en la consulta);
 *   · tiene que operar en CUENTA CORRIENTE (se valida al SELECCIONARLA);
 *   · y tener efectivamente una cuenta corriente asignada en el sistema (se valida al AVANZAR).
 *
 * Las validaciones se resuelven con el botón siempre encendido: si algo falta, la ventana lo
 * explica al hacer click, en vez de dejar un botón muerto sin motivo.
 */
export function ProveedorView() {
  const { proveedor, operacion } = useApp()
  const dispatch = useDispatch()
  // Estado de la búsqueda: gobierna qué se muestra en el lugar de la ficha.
  const [estadoBusqueda, setEstadoBusqueda] = useState<BusquedaEstado>('idle')
  /* Saldos de la cuenta corriente del proveedor. Viven en el estado LOCAL y no en el global: son
     un dato de esta pantalla, y el proveedor ya se guarda arriba. `null` = todavía no llegaron. */
  const [saldos, setSaldos] = useState<SaldosPersona | null>(null)
  // Avisos emergentes: uno por cada motivo que frena el avance.
  const [avisoSinProveedor, setAvisoSinProveedor] = useState(false)
  const [avisoBloqueado, setAvisoBloqueado] = useState(false)
  const [avisoSinCtaCte, setAvisoSinCtaCte] = useState(false)
  /**
   * La persona que la búsqueda trajo y NO se pudo cargar, con el motivo. Mientras esto tenga valor
   * hay una ventana abierta explicando por qué: es lo único que el usuario ve de ella. Su ficha no
   * llega a dibujarse, que es el punto de validar al seleccionar y no al avanzar.
   */
  const [rechazo, setRechazo] = useState<{ motivo: RechazoProveedor; persona: Proveedor } | null>(
    null,
  )
  // Ventana emergente cuando la búsqueda no encuentra al proveedor: es el ÚNICO aviso de ese caso.
  const [avisoNoEncontrado, setAvisoNoEncontrado] = useState(false)

  // Cada vez que la búsqueda termina en "no encontrado", se abre la ventana emergente.
  useEffect(() => {
    if (estadoBusqueda === 'no-encontrado') setAvisoNoEncontrado(true)
  }, [estadoBusqueda])

  /* Los saldos llegan después que la ficha, en su propia consulta: sus cajas se completan solas
     cuando resuelve, sin frenar al resto de la pantalla. Ante un error quedan en `null` y lo
     comunica la ventana global. */
  useEffect(() => {
    if (!proveedor) {
      setSaldos(null)
      return
    }
    let vivo = true
    setSaldos(null)
    getSaldosPersona(proveedor.id)
      .then((s) => vivo && setSaldos(s))
      .catch(() => {
        if (!vivo) return
        dispatch({ type: 'errorMonday', accion: 'obtener los saldos del proveedor' })
      })
    return () => {
      vivo = false
    }
  }, [proveedor, dispatch])

  /**
   * Qué pasa cuando la búsqueda devuelve a alguien.
   *
   * Acá se decide si esa persona ENTRA o no al estado, y por eso la regla que depende de QUIÉN
   * es —que sea proveedor— se evalúa en este punto y no al intentar avanzar: a quien no sirve para
   * esta operación no se le llega a mostrar ni un dato. La condición de pago no restringe.
   *
   * Un rechazo NO descarta lo que ya estaba cargado: si venía operando con un proveedor válido,
   * ese sigue en pantalla. Buscar a alguien que no sirve es un intento fallido, no una orden de
   * borrar el trabajo hecho.
   */
  const elegir = (persona: Proveedor) => {
    const motivo = rechazoAlSeleccionar(persona)
    if (motivo) {
      setRechazo({ motivo, persona })
      return
    }
    dispatch({ type: 'setProveedor', proveedor: persona })
  }

  const indice = indiceDePaso('proveedor', operacion)
  const esPrecios = operacion === 'ACTUALIZAR PRECIOS'
  const esComprobante = operacion === 'CARGAR COMPROBANTE DE COMPRA'
  /* Sólo la orden de compra le emite algo al proveedor: las otras no validan crédito ni cuenta. */
  const sinValidarEmision = esPrecios || esComprobante
  const SIGUIENTE = esPrecios ? ETAPA.precios : esComprobante ? ETAPA.datosIniciales : ETAPA.productos

  /* El proveedor está confirmado: hay uno cargado y la búsqueda no está en curso ni terminó mal. */
  const proveedorListo = estadoBusqueda === 'idle' && !!proveedor
  const bloqueado = !sinValidarEmision && personaBloqueada(proveedor)
  /* Lo ÚNICO que queda por validar al avanzar, y sólo para los de cuenta corriente: el proveedor
     es válido, y lo que falta es un dato del SISTEMA que puede cargarse en Monday sin cambiar de
     proveedor. Uno de contado no necesita cuenta corriente para recibir la orden. */
  const sinCtaCte = !sinValidarEmision && proveedorListo && proveedorSinCtaCte(proveedor)

  const continuar = () => {
    if (!proveedorListo) {
      setAvisoSinProveedor(true)
      return
    }
    if (bloqueado) {
      setAvisoBloqueado(true)
      return
    }
    if (sinCtaCte) {
      setAvisoSinCtaCte(true)
      return
    }
    dispatch({ type: 'goto', paso: esPrecios ? 'precios' : esComprobante ? 'comprobante' : 'productos' })
  }

  /* Por qué todavía no se puede avanzar. Se muestra en el footer, al lado del botón. */
  const motivoBloqueo = !proveedorListo
    ? 'Buscá y confirmá un proveedor para continuar'
    : bloqueado
      ? 'Proveedor bloqueado: no se puede operar'
      : sinCtaCte
        ? 'El proveedor no tiene cuenta corriente asignada'
        : undefined

  return (
    <section className="view cliente-v2 paso-layout">
      {/* ZONA 1 · contexto de la operación y navegación, siempre a la vista. */}
      <PasoHeader pasos={pasosDe(operacion)} actual={indice} />

      {/* ZONA 2 · el trabajo del paso: a qué proveedor se le compra. */}
      <div className="paso-body">
        <PasoTitulo
          numero={indice + 1}
          titulo={ETAPA.proveedor}
          descripcion={
            esPrecios
              ? 'Buscá al proveedor cuya lista de precios vas a actualizar. En la etapa siguiente se trabaja sólo con sus productos.'
              : esComprobante
                ? 'Buscá al proveedor que emitió el comprobante de compra. En la etapa siguiente cargás el comprobante y sus datos.'
                : 'Buscá al proveedor al que le vas a emitir la orden de compra. Los productos de la etapa siguiente van a ser sólo los suyos.'
          }
        />

        {/* Buscador del proveedor: el MISMO componente del paso 1 de PAGOS. El responsable de la
            operación ya se ve —y se cambia— en el selector del encabezado, así que no se repite. */}
        <div className="toolbar-wrapper">
          <div className="card unified-toolbar">
            <BuscarProveedor
              estado={estadoBusqueda}
              onEstado={setEstadoBusqueda}
              onElegir={elegir}
            />
          </div>
        </div>

        {/* Ni el proveedor no encontrado ni el fallo de la API tienen cartel en línea: los dos se
            avisan por ventana emergente. La ficha se muestra SIEMPRE: skeleton mientras no hay
            proveedor o se consulta, y se rellena al resolver la búsqueda. */}
        <ProveedorFicha
          proveedor={estadoBusqueda === 'idle' ? proveedor : null}
          cargando={estadoBusqueda === 'buscando'}
          saldos={saldos}
        />

        {/* El avance queda SIEMPRE a la vista, haya o no proveedor. El botón NUNCA se apaga: si
            falta algo, la ventana lo explica al hacer click. */}
        <div className="actions-footer">
          <span className={`paso-siguiente ${motivoBloqueo ? 'paso-siguiente--bloqueo' : ''}`}>
            {motivoBloqueo ? (
              <>
                <i className="fas fa-circle-exclamation" /> {motivoBloqueo}
              </>
            ) : (
              <>
                <i className="fas fa-arrow-turn-up paso-siguiente-ic" /> Siguiente: {SIGUIENTE}
              </>
            )}
          </span>
          <button type="button" className="btn btn-primary" onClick={continuar}>
            Continuar a {SIGUIENTE} <i className="fas fa-arrow-right" />
          </button>
        </div>
      </div>

      {/* Sin proveedor cargado no se puede avanzar: se explica al intentarlo. */}
      {avisoSinProveedor && (
        <AvisoModal titulo="Falta cargar un proveedor" onClose={() => setAvisoSinProveedor(false)}>
          Para continuar tenés que buscar y cargar un proveedor. Usá el buscador de arriba para
          seleccionarlo y volvé a intentar.
        </AvisoModal>
      )}

      {/* Proveedor no encontrado: la ventana es el único aviso, no hay cartel en línea. */}
      {avisoNoEncontrado && (
        <AvisoModal titulo="Proveedor no encontrado" onClose={() => setAvisoNoEncontrado(false)}>
          El proveedor que buscó no existe o está inactivo en el sistema.
        </AvisoModal>
      )}

      {/* Proveedor bloqueado en el board: no puede usarse en el sistema. */}
      {avisoBloqueado && (
        <AvisoModal titulo="Proveedor bloqueado" onClose={() => setAvisoBloqueado(false)}>
          {MENSAJE_PROVEEDOR_BLOQUEADO}
        </AvisoModal>
      )}

      {/* La búsqueda trajo a alguien que NO es proveedor. La orden de compra es sólo para
          proveedores, así que no se carga: la ventana es lo único que se ve de esa persona. */}
      {rechazo?.motivo === 'no-es-proveedor' && (
        <AvisoModal
          titulo={`La persona seleccionada no es un ${ROTULO.singular}`}
          faltantes={[rechazo.persona.name]}
          onClose={() => setRechazo(null)}
        >
          La operación <strong>{operacion ?? 'CREAR ORDEN DE COMPRA'}</strong> sólo puede hacerse con personas con la
          categoría <strong>Proveedores</strong> en el sistema, y ésta no la tiene. Revisá su
          "✋Categoria" en el tablero de Personas, o buscá a otro {ROTULO.singular}.
        </AvisoModal>
      )}

      {/* Opera en cuenta corriente, pero el sistema no le tiene ninguna asignada. */}
      {avisoSinCtaCte && (
        <AvisoModal
          titulo="Falta la cuenta corriente del proveedor"
          onClose={() => setAvisoSinCtaCte(false)}
        >
          {/* El texto va TEXTUAL, sin agregarle nada: es el mensaje que fija el requerimiento. */}
          {MSG_SIN_CTA_CTE}
        </AvisoModal>
      )}
    </section>
  )
}
