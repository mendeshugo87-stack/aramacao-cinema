"use strict";

/*
 * CUENTAS DE CLIENTES (PÚBLICO)
 * -----------------------------
 * Único punto de contacto de las pantallas de Cuenta con el backend.
 *
 * A diferencia del personal (que usa cookie de sesión con CSRF), los clientes
 * usan JWT: Django entrega un token de acceso y uno de renovación. Por eso
 * este archivo conserva su propio `solicitar`: añade la cabecera Bearer y,
 * si el token venció, lo renueva y repite la petición una sola vez.
 * El resto (leer la respuesta, formato de error) se comparte con api-cliente.js.
 *
 * Los tokens se guardan en sessionStorage: desaparecen al cerrar la pestaña.
 * Nunca se guardan contraseñas ni el número de identidad completo.
 *
 * Contrato: docs/json/cuentas-clientes/01-autenticacion-clientes.json
 */
(function crearApiDeClientes(global) {
  const { ErrorDeApi, leerRespuesta } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  /*
   * Si algún día Django vive en otro dominio, se define
   * window.ARAMACAO_API_ORIGIN antes de cargar este archivo.
   * Sin eso se usa el mismo origen que la página, igual que las demás áreas.
   */
  const origenConfigurado = String(global.ARAMACAO_API_ORIGIN || "").replace(/\/$/, "");
  /* Sin versión en la ruta, igual que compartido/api-cliente.js. */
  const RUTA_API = `${origenConfigurado}/api`;

  const CLAVE_ACCESO = "aramacao.customer.access";
  const CLAVE_RENOVACION = "aramacao.customer.refresh";

  class CustomerApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "CustomerApiError";
    }
  }

  // -------------------------------------------------------------------
  // Petición con token
  // -------------------------------------------------------------------

  async function solicitar(ruta, opciones = {}) {
    const metodo = String(opciones.method || "GET").toUpperCase();
    const cabeceras = new Headers(opciones.headers || {});
    const necesitaToken = opciones.auth !== false;
    const puedeRenovar = opciones.retryAuth !== false;

    cabeceras.set("Accept", "application/json");
    if (opciones.body && !cabeceras.has("Content-Type")) {
      cabeceras.set("Content-Type", "application/json");
    }
    if (necesitaToken && leerTokenAcceso()) {
      cabeceras.set("Authorization", `Bearer ${leerTokenAcceso()}`);
    }

    let respuesta;
    try {
      respuesta = await fetch(`${RUTA_API}${ruta}`, {
        ...opciones,
        method: metodo,
        headers: cabeceras,
        /* JWT viaja en la cabecera, no en cookies. */
        credentials: "omit",
      });
    } catch (error) {
      throw new CustomerApiError("No fue posible comunicarse con el servidor.", 0, "ERROR_CONEXION", error);
    }

    /* Token vencido: se renueva y se reintenta una sola vez. */
    if (respuesta.status === 401 && necesitaToken && puedeRenovar && leerTokenRenovacion()) {
      await renovarTokenAcceso();
      return solicitar(ruta, { ...opciones, retryAuth: false });
    }

    const cuerpo = await leerRespuesta(respuesta);
    if (!respuesta.ok) {
      if (respuesta.status === 401 && necesitaToken) limpiarTokens();
      throw new CustomerApiError(
        cuerpo?.mensaje || cuerpo?.detalle || "La solicitud no pudo completarse.",
        respuesta.status,
        cuerpo?.codigo || cuerpo?.code || "SOLICITUD_FALLIDA",
        cuerpo?.errores || null
      );
    }
    return cuerpo;
  }

  async function renovarTokenAcceso() {
    const renovacion = leerTokenRenovacion();
    if (!renovacion) {
      limpiarTokens();
      throw sesionTerminada(401);
    }

    let respuesta;
    try {
      respuesta = await fetch(`${RUTA_API}/autenticacion/clientes/renovar-token/`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: renovacion }),
        credentials: "omit",
      });
    } catch (error) {
      throw new CustomerApiError("No fue posible renovar la sesión.", 0, "ERROR_CONEXION", error);
    }

    const cuerpo = await leerRespuesta(respuesta);
    if (!respuesta.ok || !cuerpo?.access) {
      limpiarTokens();
      throw sesionTerminada(respuesta.status || 401);
    }

    guardarTokens({ access: cuerpo.access, refresh: cuerpo.refresh || renovacion });
    return cuerpo.access;
  }

  function sesionTerminada(estado) {
    return new CustomerApiError(
      "La sesión terminó. Inicia sesión nuevamente.",
      estado,
      "AUTENTICACION_REQUERIDA",
      null
    );
  }

  // -------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------

  function guardarTokens(tokens) {
    if (tokens?.access) global.sessionStorage.setItem(CLAVE_ACCESO, tokens.access);
    if (tokens?.refresh) global.sessionStorage.setItem(CLAVE_RENOVACION, tokens.refresh);
  }

  /* Varias respuestas traen los tokens dentro; se guardan al pasar. */
  function guardarTokensDeRespuesta(respuesta) {
    if (respuesta?.tokens) guardarTokens(respuesta.tokens);
    return respuesta;
  }

  function limpiarTokens() {
    global.sessionStorage.removeItem(CLAVE_ACCESO);
    global.sessionStorage.removeItem(CLAVE_RENOVACION);
  }

  function leerTokenAcceso() {
    return global.sessionStorage.getItem(CLAVE_ACCESO) || "";
  }

  function leerTokenRenovacion() {
    return global.sessionStorage.getItem(CLAVE_RENOVACION) || "";
  }

  function armarConsulta(parametros) {
    const consulta = new URLSearchParams();
    Object.entries(parametros).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== "") {
        consulta.set(clave, String(valor));
      }
    });
    return consulta.toString();
  }

  /* Las peticiones sin sesión (crear cuenta, iniciar sesión, recuperar) no
     llevan token ni deben reintentar la renovación. */
  const SIN_SESION = { auth: false, retryAuth: false };

  global.AramacaoCustomerApi = Object.freeze({
    // --- Crear cuenta y verificar correo ---
    crearCuenta(datos) {
      return solicitar("/autenticacion/clientes/crear-cuenta/", {
        method: "POST",
        body: JSON.stringify(datos),
        ...SIN_SESION,
      });
    },

    async verificarCorreo(flujoId, codigo) {
      return guardarTokensDeRespuesta(await solicitar("/autenticacion/clientes/verificar-correo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId, codigo }),
        ...SIN_SESION,
      }));
    },

    reenviarCodigo(flujoId) {
      return solicitar("/autenticacion/clientes/reenviar-codigo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId }),
        ...SIN_SESION,
      });
    },

    // --- Sesión ---
    async iniciarSesion(identidad, contrasena) {
      return guardarTokensDeRespuesta(await solicitar("/autenticacion/clientes/iniciar-sesion/", {
        method: "POST",
        body: JSON.stringify({ identidad, contrasena }),
        ...SIN_SESION,
      }));
    },

    obtenerSesionActual() {
      return solicitar("/autenticacion/clientes/sesion-actual/");
    },

    async cerrarSesion() {
      const renovacion = leerTokenRenovacion();
      try {
        if (!renovacion) return { mensaje: "Sesión cerrada correctamente." };
        return await solicitar("/autenticacion/clientes/cerrar-sesion/", {
          method: "POST",
          body: JSON.stringify({ refresh: renovacion }),
          retryAuth: false,
        });
      } finally {
        /* La sesión local se borra aunque el servidor falle. */
        limpiarTokens();
      }
    },

    // --- Recuperar contraseña ---
    solicitarRecuperacion(identidad) {
      return solicitar("/autenticacion/clientes/solicitar-recuperacion/", {
        method: "POST",
        body: JSON.stringify({ identidad }),
        ...SIN_SESION,
      });
    },

    verificarCodigoRecuperacion(flujoId, codigo) {
      return solicitar("/autenticacion/clientes/verificar-codigo/", {
        method: "POST",
        body: JSON.stringify({ flujo_recuperacion_id: flujoId, codigo }),
        ...SIN_SESION,
      });
    },

    async restablecerContrasena(token, contrasenaNueva) {
      const respuesta = await solicitar("/autenticacion/clientes/restablecer-contrasena/", {
        method: "POST",
        body: JSON.stringify({
          token_restablecimiento: token,
          contrasena_nueva: contrasenaNueva,
        }),
        ...SIN_SESION,
      });
      /* Tras restablecer, las sesiones anteriores dejan de servir. */
      limpiarTokens();
      return respuesta;
    },

    // --- Mi cuenta ---
    obtenerMiCuenta() {
      return solicitar("/clientes/mi-cuenta/");
    },

    actualizarMiCuenta(cambios) {
      return solicitar("/clientes/mi-cuenta/", {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
    },

    cambiarContrasena(contrasenaActual, contrasenaNueva) {
      return solicitar("/clientes/mi-cuenta/cambiar-contrasena/", {
        method: "POST",
        body: JSON.stringify({
          contrasena_actual: contrasenaActual,
          contrasena_nueva: contrasenaNueva,
        }),
      });
    },

    solicitarCambioCorreo(correoNuevo, contrasenaActual) {
      return solicitar("/clientes/mi-cuenta/cambiar-correo/", {
        method: "POST",
        body: JSON.stringify({
          correo_nuevo: correoNuevo,
          contrasena_actual: contrasenaActual,
        }),
      });
    },

    verificarCambioCorreo(flujoId, codigo) {
      return solicitar("/clientes/mi-cuenta/verificar-correo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId, codigo }),
      });
    },

    // --- Historial de compras ---
    listarCompras({ pagina = 1, estado = "" } = {}) {
      const consulta = armarConsulta({ pagina, estado });
      return solicitar(`/clientes/mi-cuenta/compras/${consulta ? `?${consulta}` : ""}`);
    },

    obtenerCompra(compraId) {
      return solicitar(`/clientes/mi-cuenta/compras/${encodeURIComponent(compraId)}/`);
    },

    rutaDescargaBoleto(boletoId) {
      return `${RUTA_API}/clientes/mi-cuenta/boletos/${encodeURIComponent(boletoId)}/descargar/`;
    },

    obtenerAccessToken: leerTokenAcceso,
    limpiarSesion: limpiarTokens,

    /*
     * Antes esta función miraba una variable (ARAMACAO_USE_DEMO_API) que no se
     * definía en ninguna parte, así que siempre daba false: las pantallas de
     * Cuenta intentaban hablar con un servidor inexistente y quedaban en
     * "No fue posible comunicarse con el servidor", dejando sin uso las ramas
     * de demostración ya escritas en auth.js y customer-session.js.
     * Ahora usa la misma comprobación que las demás áreas.
     */
    esVistaLocal: Util.esVistaLocal,

    CustomerApiError,
  });
})(window);
