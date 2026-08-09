"use strict";

/*
 * Cliente compartido para la autenticación del personal.
 *
 * El frontend y Django deben servirse desde el mismo dominio. De esta forma,
 * Django puede proteger la sesión con una cookie HttpOnly y el navegador no
 * necesita guardar contraseñas ni tokens de acceso.
 */
(function createStaffApi(global) {
  const API_ROOT = "/api/v1";
  const CSRF_ENDPOINT = `${API_ROOT}/autenticacion/csrf/`;

  class StaffApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.name = "StaffApiError";
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
      throw new StaffApiError(
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
      throw new StaffApiError(
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

  global.AramacaoStaffApi = Object.freeze({
    iniciarSesion(usuario, contrasena) {
      return request("/autenticacion/empleados/iniciar-sesion/", {
        method: "POST",
        body: JSON.stringify({ usuario, contrasena }),
      });
    },

    obtenerSesionActual() {
      return request("/autenticacion/empleados/sesion-actual/");
    },

    cerrarSesion() {
      return request("/autenticacion/empleados/cerrar-sesion/", { method: "POST" });
    },

    cambiarContrasenaActual(contrasenaActual, contrasenaNueva) {
      return request("/autenticacion/empleados/cambiar-contrasena/", {
        method: "POST",
        body: JSON.stringify({
          contrasena_actual: contrasenaActual,
          contrasena_nueva: contrasenaNueva,
        }),
      });
    },

    listarEmpleados({ buscar = "", estado = "TODOS" } = {}) {
      const parametros = new URLSearchParams();
      if (buscar.trim()) parametros.set("buscar", buscar.trim());
      if (estado && estado !== "TODOS") parametros.set("estado", estado);
      const consulta = parametros.toString();
      return request(`/administracion/empleados/${consulta ? `?${consulta}` : ""}`);
    },

    obtenerEmpleado(empleadoId) {
      return request(`/administracion/empleados/${encodeURIComponent(empleadoId)}/`);
    },

    crearEmpleado(datos) {
      return request("/administracion/empleados/", {
        method: "POST",
        body: JSON.stringify(datos),
      });
    },

    actualizarEmpleado(empleadoId, cambios) {
      return request(`/administracion/empleados/${encodeURIComponent(empleadoId)}/`, {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
    },

    asignarContrasenaTemporal(empleadoId, contrasenaTemporal) {
      return request(`/administracion/empleados/${encodeURIComponent(empleadoId)}/contrasena-temporal/`, {
        method: "POST",
        body: JSON.stringify({ contrasena_temporal: contrasenaTemporal }),
      });
    },

    esVistaLocal() {
      return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    },

    StaffApiError,
  });
})(window);
