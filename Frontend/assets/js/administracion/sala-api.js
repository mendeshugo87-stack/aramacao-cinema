"use strict";

/*
 * ASIENTOS DE LA SALA (FUERA DE SERVICIO)
 * ---------------------------------------
 * Un asiento roto es algo FÍSICO de la sala, no de una película ni de una
 * función: si la butaca F7 está quebrada, lo está para todas las funciones
 * hasta que alguien la repare. Por eso se guarda una sola vez aquí y no
 * dentro de cada película.
 *
 * Lo usa el panel "Sala" de Administración. Compra en línea y Taquilla lo
 * reciben a través de compartido/seat-api.js, que añade la lista a la
 * disponibilidad de cada función.
 *
 * PENDIENTE CON EL BACKEND: estas dos rutas todavía NO existen en Django.
 * Están propuestas en docs/PROPUESTA_SALA_ASIENTOS.md para que el equipo de
 * backend las confirme. Mientras tanto la vista local guarda en el mismo
 * almacén de demostración que el resto del panel.
 *
 *   GET   /api/sala/asientos/           → estado de las 112 butacas
 *   PATCH /api/sala/asientos/{codigo}/  → { fuera_de_servicio, motivo }
 */
window.SalaApi = (() => {
  const { RUTA_API, ErrorDeApi, solicitar } = window.AramacaoApiCliente;
  const Util = window.AramacaoUtil;

  const DATA_URL = "../../assets/data/cartelera.json";
  const API_ROOT = `${RUTA_API}/sala`;

  /* La Sala 1 es la única del cine. Debe coincidir con seat-api.js. */
  const FILAS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const BUTACAS_POR_FILA = 14;
  const ASIENTO_ANTES_DEL_PASILLO = 7;
  const MOTIVO_MINIMO = 5;

  class SalaApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "SalaApiError";
    }
  }

  function enviar(url, opciones = {}) {
    return solicitar(url, { ...opciones, ErrorApi: SalaApiError });
  }

  async function cargarDatos() {
    return window.CinemaStore.getData(DATA_URL);
  }

  // ---------------------------------------------------------------------
  // Consulta
  // ---------------------------------------------------------------------

  async function obtenerSala() {
    if (Util.esVistaLocal()) {
      const datos = await cargarDatos();
      return armarSala(leerFueraDeServicio(datos));
    }
    const respuesta = await enviar(`${API_ROOT}/asientos/`);
    return armarSala(respuesta?.asientos_fuera_de_servicio || []);
  }

  function armarSala(fueraDeServicio) {
    const porCodigo = new Map(fueraDeServicio.map((item) => [item.codigo, item]));
    return {
      nombre: "Sala 1",
      aforo_fisico: FILAS.length * BUTACAS_POR_FILA,
      aforo_disponible: (FILAS.length * BUTACAS_POR_FILA) - porCodigo.size,
      pasillo_despues_del_asiento: ASIENTO_ANTES_DEL_PASILLO,
      distribucion: FILAS.map((fila) => ({
        fila,
        asientos: Array.from({ length: BUTACAS_POR_FILA }, (_, indice) => {
          const codigo = `${fila}${indice + 1}`;
          const averiado = porCodigo.get(codigo);
          return {
            codigo,
            numero: indice + 1,
            fuera_de_servicio: Boolean(averiado),
            motivo: averiado?.motivo || "",
            marcado_en: averiado?.marcado_en || "",
          };
        }),
      })),
      asientos_fuera_de_servicio: fueraDeServicio.map((item) => item.codigo),
    };
  }

  // ---------------------------------------------------------------------
  // Cambios
  // ---------------------------------------------------------------------

  async function marcarFueraDeServicio(codigo, motivo) {
    validarCodigo(codigo);
    validarMotivo(motivo);
    return guardarEstado(codigo, { fuera_de_servicio: true, motivo: String(motivo).trim() });
  }

  async function reactivarAsiento(codigo) {
    validarCodigo(codigo);
    return guardarEstado(codigo, { fuera_de_servicio: false, motivo: "" });
  }

  async function guardarEstado(codigo, cambios) {
    if (Util.esVistaLocal()) {
      const datos = await cargarDatos();
      const lista = leerFueraDeServicio(datos).filter((item) => item.codigo !== codigo);

      if (cambios.fuera_de_servicio) {
        lista.push({ codigo, motivo: cambios.motivo, marcado_en: new Date().toISOString() });
      }

      datos.sala = { ...(datos.sala || {}), asientos_fuera_de_servicio: lista };
      await window.CinemaStore.saveData(datos);

      return {
        asiento: { codigo, ...cambios },
        funciones_afectadas: contarFuncionesAfectadas(codigo),
      };
    }

    return enviar(`${API_ROOT}/asientos/${encodeURIComponent(codigo)}/`, {
      method: "PATCH",
      body: JSON.stringify(cambios),
    });
  }

  /*
   * Cuántas funciones futuras ya tienen vendido ese asiento. Marcar una butaca
   * rota NO invalida boletos ya emitidos: el asiento deja de venderse, pero
   * quien ya pagó conserva el suyo hasta que se le reubique. Este número es lo
   * que el panel le muestra al administrador para que lo sepa antes de marcar.
   *
   * En vista local se cuenta con el almacén de ventas de demostración. Con
   * Django el número vendrá en la respuesta del PATCH.
   */
  function contarFuncionesAfectadas(codigo) {
    const ventas = window.AramacaoVentasDemo;
    if (!ventas?.contarBoletosFuturosDeAsiento) return 0;
    return ventas.contarBoletosFuturosDeAsiento(codigo);
  }

  // ---------------------------------------------------------------------
  // Apoyos
  // ---------------------------------------------------------------------

  function leerFueraDeServicio(datos) {
    const lista = datos?.sala?.asientos_fuera_de_servicio;
    return Array.isArray(lista) ? lista : [];
  }

  function validarCodigo(codigo) {
    if (!/^[A-H](?:[1-9]|1[0-4])$/.test(String(codigo || ""))) {
      throw new SalaApiError(
        `El asiento ${codigo} no pertenece a Sala 1.`,
        400,
        "ASIENTO_INVALIDO"
      );
    }
  }

  function validarMotivo(motivo) {
    if (String(motivo || "").trim().length < MOTIVO_MINIMO) {
      throw new SalaApiError(
        "Escribe por qué el asiento sale de servicio (mínimo 5 caracteres).",
        400,
        "MOTIVO_REQUERIDO",
        { motivo: ["Escribe el motivo, por ejemplo: respaldo quebrado."] }
      );
    }
  }

  return {
    obtenerSala,
    marcarFueraDeServicio,
    reactivarAsiento,
    esVistaLocal: Util.esVistaLocal,
    SalaApiError,
  };
})();
