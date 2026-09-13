"use strict";

/*
 * ENDPOINT 1 DE 2: PELÍCULA
 * -------------------------
 * Todo lo que describe la ficha de una película (título, sinopsis, catálogos,
 * imágenes, estado de publicación). Las funciones (horarios) NO viven aquí:
 * esas llamadas están en funciones-api.js para que Django pueda exponerlas
 * como un recurso aparte, tal como ya quedó documentado en
 * docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md.
 *
 * Mientras no exista Django, cada función demuestra su resultado con
 * CinemaStore (IndexedDB local). El bloque marcado "backend real" ya está
 * escrito contra el contrato documentado; solo falta que exista el servidor.
 */
window.PeliculasApi = (() => {
  const { ErrorDeApi, solicitar: enviarPeticion } = window.AramacaoApiCliente;
  const Util = window.AramacaoUtil;

  const DATA_URL = "../../assets/data/cartelera.json";
  /* Sin versión en la ruta: el backend pidió /api/... en lugar de /api/v1/... */
  const API_ROOT = "/api/administracion";

  class PeliculasApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "PeliculasApiError";
    }
  }

  const isLocalPreview = Util.esVistaLocal;

  async function cargarDatos() {
    return window.CinemaStore.getData(DATA_URL);
  }

  async function guardarDatos(datos) {
    return window.CinemaStore.saveData(datos);
  }

  async function restablecerDatosDemo() {
    return window.CinemaStore.resetData(DATA_URL);
  }

  // ---------------------------------------------------------------------
  // Películas
  // ---------------------------------------------------------------------

  /*
   * TRADUCCIÓN DEL ESTADO
   * ---------------------
   * Lo único que el backend ya confirmó de la ficha es EstadoCartelera, que
   * viaja como número. Dentro del frontend la película sigue teniendo
   * `status: "cartelera" | "proximamente"`, así que el panel, los filtros y
   * las tarjetas no cambian. Cuando el backend confirme el nombre del resto
   * de sus campos, la traducción completa se agrega en estas dos funciones.
   */
  function aContratoPelicula(pelicula) {
    if (!pelicula || !("status" in pelicula)) return pelicula;

    const { status, ...resto } = pelicula;
    return { ...resto, estado: Util.estadoCarteleraParaBackend(status) };
  }

  function deContratoPelicula(pelicula) {
    if (!pelicula) return pelicula;

    return {
      ...pelicula,
      status: Util.estadoCarteleraDesdeBackend(pelicula.estado ?? pelicula.status),
    };
  }

  async function obtenerPeliculas() {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      return { resultados: datos.movies || [] };
    }
    const respuesta = await solicitar(`${API_ROOT}/peliculas/`);
    return { ...respuesta, resultados: (respuesta?.resultados || []).map(deContratoPelicula) };
  }

  async function crearPelicula(pelicula) {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      datos.movies.unshift(pelicula);
      await guardarDatos(datos);
      return { pelicula };
    }
    return solicitar(`${API_ROOT}/peliculas/`, {
      method: "POST",
      body: JSON.stringify(aContratoPelicula(pelicula)),
    });
  }

  async function actualizarPelicula(peliculaId, cambios) {
    if (isLocalPreview()) {
      const datos = await cargarDatos();
      const pelicula = datos.movies.find((item) => item.id === peliculaId);
      if (!pelicula) throw new PeliculasApiError("No se encontró la película.", 404, "RECURSO_NO_ENCONTRADO");
      Object.assign(pelicula, cambios);
      await guardarDatos(datos);
      return { pelicula };
    }
    return solicitar(`${API_ROOT}/peliculas/${encodeURIComponent(peliculaId)}/`, {
      method: "PATCH",
      body: JSON.stringify(aContratoPelicula(cambios)),
    });
  }

  async function cambiarEstadoPelicula(peliculaId, estado) {
    return actualizarPelicula(peliculaId, estado);
  }

  async function guardarImagenesPelicula(peliculaId, imagenes) {
    if (isLocalPreview()) {
      return actualizarPelicula(peliculaId, {
        posterImage: imagenes.posterImage,
        bannerImage: imagenes.bannerImage,
        bannerVisibility: imagenes.bannerVisibility,
      });
    }
    const formData = new FormData();
    if (imagenes.poster) formData.append("poster", imagenes.poster);
    if (imagenes.fondoInicio) formData.append("fondo_inicio", imagenes.fondoInicio);
    if (imagenes.posterEncuadre) formData.append("poster_encuadre", JSON.stringify(imagenes.posterEncuadre));
    if (imagenes.fondoEncuadre) formData.append("fondo_encuadre", JSON.stringify(imagenes.fondoEncuadre));
    formData.append("visibilidad_fondo_porcentaje", String(imagenes.bannerVisibility));
    /* FormData: el cliente compartido detecta que no debe poner Content-Type. */
    return solicitar(`${API_ROOT}/peliculas/${encodeURIComponent(peliculaId)}/imagenes/`, {
      method: "POST",
      body: formData,
    });
  }

  // ---------------------------------------------------------------------
  // Catálogos: géneros, idiomas, clasificaciones, directores, actores
  // ---------------------------------------------------------------------

  async function obtenerCatalogos() {
    const datos = await cargarDatos();
    return {
      generos: datos.genres || [],
      idiomas: datos.languages || [],
      clasificaciones: datos.classifications || [],
      directores: datos.directors || [],
      actores: datos.actors || [],
    };
  }

  async function crearDirector(persona) {
    return crearPersona("directors", persona);
  }

  async function crearActor(persona) {
    return crearPersona("actors", persona);
  }

  async function crearPersona(catalogo, persona) {
    const datos = await cargarDatos();
    const lista = datos[catalogo];
    const siguienteId = lista.reduce((mayor, item) => Math.max(mayor, Number(item.id) || 0), 0) + 1;
    const nuevaPersona = { id: siguienteId, active: true, ...persona };
    lista.push(nuevaPersona);
    await guardarDatos(datos);
    return { persona: nuevaPersona };
  }

  // ---------------------------------------------------------------------
  // Comunicación real (cuando exista Django)
  // ---------------------------------------------------------------------

  /* El envío (fetch, CSRF, lectura de JSON, formato de error) está en
     compartido/api-cliente.js. Aquí solo se indica la clase de error. */
  function solicitar(ruta, opciones = {}) {
    return enviarPeticion(ruta, { ...opciones, ErrorApi: PeliculasApiError });
  }

  return {
    obtenerPeliculas,
    crearPelicula,
    actualizarPelicula,
    cambiarEstadoPelicula,
    guardarImagenesPelicula,
    obtenerCatalogos,
    crearDirector,
    crearActor,
    restablecerDatosDemo,
    esVistaLocal: isLocalPreview,
    PeliculasApiError,
  };
})();
