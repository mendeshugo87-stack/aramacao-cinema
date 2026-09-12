"use strict";

/*
 * CLIENTE HTTP COMPARTIDO
 * -----------------------
 * Antes cada archivo *-api.js traía su propia copia de fetch + CSRF + lectura
 * de JSON + clase de error (seis copias casi iguales). Ahora todas usan esta.
 *
 * PARA QUIEN CONECTE DJANGO: este es el único punto donde se arma la petición.
 * Si cambia la ruta base, el manejo de CSRF o el formato de error del backend,
 * se ajusta AQUÍ y no en cada área.
 *
 * Formato de error que se espera del backend (ya documentado en docs/API_*.md):
 *   { "mensaje": "...", "codigo": "...", "errores": { "campo": ["..."] } }
 *
 * Nota: las cuentas de clientes usan JWT con otro flujo (renovación de token)
 * y por eso mantienen su propia capa en cuenta/customer-api.js; aun así
 * reutilizan ErrorDeApi y leerRespuesta de este archivo.
 */
(function crearClienteApi(global) {
  const RUTA_API = "/api/v1";
  const METODOS_SIN_CSRF = ["GET", "HEAD", "OPTIONS"];

  class ErrorDeApi extends Error {
    constructor(mensaje, estado = 0, codigo = "ERROR_CONEXION", detalles = null) {
      super(mensaje);
      this.name = "ErrorDeApi";
      this.estado = estado;
      this.codigo = codigo;
      this.detalles = detalles;
      /* Nombres en inglés que ya usaban las pantallas; se conservan para no
         tener que tocar el manejo de errores de cada página. */
      this.status = estado;
      this.code = codigo;
      this.details = detalles;
    }
  }

  /*
   * Envía una petición y devuelve el JSON ya leído.
   * Opciones propias (no se pasan a fetch):
   *   ErrorApi     clase de error a lanzar (cada área usa la suya para que
   *                los `instanceof` de las pantallas sigan funcionando)
   *   csrf         false para omitir la cabecera X-CSRFToken
   *   credenciales "same-origin" (por defecto) u "omit"
   *   prepararCsrf función opcional que se ejecuta antes de escribir, para
   *                pedirle al backend la cookie CSRF si todavía no existe
   */
  async function solicitar(url, opciones = {}) {
    const {
      ErrorApi = ErrorDeApi,
      csrf = true,
      credenciales = "same-origin",
      prepararCsrf = null,
      ...opcionesFetch
    } = opciones;

    const metodo = String(opcionesFetch.method || "GET").toUpperCase();
    const cabeceras = new Headers(opcionesFetch.headers || {});
    cabeceras.set("Accept", "application/json");

    /*
     * Con FormData (subida de imágenes) NO se pone Content-Type: el navegador
     * debe añadirlo junto con el separador "boundary" del multipart. Si se
     * fija a mano, Django no puede leer los archivos.
     */
    const esFormData = typeof FormData !== "undefined" && opcionesFetch.body instanceof FormData;
    if (opcionesFetch.body && !esFormData && !cabeceras.has("Content-Type")) {
      cabeceras.set("Content-Type", "application/json");
    }

    if (csrf && !METODOS_SIN_CSRF.includes(metodo)) {
      if (prepararCsrf) await prepararCsrf();
      const token = global.AramacaoUtil.obtenerCookie("csrftoken");
      if (token) cabeceras.set("X-CSRFToken", token);
    }

    let respuesta;
    try {
      respuesta = await fetch(url, {
        ...opcionesFetch,
        method: metodo,
        headers: cabeceras,
        credentials: credenciales,
      });
    } catch (error) {
      throw new ErrorApi(
        "No fue posible comunicarse con el servidor.",
        0,
        "ERROR_CONEXION",
        error
      );
    }

    const cuerpo = await leerRespuesta(respuesta);
    if (!respuesta.ok) {
      throw new ErrorApi(
        cuerpo?.mensaje || cuerpo?.detalle || "La solicitud no pudo completarse.",
        respuesta.status,
        cuerpo?.codigo || "ERROR_SOLICITUD",
        cuerpo?.errores || null
      );
    }
    return cuerpo;
  }

  /* 204 = sin contenido. Si no viene JSON se devuelve el texto como detalle. */
  async function leerRespuesta(respuesta) {
    if (respuesta.status === 204) return null;

    const tipo = respuesta.headers.get("content-type") || "";
    if (tipo.includes("application/json")) {
      try {
        return await respuesta.json();
      } catch {
        return null;
      }
    }

    const texto = await respuesta.text();
    return texto ? { detalle: texto } : null;
  }

  /* Evita cobrar dos veces si el usuario reenvía la misma compra. */
  function cabecerasIdempotencia() {
    return { "Idempotency-Key": global.AramacaoUtil.crearId() };
  }

  /* Descarga que genera el propio servidor (comprobantes y boletos reales). */
  function descargarDesdeServidor(url) {
    const enlace = global.document.createElement("a");
    enlace.href = url;
    enlace.rel = "noopener";
    global.document.body.append(enlace);
    enlace.click();
    enlace.remove();
  }

  global.AramacaoApiCliente = Object.freeze({
    RUTA_API,
    ErrorDeApi,
    solicitar,
    leerRespuesta,
    cabecerasIdempotencia,
    descargarDesdeServidor,
  });
})(window);
