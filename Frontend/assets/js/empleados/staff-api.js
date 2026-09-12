"use strict";

/*
 * AUTENTICACIÓN DEL PERSONAL
 * --------------------------
 * Iniciar y cerrar sesión, saber quién está conectado y cambiar la propia
 * contraseña. Lo usan Empleados, Taquilla, Control de entrada y Administración.
 *
 * El frontend y Django deben servirse desde el mismo dominio: así Django
 * protege la sesión con una cookie HttpOnly y el navegador nunca guarda
 * contraseñas ni tokens.
 *
 * Contrato: docs/ACCESO_Y_CUENTAS_DE_PERSONAL.md
 *           docs/json/01-acceso-empleados.json
 *
 * Las altas y bajas de empleados NO están aquí: eso es administración de
 * personal y vive en administracion/personal-api.js. Este archivo solo
 * responde "¿quién eres y puedes entrar?".
 */
(function crearApiDePersonal(global) {
  const { RUTA_API, ErrorDeApi, solicitar } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  const rutas = Object.freeze({
    csrf: () => `${RUTA_API}/autenticacion/csrf/`,
    iniciarSesion: () => `${RUTA_API}/autenticacion/empleados/iniciar-sesion/`,
    sesionActual: () => `${RUTA_API}/autenticacion/empleados/sesion-actual/`,
    cerrarSesion: () => `${RUTA_API}/autenticacion/empleados/cerrar-sesion/`,
    cambiarContrasena: () => `${RUTA_API}/autenticacion/empleados/cambiar-contrasena/`,
  });

  class StaffApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "StaffApiError";
    }
  }

  /*
   * Django exige el token CSRF para escribir. Si la cookie todavía no existe
   * (primera visita), se pide antes de enviar la petición.
   */
  async function asegurarCookieCsrf() {
    if (Util.obtenerCookie("csrftoken")) return;

    const respuesta = await fetch(rutas.csrf(), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!respuesta.ok) {
      throw new StaffApiError(
        "No fue posible preparar la conexión segura.",
        respuesta.status,
        "CSRF_NO_DISPONIBLE",
        null
      );
    }
  }

  function enviar(url, opciones = {}) {
    return solicitar(url, {
      ...opciones,
      ErrorApi: StaffApiError,
      prepararCsrf: asegurarCookieCsrf,
    });
  }

  global.AramacaoStaffApi = Object.freeze({
    iniciarSesion(usuario, contrasena) {
      return enviar(rutas.iniciarSesion(), {
        method: "POST",
        body: JSON.stringify({ usuario, contrasena }),
      });
    },

    obtenerSesionActual() {
      return enviar(rutas.sesionActual());
    },

    cerrarSesion() {
      return enviar(rutas.cerrarSesion(), { method: "POST" });
    },

    cambiarContrasenaActual(contrasenaActual, contrasenaNueva) {
      return enviar(rutas.cambiarContrasena(), {
        method: "POST",
        body: JSON.stringify({
          contrasena_actual: contrasenaActual,
          contrasena_nueva: contrasenaNueva,
        }),
      });
    },

    esVistaLocal: Util.esVistaLocal,
    StaffApiError,
  });
})(window);
