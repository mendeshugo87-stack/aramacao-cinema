"use strict";

/*
 * ENDPOINT 2 DE 2: FUNCIÓN Y PROMOCIÓN 2X1
 * -----------------------------------------
 * Crear, editar y quitar horarios de una película, y configurar el 2x1.
 * Se separó de peliculas-api.js a propósito: cuando exista Django, guardar
 * el título de una película no debe obligar a reenviar todas sus funciones,
 * y activar la promoción tampoco debe pasar por el formulario de la película.
 *
 * Contrato de referencia: docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md
 * (POST /administracion/peliculas/{id}/funciones/, PATCH/DELETE
 * /administracion/funciones/{id}/, GET/PUT /administracion/promociones/2x1/).
 */
window.FuncionesApi = (() => {
  const { ErrorDeApi, solicitar: enviarPeticion } = window.AramacaoApiCliente;
  const Util = window.AramacaoUtil;

  const DATA_URL = "../../assets/data/cartelera.json";
  /* Sin versión en la ruta: el backend pidió /api/... en lugar de /api/v1/... */
  const API_ROOT = "/api/administracion";

  class FuncionesApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "FuncionesApiError";
    }
  }

  const isLocalPreview = Util.esVistaLocal;

  async function cargarDatos() {
    return window.CinemaStore.getData(DATA_URL);
  }

  async function guardarDatos(datos) {
    return window.CinemaStore.saveData(datos);
  }

  // ---------------------------------------------------------------------
  // Funciones
  // ---------------------------------------------------------------------

  async function obtenerFunciones(peliculaId) {
    const datos = await cargarDatos();
    const pelicula = datos.movies.find((item) => item.id === peliculaId);
    return { resultados: pelicula?.funciones || [] };
  }

  async function crearFuncion(peliculaId, funcion) {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      const pelicula = datos.movies.find((item) => item.id === peliculaId);
      if (!pelicula) throw new FuncionesApiError("No se encontró la película.", 404, "RECURSO_NO_ENCONTRADO");

      validarCruceDeSala(datos.movies, pelicula, funcion);
      pelicula.funciones = pelicula.funciones || [];
      pelicula.funciones.push(funcion);
      await guardarDatos(datos);
      return { funcion };
    }
    return solicitar(`${API_ROOT}/peliculas/${encodeURIComponent(peliculaId)}/funciones/`, {
      method: "POST",
      body: JSON.stringify(funcion),
    });
  }

  async function actualizarFuncion(funcionId, cambios) {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      const { pelicula, funcion } = localizarFuncion(datos, funcionId);
      const propuesta = { ...funcion, ...cambios };
      validarCruceDeSala(datos.movies, pelicula, propuesta, funcionId);
      Object.assign(funcion, cambios);
      await guardarDatos(datos);
      return { funcion };
    }
    return solicitar(`${API_ROOT}/funciones/${encodeURIComponent(funcionId)}/`, {
      method: "PATCH",
      body: JSON.stringify(cambios),
    });
  }

  async function eliminarFuncion(funcionId) {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      const { pelicula } = localizarFuncion(datos, funcionId);
      pelicula.funciones = pelicula.funciones.filter((item) => item.id !== funcionId);
      await guardarDatos(datos);
      return null;
    }
    return solicitar(`${API_ROOT}/funciones/${encodeURIComponent(funcionId)}/`, { method: "DELETE" });
  }

  function localizarFuncion(datos, funcionId) {
    for (const pelicula of datos.movies) {
      const funcion = (pelicula.funciones || []).find((item) => item.id === funcionId);
      if (funcion) return { pelicula, funcion };
    }
    throw new FuncionesApiError("No se encontró la función.", 404, "RECURSO_NO_ENCONTRADO");
  }

  /* La Sala 1 es única: ninguna función puede cruzarse con otra ya publicada. */
  function validarCruceDeSala(movies, peliculaActual, funcionPropuesta, excluirFuncionId = null) {
    const duracionActual = Number(peliculaActual.durationMinutes) || 0;
    const inicioPropuesto = minutosDeHora(funcionPropuesta.hora);

    for (const pelicula of movies) {
      for (const funcion of pelicula.funciones || []) {
        if (funcion.id === excluirFuncionId) continue;
        if (funcion.fecha !== funcionPropuesta.fecha) continue;

        const inicioExistente = minutosDeHora(funcion.hora);
        const duracionExistente = Number(pelicula.durationMinutes) || 0;
        const seCruzan =
          inicioPropuesto < inicioExistente + duracionExistente &&
          inicioExistente < inicioPropuesto + duracionActual;

        if (seCruzan) {
          throw new FuncionesApiError(
            `La Sala 1 ya tiene una función de ${pelicula.title} el ${funcion.fecha} a las ${funcion.hora}.`,
            400,
            "CRUCE_HORARIO_SALA",
            { hora: ["Selecciona una hora que no se cruce con otra función."] }
          );
        }
      }
    }
  }

  function minutosDeHora(valor) {
    const [hora, minuto] = String(valor || "0:0").split(":").map(Number);
    return (hora || 0) * 60 + (minuto || 0);
  }

  // ---------------------------------------------------------------------
  // Promoción 2x1 — solo Administración la configura (regla de negocio)
  // ---------------------------------------------------------------------

  async function obtenerPromocion() {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      return { promocion: datos.promotion || crearPromocionVacia() };
    }
    const respuesta = await solicitar(`${API_ROOT}/promociones/2x1/`);
    return { promocion: deContratoPromocion(respuesta) };
  }

  /*
   * El administrador solo controla "activa" y "días permitidos" desde las
   * pastillas del editor de funciones (no hay selector de películas ni de
   * fechas). Qué películas y funciones participan se calcula aquí mismo,
   * revisando cuáles funciones ya están marcadas con "Aplicar 2x1" — así el
   * contrato con Django (que sí pide peliculas_ids y funciones_ids) queda
   * completo sin pedirle ese trabajo extra al administrador.
   */
  async function guardarPromocion(cambios) {
    validarPromocion(cambios);
    const datos = await cargarDatos();
    const alcance = derivarAlcancePromocion(datos.movies);
    const promocion = { ...crearPromocionVacia(), ...cambios, ...alcance };

    if (isLocalPreview()) {
      datos.promotion = promocion;
      await guardarDatos(datos);
      return { promocion };
    }
    const respuesta = await solicitar(`${API_ROOT}/promociones/2x1/`, {
      method: "PUT",
      body: JSON.stringify(aContratoPromocion(promocion)),
    });
    return { promocion: deContratoPromocion(respuesta) };
  }

  function derivarAlcancePromocion(movies) {
    const movieIds = [];
    const functionIds = [];
    const fechas = [];
    (movies || []).forEach((pelicula) => {
      let participa = false;
      (pelicula.funciones || []).forEach((funcion) => {
        if (funcion.promotion !== true) return;
        functionIds.push(funcion.id);
        fechas.push(funcion.fecha);
        participa = true;
      });
      if (participa) movieIds.push(pelicula.id);
    });
    fechas.sort();
    return {
      /* La promocion esta activa cuando al menos una funcion la usa. Se deriva
         en vez de recibirse para que nunca se envie al backend un 2x1 con
         "activa: true" y ninguna funcion, ni al reves. */
      enabled: functionIds.length > 0,
      movieIds,
      functionIds,
      appliesTo: "especificas",
      startDate: fechas[0] || "",
      endDate: fechas[fechas.length - 1] || "",
    };
  }

  /* Traducción con el contrato documentado (docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md):
     el backend habla en español con nombres de días en texto; el frontend
     trabaja internamente con números de Date.getDay() en las demás áreas. */
  const TEXTO_DE_DIA = { 0: "DOMINGO", 1: "LUNES", 2: "MARTES", 3: "MIERCOLES", 4: "JUEVES", 5: "VIERNES", 6: "SABADO" };
  const NUMERO_DE_DIA = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6 };

  function aContratoPromocion(promocion) {
    return {
      activa: promocion.enabled,
      peliculas_ids: promocion.movieIds || [],
      fecha_inicial: promocion.startDate || "",
      fecha_final: promocion.endDate || "",
      dias_semana: (promocion.allowedWeekdays || []).map((dia) => TEXTO_DE_DIA[dia]).filter(Boolean),
      aplica_en: promocion.appliesTo === "especificas" ? "FUNCIONES_ESPECIFICAS" : "TODAS_LAS_FUNCIONES",
      funciones_ids: promocion.functionIds || [],
      condiciones_visibles: promocion.description || "",
    };
  }

  function deContratoPromocion(datos) {
    return {
      enabled: datos.activa === true,
      movieIds: (datos.peliculas_ids || []).map(String),
      startDate: datos.fecha_inicial || "",
      endDate: datos.fecha_final || "",
      allowedWeekdays: (datos.dias_semana || []).map((dia) => NUMERO_DE_DIA[dia]).filter((numero) => numero !== undefined),
      appliesTo: datos.aplica_en === "FUNCIONES_ESPECIFICAS" ? "especificas" : "todas",
      functionIds: (datos.funciones_ids || []).map(String),
      description: datos.condiciones_visibles || "",
    };
  }

  function validarPromocion(promocion) {
    if (!promocion.enabled) return;
    const dias = promocion.allowedWeekdays || [];
    if (!dias.length || dias.some((dia) => ![1, 2, 3].includes(dia))) {
      throw new FuncionesApiError(
        "El 2x1 solo admite lunes, martes y miércoles.",
        400,
        "PROMOCION_INVALIDA",
        { dias_semana: ["Selecciona al menos un día entre lunes, martes y miércoles."] }
      );
    }
  }

  function crearPromocionVacia() {
    return {
      enabled: false, movieIds: [], startDate: "", endDate: "",
      allowedWeekdays: [1, 2, 3], appliesTo: "todas", functionIds: [], description: "",
    };
  }

  // ---------------------------------------------------------------------
  // Comunicación real (cuando exista Django)
  // ---------------------------------------------------------------------

  /* El envío (fetch, CSRF, lectura de JSON, formato de error) está en
     compartido/api-cliente.js. Aquí solo se indica la clase de error. */
  function solicitar(ruta, opciones = {}) {
    return enviarPeticion(ruta, { ...opciones, ErrorApi: FuncionesApiError });
  }

  return {
    obtenerFunciones,
    crearFuncion,
    actualizarFuncion,
    eliminarFuncion,
    obtenerPromocion,
    guardarPromocion,
    esVistaLocal: isLocalPreview,
    FuncionesApiError,
  };
})();
