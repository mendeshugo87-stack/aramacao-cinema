"use strict";

/*
 * AFORO Y BLOQUEO TEMPORAL DE ASIENTOS
 * ------------------------------------
 * Lo usan Compra en línea y Taquilla. Las dos pantallas piden el mapa de la
 * sala aquí, así que siempre ven los mismos asientos ocupados.
 *
 * Contrato: docs/json/07-09-ventas-pagos-boletos-qr.json
 *   GET    /cartelera/funciones/{id}/asientos/
 *   POST   /compras/bloqueos/
 *   DELETE /compras/bloqueos/{id}/
 *
 * En vista local el bloqueo de 10 minutos se simula en sessionStorage. Esa
 * parte es corta y va al final de este archivo; en ventas, donde la
 * demostración ocupaba cientos de líneas, se separó en ventas-demo.js.
 */
(function crearAsientosApi(global) {
  const { RUTA_API, ErrorDeApi, solicitar } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  const SEGUNDOS_DE_BLOQUEO = 600;
  const PREFIJO_ALMACEN_DEMO = "aramacao-demo-bloqueo:";
  const MINUTOS_CIERRE_VENTA = 20;

  /* Sala 1 (la única): filas A–H, 14 butacas cada una, pasillo tras la 7. */
  const FILAS_SALA_1 = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const BUTACAS_POR_FILA = 14;
  const ASIENTO_ANTES_DEL_PASILLO = 7;

  const rutas = Object.freeze({
    disponibilidad: (funcionId) => `${RUTA_API}/cartelera/funciones/${encodeURIComponent(funcionId)}/asientos/`,
    crearBloqueo: () => `${RUTA_API}/compras/bloqueos/`,
    liberarBloqueo: (bloqueoId) => `${RUTA_API}/compras/bloqueos/${encodeURIComponent(bloqueoId)}/`,
  });

  class SeatApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "SeatApiError";
    }
  }

  function enviar(url, opciones = {}) {
    return solicitar(url, { ...opciones, ErrorApi: SeatApiError });
  }

  // -------------------------------------------------------------------
  // Interfaz pública
  // -------------------------------------------------------------------

  async function consultarDisponibilidad(funcionId, contexto = {}) {
    exigirFuncion(funcionId);
    if (Util.esVistaLocal()) return armarDisponibilidadDemo(funcionId, contexto);
    return enviar(rutas.disponibilidad(funcionId));
  }

  async function crearBloqueo(funcionId, asientos, contexto = {}) {
    exigirFuncion(funcionId);

    const asientosNormalizados = normalizarAsientos(asientos);
    if (!asientosNormalizados.length) {
      throw new SeatApiError("Selecciona al menos un asiento.", 400, "ERROR_VALIDACION", {
        asientos: ["Selecciona al menos un asiento."],
      });
    }

    if (Util.esVistaLocal()) return crearBloqueoDemo(funcionId, asientosNormalizados, contexto);
    return enviar(rutas.crearBloqueo(), {
      method: "POST",
      body: JSON.stringify({ funcion_id: funcionId, asientos: asientosNormalizados }),
    });
  }

  async function liberarBloqueo(bloqueoId) {
    if (!bloqueoId) return;
    if (Util.esVistaLocal()) {
      borrarBloqueoDemo(bloqueoId);
      return { liberado: true };
    }
    return enviar(rutas.liberarBloqueo(bloqueoId), { method: "DELETE" });
  }

  // -------------------------------------------------------------------
  // Validaciones
  // -------------------------------------------------------------------

  function exigirFuncion(funcionId) {
    if (!funcionId) throw new SeatApiError("Selecciona una función.", 400, "FUNCION_REQUERIDA");
  }

  function normalizarAsientos(asientos) {
    const lista = Array.isArray(asientos) ? asientos : [];
    return [...new Set(
      lista.map((asiento) => String(asiento || "").trim().toUpperCase()).filter(Boolean)
    )].sort(Util.compararAsientos);
  }

  function esAsientoDeSala1(asiento) {
    const partes = /^([A-H])(\d{1,2})$/.exec(asiento);
    if (!partes) return false;
    const butaca = Number(partes[2]);
    return butaca >= 1 && butaca <= BUTACAS_POR_FILA;
  }

  // -------------------------------------------------------------------
  // Vista local: bloqueo simulado en sessionStorage
  // -------------------------------------------------------------------

  function armarDisponibilidadDemo(funcionId, contexto) {
    const miBloqueo = leerBloqueoDemo(funcionId);
    /* Los asientos ya vendidos vienen del almacén de ventas de demostración,
       así Compra y Taquilla no se pisan entre ellas. */
    const vendidos = global.AramacaoSalesApi?.obtenerEstadosAsientosDemo(funcionId)
      || { reservados: [], ocupados: [] };

    const inicio = armarFechaHoraHonduras(contexto.fecha, contexto.hora);
    const cierreDeVenta = new Date(inicio.getTime() + MINUTOS_CIERRE_VENTA * 60 * 1000);

    return {
      funcion_id: funcionId,
      hora_inicio: aIsoHonduras(inicio),
      venta_hasta: aIsoHonduras(cierreDeVenta),
      venta_disponible: true,
      bloqueo_temporal_segundos: SEGUNDOS_DE_BLOQUEO,
      sala: {
        nombre: "Sala 1",
        aforo_total: FILAS_SALA_1.length * BUTACAS_POR_FILA,
        pasillo_despues_del_asiento: ASIENTO_ANTES_DEL_PASILLO,
        distribucion: armarDistribucionSala1(),
      },
      /* Asientos fijos de ejemplo, para ver los tres estados en pantalla. */
      asientos_bloqueados_temporalmente: ["B8", "B9"],
      asientos_reservados: [...new Set(["C1", "C2", ...vendidos.reservados])],
      asientos_ocupados: [...new Set(["D1", ...vendidos.ocupados])],
      mi_bloqueo: miBloqueo,
    };
  }

  function armarDistribucionSala1() {
    return FILAS_SALA_1.map((fila) => ({
      fila,
      asientos: Array.from({ length: BUTACAS_POR_FILA }, (_, indice) => indice + 1),
    }));
  }

  function crearBloqueoDemo(funcionId, asientos, contexto) {
    const disponibilidad = armarDisponibilidadDemo(funcionId, contexto);
    const noDisponibles = new Set([
      ...disponibilidad.asientos_bloqueados_temporalmente,
      ...disponibilidad.asientos_reservados,
      ...disponibilidad.asientos_ocupados,
    ]);

    const asientoInvalido = asientos.find((asiento) => !esAsientoDeSala1(asiento));
    if (asientoInvalido) {
      throw new SeatApiError(
        `El asiento ${asientoInvalido} no pertenece a Sala 1.`,
        400,
        "ASIENTO_INVALIDO",
        { asientos: [asientoInvalido] }
      );
    }

    const asientoTomado = asientos.find((asiento) => noDisponibles.has(asiento));
    if (asientoTomado) {
      throw new SeatApiError(
        `El asiento ${asientoTomado} ya no está disponible.`,
        409,
        "ASIENTO_NO_DISPONIBLE",
        { asientos: [asientoTomado] }
      );
    }

    const creadoEn = new Date();
    const expiraEn = new Date(creadoEn.getTime() + SEGUNDOS_DE_BLOQUEO * 1000);
    const bloqueo = {
      id: Util.crearId(),
      funcion_id: funcionId,
      asientos,
      estado: "ACTIVO",
      creado_en: aIsoHonduras(creadoEn),
      expira_en: aIsoHonduras(expiraEn),
      segundos_restantes: SEGUNDOS_DE_BLOQUEO,
    };

    global.sessionStorage.setItem(claveDemo(funcionId), JSON.stringify(bloqueo));
    return structuredClone(bloqueo);
  }

  function leerBloqueoDemo(funcionId) {
    const guardado = global.sessionStorage.getItem(claveDemo(funcionId));
    if (!guardado) return null;

    try {
      const bloqueo = JSON.parse(guardado);
      const restantes = segundosHasta(bloqueo.expira_en);
      if (restantes <= 0) {
        global.sessionStorage.removeItem(claveDemo(funcionId));
        return null;
      }
      return { ...bloqueo, segundos_restantes: restantes };
    } catch {
      global.sessionStorage.removeItem(claveDemo(funcionId));
      return null;
    }
  }

  function borrarBloqueoDemo(bloqueoId) {
    for (let indice = global.sessionStorage.length - 1; indice >= 0; indice -= 1) {
      const clave = global.sessionStorage.key(indice);
      if (!clave?.startsWith(PREFIJO_ALMACEN_DEMO)) continue;
      try {
        const bloqueo = JSON.parse(global.sessionStorage.getItem(clave));
        if (bloqueo?.id === bloqueoId) global.sessionStorage.removeItem(clave);
      } catch {
        global.sessionStorage.removeItem(clave);
      }
    }
  }

  function claveDemo(funcionId) {
    return `${PREFIJO_ALMACEN_DEMO}${funcionId}`;
  }

  function segundosHasta(valor) {
    const fecha = new Date(valor || "");
    if (Number.isNaN(fecha.getTime())) return 0;
    return Math.max(0, Math.ceil((fecha.getTime() - Date.now()) / 1000));
  }

  /* Honduras no cambia de hora en el año, por eso se fija el desfase -06:00. */
  function armarFechaHoraHonduras(fecha, hora) {
    const fechaSegura = Util.esFechaIso(fecha) ? fecha : Util.aFechaIso(new Date());
    const horaSegura = /^\d{2}:\d{2}$/.test(String(hora || "")) ? hora : "19:00";
    return new Date(`${fechaSegura}T${horaSegura}:00-06:00`);
  }

  function aIsoHonduras(fecha) {
    const desplazada = new Date(fecha.getTime() - 6 * 60 * 60 * 1000);
    return `${desplazada.toISOString().slice(0, 19)}-06:00`;
  }

  global.AramacaoSeatApi = Object.freeze({
    consultarDisponibilidad,
    crearBloqueo,
    liberarBloqueo,
    esVistaLocal: Util.esVistaLocal,
    SeatApiError,
  });
})(window);
