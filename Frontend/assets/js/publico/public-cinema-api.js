"use strict";

/*
 * CONSULTAS PÚBLICAS DEL CINE
 * --------------------------
 * Este archivo reúne las direcciones que usará Django. Así, cada página
 * solicita solamente la información que necesita y las rutas no quedan
 * repetidas en varios archivos.
 *
 * Mientras el backend termina estos endpoints, USAR_BACKEND permanece en
 * false y las vistas continúan funcionando con los datos de demostración.
 */
window.CinemaPublicApi = (() => {
  const USAR_BACKEND = false;

  const RUTAS = {
    inicio: "/api/pelicula/inicio/",
    cartelera: "/api/pelicula/cartelera/",
    proximamente: "/api/pelicula/proximamente/",
  };

  let datosDemoPendientes = null;

  async function cargarInicio(datosDemoUrl) {
    if (!USAR_BACKEND) {
      const datos = await cargarDatosDemo(datosDemoUrl);

      return {
        peliculas: datos.movies.filter((pelicula) =>
          pelicula.status === "cartelera" &&
          pelicula.featured &&
          pelicula.active !== false
        ),
        promocion: datos.promotion || null,
      };
    }

    const respuesta = await consultar(RUTAS.inicio);

    return {
      peliculas: adaptarPeliculas(respuesta.peliculas_destacadas),
      promocion: adaptarPromocion(respuesta.promocion_activa),
    };
  }

  async function cargarCartelera(datosDemoUrl, fecha) {
    if (!USAR_BACKEND) {
      const datos = await cargarDatosDemo(datosDemoUrl);
      const peliculas = datos.movies
        .filter((pelicula) => pelicula.status === "cartelera" && pelicula.active !== false)
        .map((pelicula) => ({
          ...pelicula,
          funciones: (pelicula.funciones || []).filter((funcion) => funcion.fecha === fecha),
        }));

      return {
        fecha,
        peliculas,
        promocion: datos.promotion || null,
      };
    }

    const parametros = new URLSearchParams({ fecha });
    const respuesta = await consultar(`${RUTAS.cartelera}?${parametros}`);

    return {
      fecha: respuesta.fecha,
      peliculas: adaptarPeliculas(respuesta.peliculas),
      promocion: adaptarPromocion(respuesta.promocion_activa),
    };
  }

  async function cargarProximamente(datosDemoUrl) {
    if (!USAR_BACKEND) {
      const datos = await cargarDatosDemo(datosDemoUrl);

      return {
        peliculas: datos.movies.filter((pelicula) =>
          pelicula.status === "proximamente" && pelicula.active !== false
        ),
      };
    }

    const respuesta = await consultar(RUTAS.proximamente);
    return { peliculas: adaptarPeliculas(respuesta.peliculas) };
  }

  async function consultar(ruta) {
    const respuesta = await fetch(ruta, {
      headers: { Accept: "application/json" },
    });

    if (!respuesta.ok) {
      throw new Error(`La consulta ${ruta} respondió con estado ${respuesta.status}.`);
    }

    return respuesta.json();
  }

  function cargarDatosDemo(datosDemoUrl) {
    if (!datosDemoPendientes) {
      datosDemoPendientes = window.CinemaStore.getData(datosDemoUrl);
    }

    return datosDemoPendientes;
  }

  function adaptarPeliculas(peliculas) {
    return Array.isArray(peliculas) ? peliculas.map(adaptarPelicula) : [];
  }

  function adaptarPelicula(pelicula) {
    return {
      id: String(pelicula.id),
      title: pelicula.titulo || "Película sin título",
      heroLabel: pelicula.etiqueta_inicio || "",
      shortSynopsis: pelicula.descripcion_breve || pelicula.sinopsis || "",
      fullSynopsis: pelicula.sinopsis || "",
      durationMinutes: Number(pelicula.duracion) || 0,
      classification: pelicula.clasificacion?.nombre || "Por confirmar",
      genres: obtenerNombres(pelicula.generos),
      language: obtenerNombres(pelicula.idiomas).join(" / ") || "Por confirmar",
      director: obtenerNombres(pelicula.directores).join(", ") || "Por confirmar",
      cast: obtenerNombres(pelicula.actores),
      /* El backend envía EstadoCartelera como número (1 ESTRENADA,
         2 CARTELERA, 3 PROXIMAMENTE). La tabla está en utilidades.js. */
      status: window.AramacaoUtil.estadoCarteleraDesdeBackend(pelicula.estado ?? pelicula.seccion),
      featured: pelicula.destacada_inicio === true,
      active: pelicula.activa !== false,
      trailerUrl: pelicula.trailer_url || "",
      posterImage: pelicula.poster_url || "",
      bannerImage: pelicula.banner_url || "",
      accent: pelicula.color_acento || "#0877d1",
      releaseDate: pelicula.fecha_estreno || "",
      funciones: adaptarFunciones(pelicula.funciones),
    };
  }

  function adaptarFunciones(funciones) {
    if (!Array.isArray(funciones)) return [];

    return funciones.map((funcion) => ({
      id: String(funcion.id),
      fecha: funcion.fecha,
      hora: funcion.hora_inicio,
      sala: funcion.sala || "Sala 1",
      formato: funcion.formato || "2D",
      precio: Number(funcion.precio) || 0,
      promotion: funcion.promocion_2x1?.aplica === true,
    }));
  }

  /* El contrato (docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md) envía los días
     como texto ("LUNES", "MARTES", "MIERCOLES"); aquí se convierten al número
     de Date.getDay() que ya usa todo el frontend (Inicio, Taquilla, Compra). */
  const NUMERO_DE_DIA = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6 };

  function adaptarPromocion(promocion) {
    if (!promocion) return null;

    return {
      enabled: promocion.activa === true,
      movieIds: (promocion.peliculas_ids || []).map(String),
      startDate: promocion.fecha_inicial || "",
      endDate: promocion.fecha_final || "",
      allowedWeekdays: (promocion.dias_semana || []).map((dia) => NUMERO_DE_DIA[dia]).filter((numero) => numero !== undefined),
      appliesTo: promocion.aplica_en === "FUNCIONES_ESPECIFICAS" ? "especificas" : "todas",
      functionIds: (promocion.funciones_ids || []).map(String),
      description: promocion.condiciones_visibles || "",
    };
  }

  function obtenerNombres(elementos) {
    if (!Array.isArray(elementos)) return [];

    return elementos
      .map((elemento) => elemento?.nombre_completo || elemento?.nombre || "")
      .filter(Boolean);
  }

  return {
    cargarInicio,
    cargarCartelera,
    cargarProximamente,
  };
})();
