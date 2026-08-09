"use strict";

/*
 * Cliente compartido para las cuentas públicas de Aramacao Cinema.
 *
 * Django y el frontend deben servirse desde el mismo dominio. La sesión viaja
 * en una cookie HttpOnly; este archivo nunca guarda contraseñas, identificación
 * ni tokens de sesión en localStorage o IndexedDB.
 */
(function createCustomerApi(global) {
  const API_ROOT = "/api/v1";
  const CSRF_ENDPOINT = `${API_ROOT}/autenticacion/csrf/`;

  class CustomerApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.name = "CustomerApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  async function request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      await ensureCsrfCookie();
      const csrfToken = getCookie("csrftoken");
      if (csrfToken) headers.set("X-CSRFToken", csrfToken);
    }

    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
    });
    const data = await readResponse(response);

    if (!response.ok) {
      throw new CustomerApiError(
        data?.mensaje || data?.detalle || "La solicitud no pudo completarse.",
        response.status,
        data?.codigo || "SOLICITUD_FALLIDA",
        data?.errores || null
      );
    }

    return data;
  }

  async function ensureCsrfCookie() {
    if (getCookie("csrftoken")) return;

    const response = await fetch(CSRF_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new CustomerApiError(
        "No fue posible preparar la conexión segura.",
        response.status,
        "CSRF_NO_DISPONIBLE",
        null
      );
    }
  }

  async function readResponse(response) {
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    const text = await response.text();
    return text ? { detalle: text } : null;
  }

  function getCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  }

  function buildQuery(parameters) {
    const search = new URLSearchParams();
    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    });
    return search.toString();
  }

  global.AramacaoCustomerApi = Object.freeze({
    crearCuenta(datos) {
      return request("/autenticacion/clientes/crear-cuenta/", {
        method: "POST",
        body: JSON.stringify(datos),
      });
    },

    verificarCorreo(flujoId, codigo) {
      return request("/autenticacion/clientes/verificar-correo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId, codigo }),
      });
    },

    reenviarCodigo(flujoId) {
      return request("/autenticacion/clientes/reenviar-codigo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId }),
      });
    },

    iniciarSesion(identidad, contrasena) {
      return request("/autenticacion/clientes/iniciar-sesion/", {
        method: "POST",
        body: JSON.stringify({ identidad, contrasena }),
      });
    },

    obtenerSesionActual() {
      return request("/autenticacion/clientes/sesion-actual/");
    },

    cerrarSesion() {
      return request("/autenticacion/clientes/cerrar-sesion/", { method: "POST" });
    },

    solicitarRecuperacion(identidad) {
      return request("/autenticacion/clientes/solicitar-recuperacion/", {
        method: "POST",
        body: JSON.stringify({ identidad }),
      });
    },

    verificarCodigoRecuperacion(flujoId, codigo) {
      return request("/autenticacion/clientes/verificar-codigo/", {
        method: "POST",
        body: JSON.stringify({ flujo_recuperacion_id: flujoId, codigo }),
      });
    },

    restablecerContrasena(token, contrasenaNueva) {
      return request("/autenticacion/clientes/restablecer-contrasena/", {
        method: "POST",
        body: JSON.stringify({
          token_restablecimiento: token,
          contrasena_nueva: contrasenaNueva,
        }),
      });
    },

    obtenerMiCuenta() {
      return request("/clientes/mi-cuenta/");
    },

    actualizarMiCuenta(cambios) {
      return request("/clientes/mi-cuenta/", {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
    },

    cambiarContrasena(contrasenaActual, contrasenaNueva) {
      return request("/clientes/mi-cuenta/cambiar-contrasena/", {
        method: "POST",
        body: JSON.stringify({
          contrasena_actual: contrasenaActual,
          contrasena_nueva: contrasenaNueva,
        }),
      });
    },

    solicitarCambioCorreo(correoNuevo, contrasenaActual) {
      return request("/clientes/mi-cuenta/cambiar-correo/", {
        method: "POST",
        body: JSON.stringify({
          correo_nuevo: correoNuevo,
          contrasena_actual: contrasenaActual,
        }),
      });
    },

    verificarCambioCorreo(flujoId, codigo) {
      return request("/clientes/mi-cuenta/verificar-correo/", {
        method: "POST",
        body: JSON.stringify({ flujo_verificacion_id: flujoId, codigo }),
      });
    },

    listarCompras({ pagina = 1, estado = "" } = {}) {
      const query = buildQuery({ pagina, estado });
      return request(`/clientes/mi-cuenta/compras/${query ? `?${query}` : ""}`);
    },

    obtenerCompra(compraId) {
      return request(`/clientes/mi-cuenta/compras/${encodeURIComponent(compraId)}/`);
    },

    rutaDescargaBoleto(boletoId) {
      return `${API_ROOT}/clientes/mi-cuenta/boletos/${encodeURIComponent(boletoId)}/descargar/`;
    },

    esVistaLocal() {
      return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    },

    CustomerApiError,
  });
})(window);
