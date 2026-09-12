"use strict";

/*
 * ADMINISTRACIÓN DE PERSONAL
 * --------------------------
 * Altas, ediciones y contraseñas temporales de las cuentas de empleados.
 * Solo lo usa pages/administracion/personal.html.
 *
 * Se separó de empleados/staff-api.js porque son dos cosas distintas:
 *   staff-api.js   → "¿quién eres y puedes entrar?" (todas las áreas privadas)
 *   personal-api.js → "crear y editar empleados"    (solo Administración)
 * Mezcladas, cada página privada cargaba también el CRUD que no usaba.
 *
 * Contrato: docs/ACCESO_Y_CUENTAS_DE_PERSONAL.md
 *           docs/json/01-acceso-empleados.json
 */
(function crearApiDeAdministracionPersonal(global) {
  const { RUTA_API, ErrorDeApi, solicitar } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  const rutas = Object.freeze({
    listar: (consulta = "") => `${RUTA_API}/administracion/empleados/${consulta ? `?${consulta}` : ""}`,
    detalle: (empleadoId) => `${RUTA_API}/administracion/empleados/${encodeURIComponent(empleadoId)}/`,
    crear: () => `${RUTA_API}/administracion/empleados/`,
    contrasenaTemporal: (empleadoId) =>
      `${RUTA_API}/administracion/empleados/${encodeURIComponent(empleadoId)}/contrasena-temporal/`,
  });

  class PersonalApiError extends ErrorDeApi {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje, estado, codigo, detalles);
      this.name = "PersonalApiError";
    }
  }

  function enviar(url, opciones = {}) {
    return solicitar(url, { ...opciones, ErrorApi: PersonalApiError });
  }

  global.AramacaoPersonalApi = Object.freeze({
    listarEmpleados({ buscar = "", estado = "TODOS" } = {}) {
      const consulta = new URLSearchParams();
      if (buscar.trim()) consulta.set("buscar", buscar.trim());
      if (estado && estado !== "TODOS") consulta.set("estado", estado);
      return enviar(rutas.listar(consulta.toString()));
    },

    obtenerEmpleado(empleadoId) {
      return enviar(rutas.detalle(empleadoId));
    },

    crearEmpleado(datos) {
      return enviar(rutas.crear(), {
        method: "POST",
        body: JSON.stringify(datos),
      });
    },

    actualizarEmpleado(empleadoId, cambios) {
      return enviar(rutas.detalle(empleadoId), {
        method: "PATCH",
        body: JSON.stringify(cambios),
      });
    },

    /* El administrador no ve contraseñas: asigna una temporal y el empleado
       debe cambiarla en su primer ingreso. */
    asignarContrasenaTemporal(empleadoId, contrasenaTemporal) {
      return enviar(rutas.contrasenaTemporal(empleadoId), {
        method: "POST",
        body: JSON.stringify({ contrasena_temporal: contrasenaTemporal }),
      });
    },

    esVistaLocal: Util.esVistaLocal,
    PersonalApiError,
  });
})(window);
