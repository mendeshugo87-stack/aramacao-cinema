"use strict";

/*
 * VENTAS, COMPROBANTES, BOLETOS Y QR
 * ----------------------------------
 * Único punto de contacto de las pantallas con el backend de ventas.
 * Cada función hace lo mismo en tres pasos: valida lo indispensable, y luego
 *   - en vista local  → responde con ventas-demo.js (localStorage)
 *   - con Django      → llama a la ruta de abajo
 *
 * Todas las rutas están juntas en el objeto `rutas` para que se vean de un
 * golpe al conectar el backend. Contrato:
 *   docs/API_ADMINISTRACION_VENTAS_REEMISIONES.md
 *   docs/json/07-09-ventas-pagos-boletos-qr.json
 *
 * El dibujo del boleto está en boleto-documento.js y los datos de prueba en
 * ventas-demo.js. Aquí no se genera HTML ni imágenes.
 */
(function crearVentasApi(global) {
  const { RUTA_API, ErrorDeApi, solicitar, cabecerasIdempotencia, descargarDesdeServidor } =
    global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  /* Se conserva el nombre SalesApiError porque forma parte de la interfaz
     pública que ya usan las pantallas. */
  const SalesApiError = ErrorDeApi;

  const rutas = Object.freeze({
    // Compra en línea
    crearOrden: () => `${RUTA_API}/compras/ordenes/`,
    iniciarPago: (ordenId) => `${RUTA_API}/compras/ordenes/${encodeURIComponent(ordenId)}/iniciar-pago/`,

    // Taquilla
    registrarVentaTaquilla: () => `${RUTA_API}/taquilla/ventas/`,
    comprobanteTaquilla: (ventaId) => `${RUTA_API}/taquilla/ventas/${encodeURIComponent(ventaId)}/comprobante/descargar/`,
    boletoTaquilla: (boletoId) => `${RUTA_API}/taquilla/boletos/${encodeURIComponent(boletoId)}/descargar/`,
    buscarClientesRecuperacion: () => `${RUTA_API}/taquilla/clientes/buscar/`,
    comprasClienteRecuperacion: (clienteId) => `${RUTA_API}/taquilla/clientes/${encodeURIComponent(clienteId)}/compras-recuperables/`,
    recuperarBoletoTaquilla: (boletoId) => `${RUTA_API}/taquilla/boletos/${encodeURIComponent(boletoId)}/recuperacion/`,

    // Control de entrada
    escanearBoleto: () => `${RUTA_API}/taquilla/boletos/escanear/`,

    // Administración
    listarVentas: (consulta = "") => `${RUTA_API}/administracion/ventas/${consulta ? `?${consulta}` : ""}`,
    detalleVenta: (ventaId) => `${RUTA_API}/administracion/ventas/${encodeURIComponent(ventaId)}/`,
    comprobanteVenta: (ventaId) => `${RUTA_API}/administracion/ventas/${encodeURIComponent(ventaId)}/comprobante/descargar/`,
    boletoAdministracion: (boletoId) => `${RUTA_API}/administracion/boletos/${encodeURIComponent(boletoId)}/descargar/`,
    reemitirBoleto: (boletoId) => `${RUTA_API}/administracion/boletos/${encodeURIComponent(boletoId)}/reemision/`,
    anularVenta: (ventaId) => `${RUTA_API}/administracion/ventas/${encodeURIComponent(ventaId)}/anulacion/`,
    reembolsarVenta: (ventaId) => `${RUTA_API}/administracion/ventas/${encodeURIComponent(ventaId)}/reembolso/`,
  });

  function enviar(url, opciones = {}) {
    return solicitar(url, { ...opciones, ErrorApi: SalesApiError });
  }

  // -------------------------------------------------------------------
  // Compra en línea
  // -------------------------------------------------------------------

  async function crearOrden(datos) {
    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.crearCompraPagada(datos);
    return enviar(rutas.crearOrden(), {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify(datos),
    });
  }

  async function iniciarPago(ordenId, proveedor = "PENDIENTE_DEFINIR") {
    exigir(ordenId, "La orden es obligatoria.");
    if (Util.esVistaLocal()) {
      throw new SalesApiError(
        "La vista local no se conecta a un proveedor de pagos.",
        400,
        "PAGO_SOLO_DEMOSTRACION"
      );
    }
    return enviar(rutas.iniciarPago(ordenId), {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify({ proveedor }),
    });
  }

  // -------------------------------------------------------------------
  // Taquilla
  // -------------------------------------------------------------------

  async function registrarVentaTaquilla(datos) {
    if (Util.esVistaLocal()) {
      return global.AramacaoVentasDemo.crearCompraPagada({
        ...datos,
        bloqueo_id: datos?.bloqueo_id || `TAQ-${Util.crearId()}`,
        canal: "TAQUILLA",
        cliente_nombre: datos?.cliente_nombre || "Cliente de ventanilla",
      });
    }
    return enviar(rutas.registrarVentaTaquilla(), {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify(datos),
    });
  }

  function rutaComprobanteTaquilla(ventaId) {
    exigir(ventaId, "La venta es obligatoria.");
    return rutas.comprobanteTaquilla(ventaId);
  }

  function rutaBoletoTaquilla(boletoId) {
    exigir(boletoId, "El boleto es obligatorio.");
    return rutas.boletoTaquilla(boletoId);
  }

  async function buscarClientesRecuperacion({ criterio = "IDENTIFICACION", valor = "" } = {}) {
    const criterioNormalizado = String(criterio || "").trim().toUpperCase();
    validarBusquedaRecuperacion(criterioNormalizado, valor);

    if (Util.esVistaLocal()) {
      return global.AramacaoVentasDemo.buscarClientesRecuperacion(criterioNormalizado, valor);
    }
    return enviar(rutas.buscarClientesRecuperacion(), {
      method: "POST",
      body: JSON.stringify({ criterio: criterioNormalizado, valor: String(valor).trim() }),
    });
  }

  async function listarComprasRecuperablesCliente(clienteId) {
    exigir(clienteId, "Selecciona un cliente.");
    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.listarComprasRecuperables(clienteId);
    return enviar(rutas.comprasClienteRecuperacion(clienteId));
  }

  /*
   * Reimprimir en ventanilla el boleto de un cliente que llegó sin él.
   * El vendedor debe confirmar que comparó el documento físico: el backend
   * vuelve a validarlo, esta comprobación solo evita el error por descuido.
   */
  async function recuperarBoletoTaquilla(
    boletoId,
    { cliente_id: clienteId = "", motivo = "", documento_verificado: documentoVerificado = false } = {}
  ) {
    exigir(boletoId, "Selecciona un boleto.");
    exigir(clienteId, "Selecciona el cliente que presentó el documento.");
    validarMotivo(motivo);
    if (documentoVerificado !== true) {
      throw new SalesApiError(
        "Confirma que comparaste el documento físico con los datos del cliente.",
        400,
        "DOCUMENTO_NO_VERIFICADO"
      );
    }

    if (Util.esVistaLocal()) {
      return global.AramacaoVentasDemo.recuperarBoletoTaquilla(boletoId, clienteId, motivo);
    }
    return enviar(rutas.recuperarBoletoTaquilla(boletoId), {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify({
        cliente_id: String(clienteId),
        motivo: String(motivo).trim(),
        documento_verificado: true,
      }),
    });
  }

  // -------------------------------------------------------------------
  // Control de entrada
  // -------------------------------------------------------------------

  async function escanearBoleto(valorQr) {
    const token = String(valorQr || "").trim().replace(/^ARATK:/i, "");
    exigir(token, "Escanea o escribe un código QR válido.");

    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.escanearBoleto(token);
    return enviar(rutas.escanearBoleto(), {
      method: "POST",
      body: JSON.stringify({ token_qr: token }),
    });
  }

  // -------------------------------------------------------------------
  // Administración de ventas
  // -------------------------------------------------------------------

  async function listarVentasAdministracion(filtros = {}) {
    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.listarVentasAdministracion(filtros);

    const consulta = new URLSearchParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (String(valor || "").trim()) consulta.set(clave, String(valor).trim());
    });
    return enviar(rutas.listarVentas(consulta.toString()));
  }

  async function obtenerVentaAdministracion(ventaId) {
    exigir(ventaId, "La venta es obligatoria.");
    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.obtenerCompra(ventaId);
    return enviar(rutas.detalleVenta(ventaId));
  }

  async function reemitirBoletoAdministracion(boletoId, motivo) {
    exigir(boletoId, "El boleto es obligatorio.");
    validarMotivo(motivo);
    if (Util.esVistaLocal()) return global.AramacaoVentasDemo.reemitirBoleto(boletoId, motivo);
    return enviar(rutas.reemitirBoleto(boletoId), {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify({ motivo: String(motivo).trim() }),
    });
  }

  function anularVentaAdministracion(ventaId, motivo) {
    return cambiarEstadoVenta(ventaId, motivo, "ANULADA");
  }

  function reembolsarVentaAdministracion(ventaId, motivo) {
    return cambiarEstadoVenta(ventaId, motivo, "REEMBOLSADA");
  }

  async function cambiarEstadoVenta(ventaId, motivo, estadoDestino) {
    exigir(ventaId, "La venta es obligatoria.");
    validarMotivo(motivo);
    if (Util.esVistaLocal()) {
      return global.AramacaoVentasDemo.cambiarEstadoVenta(ventaId, motivo, estadoDestino);
    }
    const url = estadoDestino === "ANULADA"
      ? rutas.anularVenta(ventaId)
      : rutas.reembolsarVenta(ventaId);
    return enviar(url, {
      method: "POST",
      headers: cabecerasIdempotencia(),
      body: JSON.stringify({ motivo: String(motivo).trim() }),
    });
  }

  // -------------------------------------------------------------------
  // Descargas
  // -------------------------------------------------------------------

  async function descargarComprobanteAdministracion(ventaId) {
    exigir(ventaId, "La venta es obligatoria.");
    if (Util.esVistaLocal()) return global.AramacaoBoletoDocumento.descargarComprobanteHtml(ventaId);
    descargarDesdeServidor(rutas.comprobanteVenta(ventaId));
  }

  async function descargarBoletoAdministracion(boletoId) {
    exigir(boletoId, "El boleto es obligatorio.");
    if (Util.esVistaLocal()) return global.AramacaoBoletoDocumento.imprimirBoletoHtml(boletoId);
    descargarDesdeServidor(rutas.boletoAdministracion(boletoId));
  }

  // -------------------------------------------------------------------
  // Validaciones compartidas por la vista local y el servidor
  // -------------------------------------------------------------------

  function exigir(valor, mensaje) {
    if (!valor) throw new SalesApiError(mensaje, 400, "ERROR_VALIDACION");
  }

  /* Anular, reembolsar o reemitir siempre queda registrado con un motivo. */
  function validarMotivo(motivo) {
    if (String(motivo || "").trim().length < 10) {
      throw new SalesApiError("Escribe un motivo de al menos 10 caracteres.", 400, "MOTIVO_REQUERIDO");
    }
  }

  function validarBusquedaRecuperacion(criterio, valor) {
    if (!["IDENTIFICACION", "NOMBRE", "USUARIO"].includes(criterio)) {
      throw new SalesApiError("Selecciona un criterio de búsqueda válido.", 400, "CRITERIO_INVALIDO");
    }

    const texto = String(valor || "").trim();
    if (criterio === "IDENTIFICACION" && !/^\d{13}$/.test(texto.replace(/\D/g, ""))) {
      throw new SalesApiError("Escribe los 13 dígitos de la identidad.", 400, "IDENTIFICACION_INVALIDA");
    }
    if (criterio === "NOMBRE" && texto.length < 3) {
      throw new SalesApiError("Escribe al menos 3 caracteres del nombre.", 400, "BUSQUEDA_MUY_CORTA");
    }
    if (criterio === "USUARIO" && texto.length < 4) {
      throw new SalesApiError("Escribe al menos 4 caracteres del usuario.", 400, "BUSQUEDA_MUY_CORTA");
    }
  }

  global.AramacaoSalesApi = Object.freeze({
    // Compra en línea
    crearOrden,
    iniciarPago,

    // Taquilla
    registrarVentaTaquilla,
    rutaComprobanteTaquilla,
    rutaBoletoTaquilla,
    buscarClientesRecuperacion,
    listarComprasRecuperablesCliente,
    recuperarBoletoTaquilla,

    // Control de entrada
    escanearBoleto,

    // Administración
    listarVentasAdministracion,
    obtenerVentaAdministracion,
    reemitirBoletoAdministracion,
    anularVentaAdministracion,
    reembolsarVentaAdministracion,
    descargarComprobanteAdministracion,
    descargarBoletoAdministracion,

    /* Solo vista local: las pantallas de Mi cuenta y Compra las usan mientras
       no exista backend. Al conectar Django se reemplazan por sus rutas. */
    listarComprasDemo: (filtros) => global.AramacaoVentasDemo.listarCompras(filtros),
    obtenerCompraDemo: (compraId) => global.AramacaoVentasDemo.obtenerCompra(compraId),
    obtenerBoletoDemo: (boletoId) => global.AramacaoVentasDemo.obtenerBoleto(boletoId),
    obtenerEstadosAsientosDemo: (funcionId) => global.AramacaoVentasDemo.obtenerEstadosAsientos(funcionId),
    descargarBoletoDemo: (boletoId) => global.AramacaoBoletoDocumento.descargarBoletoPng(boletoId),
    imprimirBoletoDemo: (boletoId) => global.AramacaoBoletoDocumento.imprimirBoletoHtml(boletoId),
    descargarComprobanteDemo: (compraId) => global.AramacaoBoletoDocumento.descargarComprobanteHtml(compraId),
    generarQrDataUrl: (contenido) => global.AramacaoBoletoDocumento.generarQrDataUrl(contenido),

    esVistaLocal: Util.esVistaLocal,
    SalesApiError,
  });
})(window);
