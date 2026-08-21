"use strict";

/*
 * ADAPTADOR DE VENTAS, COMPROBANTES, BOLETOS Y QR
 * ------------------------------------------------
 * La interfaz usa únicamente este archivo para el bloque final de la compra.
 * En localhost guarda datos DE DEMOSTRACIÓN en localStorage para permitir QA
 * entre Compra, Mi cuenta y Taquilla. Nunca recibe datos reales de tarjetas.
 * En producción, Django es la única fuente de verdad y confirma el pago desde
 * el webhook del proveedor antes de emitir los boletos.
 */
(function exposeSalesApi(global) {
  const API_ROOT = "/api/v1";
  const DEMO_STORAGE_KEY = "aramacao-demo-ventas-v1";
  const LOGO_RELATIVE_URL = "../../assets/images/AraMacao Completo Degradado (3).png";
  const DEMO_RECOVERY_CUSTOMER = Object.freeze({
    id: "vista-local",
    nombre_completo: "Hugo Méndez",
    usuario: "hugomendez",
    tipo_identificacion: "IDENTIDAD_HN",
    identificacion_enmascarada: "0801-••••-•2345",
    identificacion_busqueda_demo: "0801199012345",
  });
  let logoDataUrlPromise = null;

  const routes = Object.freeze({
    crearOrden: () => `${API_ROOT}/compras/ordenes/`,
    obtenerOrden: (orderId) =>
      `${API_ROOT}/compras/ordenes/${encodeURIComponent(orderId)}/`,
    iniciarPago: (orderId) =>
      `${API_ROOT}/compras/ordenes/${encodeURIComponent(orderId)}/iniciar-pago/`,
    registrarVentaTaquilla: () => `${API_ROOT}/taquilla/ventas/`,
    comprobanteTaquilla: (saleId) =>
      `${API_ROOT}/taquilla/ventas/${encodeURIComponent(saleId)}/comprobante/descargar/`,
    boletoTaquilla: (ticketId) =>
      `${API_ROOT}/taquilla/boletos/${encodeURIComponent(ticketId)}/descargar/`,
    buscarClientesRecuperacion: () => `${API_ROOT}/taquilla/clientes/buscar/`,
    comprasClienteRecuperacion: (customerId) =>
      `${API_ROOT}/taquilla/clientes/${encodeURIComponent(customerId)}/compras-recuperables/`,
    recuperarBoletoTaquilla: (ticketId) =>
      `${API_ROOT}/taquilla/boletos/${encodeURIComponent(ticketId)}/recuperacion/`,
    escanearBoleto: () => `${API_ROOT}/taquilla/boletos/escanear/`,
    listarVentasAdministracion: (query = "") =>
      `${API_ROOT}/administracion/ventas/${query ? `?${query}` : ""}`,
    detalleVentaAdministracion: (saleId) =>
      `${API_ROOT}/administracion/ventas/${encodeURIComponent(saleId)}/`,
    comprobanteAdministracion: (saleId) =>
      `${API_ROOT}/administracion/ventas/${encodeURIComponent(saleId)}/comprobante/descargar/`,
    boletoAdministracion: (ticketId) =>
      `${API_ROOT}/administracion/boletos/${encodeURIComponent(ticketId)}/descargar/`,
    reemitirBoletoAdministracion: (ticketId) =>
      `${API_ROOT}/administracion/boletos/${encodeURIComponent(ticketId)}/reemision/`,
    anularVentaAdministracion: (saleId) =>
      `${API_ROOT}/administracion/ventas/${encodeURIComponent(saleId)}/anulacion/`,
    reembolsarVentaAdministracion: (saleId) =>
      `${API_ROOT}/administracion/ventas/${encodeURIComponent(saleId)}/reembolso/`,
  });

  class SalesApiError extends Error {
    constructor(message, status = 0, code = "ERROR_CONEXION", details = null) {
      super(message);
      this.name = "SalesApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function isLocalPreview() {
    return ["localhost", "127.0.0.1", "[::1]"].includes(global.location.hostname);
  }

  async function createOrder(payload) {
    if (isLocalPreview()) return createPaidDemoPurchase(payload);
    return request(routes.crearOrden(), {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify(payload),
    });
  }

  async function startPayment(orderId, provider = "PENDIENTE_DEFINIR") {
    requireValue(orderId, "La orden es obligatoria.");
    if (isLocalPreview()) {
      throw new SalesApiError(
        "La vista local no se conecta a un proveedor de pagos.",
        400,
        "PAGO_SOLO_DEMOSTRACION"
      );
    }
    return request(routes.iniciarPago(orderId), {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify({ proveedor: provider }),
    });
  }

  async function scanTicket(qrValue) {
    const token = normalizeQrToken(qrValue);
    requireValue(token, "Escanea o escribe un código QR válido.");
    if (isLocalPreview()) return scanDemoTicket(token);
    return request(routes.escanearBoleto(), {
      method: "POST",
      body: JSON.stringify({ token_qr: token }),
    });
  }

  async function registerTicketOfficeSale(payload) {
    if (isLocalPreview()) {
      return createPaidDemoPurchase({
        ...payload,
        bloqueo_id: payload?.bloqueo_id || `TAQ-${createId()}`,
        canal: "TAQUILLA",
        cliente_nombre: payload?.cliente_nombre || "Cliente de ventanilla",
      });
    }
    return request(routes.registrarVentaTaquilla(), {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify(payload),
    });
  }

  function ticketOfficeReceiptUrl(saleId) {
    requireValue(saleId, "La venta es obligatoria.");
    return routes.comprobanteTaquilla(saleId);
  }

  function ticketOfficeTicketUrl(ticketId) {
    requireValue(ticketId, "El boleto es obligatorio.");
    return routes.boletoTaquilla(ticketId);
  }

  function createPaidDemoPurchase(payload) {
    if (!isLocalPreview()) {
      throw new SalesApiError("El pago de prueba solo funciona en localhost.", 403, "OPERACION_NO_PERMITIDA");
    }

    const seats = normalizeSeats(payload?.asientos);
    if (!payload?.bloqueo_id || !payload?.funcion_id || !seats.length) {
      throw new SalesApiError(
        "La función, el bloqueo y los asientos son obligatorios.",
        400,
        "ERROR_VALIDACION"
      );
    }

    const storage = readStorage();
    const duplicate = storage.compras.find((purchase) =>
      purchase.bloqueo_id === payload.bloqueo_id
    );
    if (duplicate) return structuredClone(duplicate);

    const createdAt = new Date();
    const purchaseId = createId();
    const channel = String(payload.canal || "ONLINE").toUpperCase();
    const reference = createReference(
      createdAt,
      storage.compras.length + 1,
      channel === "TAQUILLA" ? "TAQ" : "ARA"
    );
    const unitPrice = moneyNumber(payload.precio_unitario);
    const subtotal = moneyNumber(payload.subtotal ?? seats.length * unitPrice);
    const discount = moneyNumber(payload.descuento);
    const total = moneyNumber(payload.total ?? subtotal - discount);
    const hasPromotion = Boolean(payload.promocion_2x1);
    const promotedSeatCount = hasPromotion ? Math.floor(seats.length / 2) * 2 : 0;
    const tickets = seats.map((seat, index) => {
      const ticketHasPromotion = index < promotedSeatCount;
      const pairIndex = ticketHasPromotion ? Math.floor(index / 2) + 1 : null;
      const pairId = ticketHasPromotion ? `${purchaseId}-PAR-${pairIndex}` : null;
      const pairPosition = ticketHasPromotion ? (index % 2) + 1 : null;
      const ticketId = createId();
      const opaqueToken = createOpaqueToken();
      return {
        id: ticketId,
        numero: `${reference}-${String(index + 1).padStart(2, "0")}`,
        compra_id: purchaseId,
        funcion_id: String(payload.funcion_id),
        pelicula: String(payload.pelicula || "Película"),
        pelicula_id: String(payload.pelicula_id || ""),
        fecha_funcion: String(payload.fecha_funcion || ""),
        hora_funcion: String(payload.hora_funcion || ""),
        sala: String(payload.sala || "Sala 1"),
        formato: String(payload.formato || "2D"),
        asiento: seat,
        estado: "RESERVADO",
        promocion_2x1: ticketHasPromotion,
        grupo_2x1_id: pairId,
        posicion_2x1: pairPosition,
        token_qr_demo: opaqueToken,
        contenido_qr: `ARATK:${opaqueToken}`,
        escaneado_en: null,
        descripcion: buildTicketDescription(payload, seat, ticketHasPromotion, pairPosition),
      };
    });

    const purchase = {
      id: purchaseId,
      numero: reference,
      referencia: reference,
      bloqueo_id: String(payload.bloqueo_id),
      cliente_id: channel === "TAQUILLA"
        ? String(payload.cliente_id || "")
        : String(payload.cliente_id || DEMO_RECOVERY_CUSTOMER.id),
      cliente_nombre: String(payload.cliente_nombre || "Cliente de prueba"),
      cliente_usuario: channel === "TAQUILLA"
        ? String(payload.cliente_usuario || "")
        : String(payload.cliente_usuario || DEMO_RECOVERY_CUSTOMER.usuario),
      cliente_identificacion_enmascarada: channel === "TAQUILLA"
        ? String(payload.cliente_identificacion_enmascarada || "")
        : String(payload.cliente_identificacion_enmascarada || DEMO_RECOVERY_CUSTOMER.identificacion_enmascarada),
      pelicula: String(payload.pelicula || "Película"),
      pelicula_id: String(payload.pelicula_id || ""),
      funcion_id: String(payload.funcion_id),
      fecha_funcion: String(payload.fecha_funcion || ""),
      hora_funcion: String(payload.hora_funcion || ""),
      sala: String(payload.sala || "Sala 1"),
      formato: String(payload.formato || "2D"),
      asientos: seats,
      promocion_2x1: promotedSeatCount > 0,
      cantidad_boletos: tickets.length,
      subtotal,
      descuento: discount,
      total,
      moneda: "HNL",
      estado: "PAGADA",
      estado_pago: "APROBADO_DEMO",
      canal: channel,
      metodo_pago: String(payload.metodo_pago || (payload.canal === "TAQUILLA" ? "EFECTIVO" : "ONLINE")).toUpperCase(),
      vendedor_nombre: String(payload.vendedor_nombre || ""),
      efectivo_recibido: moneyNumber(payload.efectivo_recibido),
      cambio: moneyNumber(payload.cambio),
      fecha: createdAt.toISOString(),
      creada_en: createdAt.toISOString(),
      detalle: `${tickets.length} boleto(s) · ${seats.join(", ")}`,
      items: tickets.map((ticket) => ({
        id: ticket.id,
        descripcion: ticket.descripcion,
      })),
      boletos: tickets,
      comprobante: {
        id: createId(),
        numero: `COMP-${reference}`,
        tipo: "COMPROBANTE_NO_FISCAL_DEMOSTRACION",
      },
    };

    storage.compras.unshift(purchase);
    writeStorage(storage);
    return structuredClone(purchase);
  }

  function listDemoPurchases({ estado = "" } = {}) {
    const normalizedStatus = String(estado || "").toUpperCase();
    const purchases = readStorage().compras.filter((purchase) => {
      const belongsToOnlineCustomer = String(purchase.canal || "ONLINE").toUpperCase() !== "TAQUILLA";
      const matchesStatus = !normalizedStatus || purchase.estado === normalizedStatus;
      return belongsToOnlineCustomer && matchesStatus;
    });
    return {
      total: purchases.length,
      resultados: structuredClone(purchases),
    };
  }

  function getDemoPurchase(purchaseId) {
    const purchase = readStorage().compras.find((item) => item.id === purchaseId);
    if (!purchase) {
      throw new SalesApiError("No se encontró la compra de demostración.", 404, "RECURSO_NO_ENCONTRADO");
    }
    return { compra: structuredClone(purchase) };
  }

  function getDemoTicket(ticketId) {
    for (const purchase of readStorage().compras) {
      const ticket = purchase.boletos.find((item) => item.id === ticketId);
      if (ticket) return { purchase: structuredClone(purchase), ticket: structuredClone(ticket) };
    }
    throw new SalesApiError("No se encontró el boleto.", 404, "BOLETO_NO_ENCONTRADO");
  }

  async function listAdminSales(filters = {}) {
    if (isLocalPreview()) return listAdminDemoSales(filters);
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (String(value || "").trim()) query.set(key, String(value).trim());
    });
    return request(routes.listarVentasAdministracion(query.toString()));
  }

  async function getAdminSale(saleId) {
    requireValue(saleId, "La venta es obligatoria.");
    if (isLocalPreview()) return getDemoPurchase(saleId);
    return request(routes.detalleVentaAdministracion(saleId));
  }

  async function searchRecoveryCustomers({ criterio = "IDENTIFICACION", valor = "" } = {}) {
    const normalizedCriteria = String(criterio || "").trim().toUpperCase();
    validateRecoverySearch(normalizedCriteria, valor);
    if (isLocalPreview()) return searchDemoRecoveryCustomers(normalizedCriteria, valor);
    return request(routes.buscarClientesRecuperacion(), {
      method: "POST",
      body: JSON.stringify({ criterio: normalizedCriteria, valor: String(valor).trim() }),
    });
  }

  async function listRecoveryPurchases(customerId) {
    requireValue(customerId, "Selecciona un cliente.");
    if (isLocalPreview()) return listDemoRecoveryPurchases(customerId);
    return request(routes.comprasClienteRecuperacion(customerId));
  }

  async function recoverTicketAtOffice(ticketId, { cliente_id = "", motivo = "", documento_verificado = false } = {}) {
    requireValue(ticketId, "Selecciona un boleto.");
    requireValue(cliente_id, "Selecciona el cliente que presentó el documento.");
    validateReason(motivo);
    if (documento_verificado !== true) {
      throw new SalesApiError(
        "Confirma que comparaste el documento físico con los datos del cliente.",
        400,
        "DOCUMENTO_NO_VERIFICADO"
      );
    }
    if (isLocalPreview()) return recoverDemoTicketAtOffice(ticketId, cliente_id, motivo);
    return request(routes.recuperarBoletoTaquilla(ticketId), {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify({
        cliente_id: String(cliente_id),
        motivo: String(motivo).trim(),
        documento_verificado: true,
      }),
    });
  }

  async function reissueAdminTicket(ticketId, reason) {
    requireValue(ticketId, "El boleto es obligatorio.");
    validateReason(reason);
    if (isLocalPreview()) return reissueDemoTicket(ticketId, reason);
    return request(routes.reemitirBoletoAdministracion(ticketId), {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify({ motivo: String(reason).trim() }),
    });
  }

  async function annulAdminSale(saleId, reason) {
    return updateAdminSaleState(saleId, reason, "ANULADA");
  }

  async function refundAdminSale(saleId, reason) {
    return updateAdminSaleState(saleId, reason, "REEMBOLSADA");
  }

  async function updateAdminSaleState(saleId, reason, targetState) {
    requireValue(saleId, "La venta es obligatoria.");
    validateReason(reason);
    if (isLocalPreview()) return updateDemoSaleState(saleId, reason, targetState);
    const route = targetState === "ANULADA"
      ? routes.anularVentaAdministracion(saleId)
      : routes.reembolsarVentaAdministracion(saleId);
    return request(route, {
      method: "POST",
      headers: buildIdempotencyHeaders(),
      body: JSON.stringify({ motivo: String(reason).trim() }),
    });
  }

  function listAdminDemoSales(filters = {}) {
    const search = normalizeSearch(filters.buscar);
    const status = String(filters.estado || "").trim().toUpperCase();
    const channel = String(filters.canal || "").trim().toUpperCase();
    const paymentMethod = String(filters.metodo_pago || "").trim().toUpperCase();
    const from = normalizeDateFilter(filters.fecha_desde);
    const to = normalizeDateFilter(filters.fecha_hasta);
    const purchases = readStorage().compras.filter((purchase) => {
      const purchaseDate = String(purchase.fecha || purchase.creada_en || "").slice(0, 10);
      const searchable = normalizeSearch([
        purchase.numero,
        purchase.referencia,
        purchase.cliente_nombre,
        purchase.pelicula,
        purchase.vendedor_nombre,
        ...(purchase.asientos || []),
        ...(purchase.boletos || []).map((ticket) => ticket.numero),
      ].join(" "));
      return (!search || searchable.includes(search))
        && (!status || String(purchase.estado || "").toUpperCase() === status)
        && (!channel || String(purchase.canal || "ONLINE").toUpperCase() === channel)
        && (!paymentMethod || String(purchase.metodo_pago || "").toUpperCase() === paymentMethod)
        && (!from || purchaseDate >= from)
        && (!to || purchaseDate <= to);
    });
    return {
      total: purchases.length,
      resumen: {
        total_ventas: purchases.length,
        ventas_online: purchases.filter((item) => String(item.canal).toUpperCase() !== "TAQUILLA").length,
        ventas_taquilla: purchases.filter((item) => String(item.canal).toUpperCase() === "TAQUILLA").length,
        monto_total: moneyNumber(purchases
          .filter((item) => item.estado === "PAGADA")
          .reduce((sum, item) => sum + moneyNumber(item.total), 0)).toFixed(2),
      },
      resultados: structuredClone(purchases),
    };
  }

  function searchDemoRecoveryCustomers(criteria, value) {
    const needle = normalizeLookup(value);
    const customerValue = criteria === "IDENTIFICACION"
      ? DEMO_RECOVERY_CUSTOMER.identificacion_busqueda_demo
      : criteria === "USUARIO"
        ? DEMO_RECOVERY_CUSTOMER.usuario
        : DEMO_RECOVERY_CUSTOMER.nombre_completo;
    const hayCompras = readStorage().compras.some((purchase) =>
      String(purchase.canal || "ONLINE").toUpperCase() !== "TAQUILLA"
    );
    const matches = normalizeLookup(customerValue).includes(needle);
    const result = matches && hayCompras ? [publicDemoCustomer()] : [];
    return { total: result.length, resultados: structuredClone(result) };
  }

  function listDemoRecoveryPurchases(customerId) {
    if (String(customerId) !== DEMO_RECOVERY_CUSTOMER.id) {
      throw new SalesApiError("No se encontró el cliente.", 404, "CLIENTE_NO_ENCONTRADO");
    }
    const purchases = readStorage().compras
      .filter((purchase) => String(purchase.canal || "ONLINE").toUpperCase() !== "TAQUILLA")
      .filter(isCurrentOrFuturePurchase)
      .sort(comparePurchasesByFunction)
      .map((purchase) => ({
        ...purchase,
        boletos: (purchase.boletos || []).map((ticket) => ({
          ...ticket,
          ...recoveryEligibility(purchase, ticket),
        })),
      }));
    return {
      cliente: publicDemoCustomer(),
      total: purchases.length,
      resultados: structuredClone(purchases),
    };
  }

  function recoverDemoTicketAtOffice(ticketId, customerId, reason) {
    const storage = readStorage();
    const located = findStoredTicket(storage, ticketId);
    const ownerId = located.purchase.cliente_id
      || (String(located.purchase.canal || "ONLINE").toUpperCase() !== "TAQUILLA" ? DEMO_RECOVERY_CUSTOMER.id : "");
    if (String(customerId) !== ownerId) {
      throw new SalesApiError("El boleto no pertenece al cliente verificado.", 404, "BOLETO_NO_ENCONTRADO");
    }
    const eligibility = recoveryEligibility(located.purchase, located.ticket);
    if (!eligibility.recuperable) {
      throw new SalesApiError(
        eligibility.motivo_no_recuperable,
        409,
        located.ticket.estado === "OCUPADO" ? "BOLETO_YA_UTILIZADO" : "BOLETO_NO_RECUPERABLE"
      );
    }
    const result = reissueDemoTicket(ticketId, reason, {
      action: "BOLETO_RECUPERADO_TAQUILLA",
      employee: "Vendedor de Taquilla local",
    });
    return { ...result, codigo: "BOLETO_RECUPERADO" };
  }

  function publicDemoCustomer() {
    return {
      id: DEMO_RECOVERY_CUSTOMER.id,
      nombre_completo: DEMO_RECOVERY_CUSTOMER.nombre_completo,
      usuario: DEMO_RECOVERY_CUSTOMER.usuario,
      tipo_identificacion: DEMO_RECOVERY_CUSTOMER.tipo_identificacion,
      identificacion_enmascarada: DEMO_RECOVERY_CUSTOMER.identificacion_enmascarada,
    };
  }

  function recoveryEligibility(purchase, ticket) {
    if (String(purchase.estado || "").toUpperCase() !== "PAGADA") {
      return { recuperable: false, motivo_no_recuperable: "La venta no está pagada." };
    }
    const ticketState = String(ticket.estado || "").toUpperCase();
    if (ticketState === "OCUPADO") {
      return {
        recuperable: false,
        motivo_no_recuperable: `El ingreso ya fue registrado${ticket.escaneado_en ? ` el ${formatDateTime(ticket.escaneado_en)}` : ""}.`,
      };
    }
    if (ticketState !== "RESERVADO") {
      return { recuperable: false, motivo_no_recuperable: `El boleto está ${ticketState.toLowerCase()} y ya no es válido.` };
    }
    const cutoff = functionRecoveryCutoff(purchase.fecha_funcion, purchase.hora_funcion);
    if (cutoff && Date.now() > cutoff.getTime()) {
      return {
        recuperable: false,
        motivo_no_recuperable: "Terminó el plazo de recuperación: han pasado más de 20 minutos desde el inicio de la función.",
      };
    }
    return { recuperable: true, motivo_no_recuperable: "" };
  }

  function reissueDemoTicket(ticketId, reason, audit = {}) {
    const storage = readStorage();
    const located = findStoredTicket(storage, ticketId);
    if (located.purchase.estado !== "PAGADA") {
      throw new SalesApiError("La venta no está pagada y no permite reemitir boletos.", 409, "VENTA_NO_REEMITIBLE");
    }
    if (located.ticket.estado !== "RESERVADO") {
      throw new SalesApiError(
        located.ticket.estado === "OCUPADO"
          ? "El boleto ya fue utilizado y no puede reemitirse."
          : "El boleto anulado o reembolsado no puede reemitirse.",
        409,
        "BOLETO_NO_REEMITIBLE"
      );
    }
    const now = new Date().toISOString();
    const reissueNumber = Number(located.ticket.numero_reemisiones || 0) + 1;
    const opaqueToken = createOpaqueToken();
    located.ticket.token_qr_demo = opaqueToken;
    located.ticket.contenido_qr = `ARATK:${opaqueToken}`;
    located.ticket.numero_reemisiones = reissueNumber;
    located.ticket.reemitido_en = now;
    located.ticket.historial_reemisiones = [
      ...(Array.isArray(located.ticket.historial_reemisiones) ? located.ticket.historial_reemisiones : []),
      { numero: reissueNumber, motivo: String(reason).trim(), fecha: now },
    ];
    appendDemoAudit(located.purchase, audit.action || "BOLETO_REEMITIDO", reason, {
      boleto_id: ticketId,
      empleado: audit.employee || "Administrador local de demostración",
    });
    writeStorage(storage);
    return {
      codigo: "BOLETO_REEMITIDO",
      mensaje: "El QR anterior quedó invalidado y se generó uno nuevo.",
      boleto: structuredClone(located.ticket),
    };
  }

  function updateDemoSaleState(saleId, reason, targetState) {
    const storage = readStorage();
    const purchase = storage.compras.find((item) => item.id === saleId);
    if (!purchase) {
      throw new SalesApiError("No se encontró la venta.", 404, "VENTA_NO_ENCONTRADA");
    }
    if (purchase.estado !== "PAGADA") {
      throw new SalesApiError("La venta ya tiene un estado final.", 409, "VENTA_ESTADO_FINAL");
    }
    if ((purchase.boletos || []).some((ticket) => ticket.estado === "OCUPADO")) {
      throw new SalesApiError(
        "La venta contiene boletos ya utilizados y requiere revisión del encargado.",
        409,
        "VENTA_CON_INGRESOS_REGISTRADOS"
      );
    }
    const now = new Date().toISOString();
    purchase.estado = targetState;
    purchase.estado_pago = targetState === "REEMBOLSADA" ? "REEMBOLSADO_DEMO" : "ANULADO_DEMO";
    purchase.actualizada_en = now;
    purchase.boletos.forEach((ticket) => {
      ticket.estado = targetState === "REEMBOLSADA" ? "REEMBOLSADO" : "ANULADO";
      ticket.anulado_en = now;
    });
    appendDemoAudit(purchase, targetState === "ANULADA" ? "VENTA_ANULADA" : "VENTA_REEMBOLSADA", reason);
    writeStorage(storage);
    return {
      codigo: targetState === "ANULADA" ? "VENTA_ANULADA" : "VENTA_REEMBOLSADA",
      mensaje: targetState === "ANULADA"
        ? "La venta y sus boletos fueron anulados."
        : "El reembolso de demostración fue registrado y los boletos quedaron invalidados.",
      compra: structuredClone(purchase),
    };
  }

  function findStoredTicket(storage, ticketId) {
    for (const purchase of storage.compras) {
      const ticket = (purchase.boletos || []).find((item) => item.id === ticketId);
      if (ticket) return { purchase, ticket };
    }
    throw new SalesApiError("No se encontró el boleto.", 404, "BOLETO_NO_ENCONTRADO");
  }

  function appendDemoAudit(purchase, action, reason, extra = {}) {
    purchase.auditoria = [
      ...(Array.isArray(purchase.auditoria) ? purchase.auditoria : []),
      {
        id: createId(),
        accion: action,
        motivo: String(reason).trim(),
        fecha: new Date().toISOString(),
        empleado: "Administrador local de demostración",
        ...extra,
      },
    ];
  }

  async function downloadAdminReceipt(saleId) {
    requireValue(saleId, "La venta es obligatoria.");
    if (isLocalPreview()) return downloadDemoReceipt(saleId);
    triggerServerDownload(routes.comprobanteAdministracion(saleId));
  }

  async function downloadAdminTicket(ticketId) {
    requireValue(ticketId, "El boleto es obligatorio.");
    if (isLocalPreview()) return printDemoTicket(ticketId);
    triggerServerDownload(routes.boletoAdministracion(ticketId));
  }

  function triggerServerDownload(url) {
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  }

  function getDemoSeatStates(functionId) {
    const reserved = [];
    const occupied = [];
    readStorage().compras.forEach((purchase) => {
      purchase.boletos.forEach((ticket) => {
        if (String(ticket.funcion_id) !== String(functionId)) return;
        if (ticket.estado === "OCUPADO") occupied.push(ticket.asiento);
        else if (ticket.estado === "RESERVADO") reserved.push(ticket.asiento);
      });
    });
    return { reservados: reserved, ocupados: occupied };
  }

  function scanDemoTicket(token) {
    const storage = readStorage();
    let foundPurchase = null;
    let foundTicket = null;

    for (const purchase of storage.compras) {
      const ticket = purchase.boletos.find((item) => item.token_qr_demo === token);
      if (ticket) {
        foundPurchase = purchase;
        foundTicket = ticket;
        break;
      }
    }

    if (!foundTicket) {
      throw new SalesApiError("El QR no pertenece a un boleto válido.", 404, "BOLETO_NO_ENCONTRADO");
    }
    if (foundTicket.estado === "OCUPADO") {
      throw new SalesApiError(
        `Este boleto ya fue utilizado el ${formatDateTime(foundTicket.escaneado_en)}.`,
        409,
        "BOLETO_YA_UTILIZADO",
        { escaneado_en: foundTicket.escaneado_en, asiento: foundTicket.asiento }
      );
    }
    if (foundTicket.estado !== "RESERVADO") {
      throw new SalesApiError("El boleto no está disponible para ingresar.", 409, "BOLETO_NO_VALIDO");
    }

    foundTicket.estado = "OCUPADO";
    foundTicket.escaneado_en = new Date().toISOString();
    writeStorage(storage);

    const pair = foundTicket.grupo_2x1_id
      ? foundPurchase.boletos.find((ticket) =>
        ticket.grupo_2x1_id === foundTicket.grupo_2x1_id && ticket.id !== foundTicket.id
      )
      : null;

    return {
      codigo: "INGRESO_REGISTRADO",
      mensaje: "Ingreso registrado correctamente.",
      boleto: buildScannerTicket(foundPurchase, foundTicket),
      pareja_2x1: pair ? {
        asiento: pair.asiento,
        estado: pair.estado,
        falta_escanear: pair.estado === "RESERVADO",
      } : null,
    };
  }

  async function downloadDemoTicketImage(ticketId) {
    const { purchase, ticket } = getPrintableDemoTicket(ticketId);
    const [qrDataUrl, logoDataUrl] = await Promise.all([
      generateQrDataUrl(ticket.contenido_qr),
      getBrandLogoDataUrl(),
    ]);
    const imageBlob = await buildTicketImage(purchase, ticket, qrDataUrl, logoDataUrl);
    await deliverTicketImage(imageBlob, `boleto-${safeFileName(ticket.numero)}.png`, ticket);
  }

  async function printDemoTicket(ticketId) {
    const { purchase, ticket } = getPrintableDemoTicket(ticketId);
    const [qrDataUrl, logoDataUrl] = await Promise.all([
      generateQrDataUrl(ticket.contenido_qr),
      getBrandLogoDataUrl(),
    ]);
    const promotion = ticket.promocion_2x1
      ? `<p><strong>Promoción 2x1:</strong> boleto ${ticket.posicion_2x1} de 2</p>`
      : "";
    const html = buildPrintableDocument(
      `Boleto ${ticket.asiento}`,
      `<main class="ticket">
        ${buildBrandHeader(logoDataUrl)}
        <p class="document-kind">BOLETO DE ENTRADA</p>
        <p class="notice">Demostración local · sin validez comercial</p>
        <img class="qr" src="${qrDataUrl}" alt="Código QR del boleto ${escapeHTML(ticket.asiento)}">
        <h2>${escapeHTML(purchase.pelicula)}</h2>
        <p class="ticket-seat">Asiento <strong>${escapeHTML(ticket.asiento)}</strong></p>
        <p><strong>Comprador:</strong> ${escapeHTML(purchase.cliente_nombre)}</p>
        <p><strong>Función:</strong> ${escapeHTML(purchase.fecha_funcion)} · ${escapeHTML(purchase.hora_funcion)}</p>
        <p><strong>Formato:</strong> ${escapeHTML(purchase.formato)} · ${escapeHTML(purchase.sala)}</p>
        ${promotion}
        ${purchase.canal === "TAQUILLA" ? `<p><strong>Venta:</strong> Taquilla</p>` : ""}
        <p><strong>Compra:</strong> ${escapeHTML(purchase.numero)}</p>
        <p><strong>Boleto:</strong> ${escapeHTML(ticket.numero)}</p>
        <p class="foot">Cada QR admite un solo ingreso. No compartas esta imagen.</p>
      </main>`
    );
    downloadHtml(html, `boleto-${safeFileName(ticket.numero)}.html`);
  }

  function getPrintableDemoTicket(ticketId) {
    const { purchase, ticket } = getDemoTicket(ticketId);
    if (ticket.estado !== "RESERVADO") {
      throw new SalesApiError(
        ticket.estado === "OCUPADO"
          ? "Este boleto ya registró el ingreso y no puede imprimirse como boleto válido."
          : "Este boleto ya no está vigente y no puede imprimirse.",
        409,
        "BOLETO_NO_IMPRIMIBLE"
      );
    }
    return { purchase, ticket };
  }

  async function downloadDemoReceipt(purchaseId) {
    const { compra: purchase } = getDemoPurchase(purchaseId);
    const logoDataUrl = await getBrandLogoDataUrl();
    const rows = purchase.boletos.map((ticket) => `
      <tr><td>${escapeHTML(ticket.asiento)}</td><td>${escapeHTML(ticket.formato)}</td><td>${ticket.promocion_2x1 ? `2x1 (${ticket.posicion_2x1}/2)` : "Normal"}</td></tr>
    `).join("");
    const html = buildPrintableDocument(
      `Comprobante ${purchase.numero}`,
      `<main>
        ${buildBrandHeader(logoDataUrl)}
        <p class="document-kind">COMPROBANTE DE COMPRA</p>
        <p class="notice">No fiscal · demostración local</p>
        <p><strong>Comprobante:</strong> ${escapeHTML(purchase.comprobante?.numero || `COMP-${purchase.numero}`)}</p>
        <p><strong>Referencia de venta:</strong> ${escapeHTML(purchase.numero)}</p>
        <p><strong>Fecha de venta:</strong> ${escapeHTML(formatDateTime(purchase.creada_en || purchase.fecha))}</p>
        <p><strong>Estado:</strong> ${escapeHTML(purchase.estado || "PAGADA")}</p>
        <p><strong>Comprador:</strong> ${escapeHTML(purchase.cliente_nombre)}</p>
        <p><strong>Película:</strong> ${escapeHTML(purchase.pelicula)}</p>
        <p><strong>Función:</strong> ${escapeHTML(purchase.fecha_funcion)} · ${escapeHTML(purchase.hora_funcion)}</p>
        <p><strong>Sala:</strong> ${escapeHTML(purchase.sala)} · ${escapeHTML(purchase.formato)}</p>
        <p><strong>Canal:</strong> ${purchase.canal === "TAQUILLA" ? "Taquilla" : "Compra en línea"}</p>
        <p><strong>Método de pago:</strong> ${escapeHTML(purchase.metodo_pago || "—")}</p>
        ${purchase.vendedor_nombre ? `<p><strong>Vendedor:</strong> ${escapeHTML(purchase.vendedor_nombre)}</p>` : ""}
        <table><thead><tr><th>Asiento</th><th>Formato</th><th>Tarifa</th></tr></thead><tbody>${rows}</tbody></table>
        <p><strong>Subtotal:</strong> ${formatMoney(purchase.subtotal)}</p>
        <p><strong>Descuento:</strong> −${formatMoney(purchase.descuento)}</p>
        <p class="total"><strong>Total:</strong> ${formatMoney(purchase.total)}</p>
        ${purchase.metodo_pago === "EFECTIVO" ? `<p><strong>Recibido:</strong> ${formatMoney(purchase.efectivo_recibido)}</p><p><strong>Cambio:</strong> ${formatMoney(purchase.cambio)}</p>` : ""}
        <p class="foot">Los boletos individuales y sus QR se descargan por separado.</p>
      </main>`
    );
    downloadHtml(html, `comprobante-${safeFileName(purchase.numero)}.html`);
  }

  async function generateQrDataUrl(content) {
    if (!global.QRCode?.toDataURL) {
      throw new SalesApiError("No fue posible cargar el generador QR.", 0, "QR_NO_DISPONIBLE");
    }
    return global.QRCode.toDataURL(content, {
      errorCorrectionLevel: "M",
      width: 220,
      margin: 2,
      color: { dark: "#050b16ff", light: "#ffffffff" },
    });
  }

  async function getBrandLogoDataUrl() {
    if (!logoDataUrlPromise) {
      logoDataUrlPromise = fetch(new URL(LOGO_RELATIVE_URL, document.baseURI), {
        credentials: "same-origin",
      })
        .then((response) => {
          if (!response.ok) throw new Error("Logo no disponible");
          return response.blob();
        })
        .then(blobToDataUrl)
        .catch(() => "");
    }
    return logoDataUrlPromise;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(reader.error), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function buildBrandHeader(logoDataUrl) {
    return logoDataUrl
      ? `<img class="brand-logo" src="${logoDataUrl}" alt="Aramacao Cinema">`
      : "<h1>Aramacao Cinema</h1>";
  }

  function buildScannerTicket(purchase, ticket) {
    return {
      id: ticket.id,
      numero: ticket.numero,
      funcion_id: ticket.funcion_id,
      estado: ticket.estado,
      escaneado_en: ticket.escaneado_en,
      comprador: purchase.cliente_nombre,
      pelicula: purchase.pelicula,
      fecha_funcion: purchase.fecha_funcion,
      hora_funcion: purchase.hora_funcion,
      sala: purchase.sala,
      formato: purchase.formato,
      asiento: ticket.asiento,
      promocion_2x1: ticket.promocion_2x1,
      posicion_2x1: ticket.posicion_2x1,
    };
  }

  function buildTicketDescription(payload, seat, hasPromotion, pairPosition) {
    const base = `${payload.pelicula || "Película"} · ${payload.fecha_funcion || ""} ${payload.hora_funcion || ""} · ${payload.formato || "2D"} · Asiento ${seat}`;
    return hasPromotion ? `${base} · 2x1 (${pairPosition} de 2)` : base;
  }

  function normalizeQrToken(value) {
    return String(value || "").trim().replace(/^ARATK:/i, "");
  }

  function validateReason(reason) {
    if (String(reason || "").trim().length < 10) {
      throw new SalesApiError("Escribe un motivo de al menos 10 caracteres.", 400, "MOTIVO_REQUERIDO");
    }
  }

  function validateRecoverySearch(criteria, value) {
    if (!new Set(["IDENTIFICACION", "NOMBRE", "USUARIO"]).has(criteria)) {
      throw new SalesApiError("Selecciona un criterio de búsqueda válido.", 400, "CRITERIO_INVALIDO");
    }
    const normalized = String(value || "").trim();
    if (criteria === "IDENTIFICACION" && !/^\d{13}$/.test(normalized.replace(/\D/g, ""))) {
      throw new SalesApiError("Escribe los 13 dígitos de la identidad.", 400, "IDENTIFICACION_INVALIDA");
    }
    if (criteria === "NOMBRE" && normalized.length < 3) {
      throw new SalesApiError("Escribe al menos 3 caracteres del nombre.", 400, "BUSQUEDA_MUY_CORTA");
    }
    if (criteria === "USUARIO" && normalized.length < 4) {
      throw new SalesApiError("Escribe al menos 4 caracteres del usuario.", 400, "BUSQUEDA_MUY_CORTA");
    }
  }

  function functionRecoveryCutoff(dateValue, timeValue) {
    const date = functionStartDate(dateValue, timeValue);
    if (!date) return null;
    date.setMinutes(date.getMinutes() + 20);
    return date;
  }

  function functionStartDate(dateValue, timeValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return null;
    const rawTime = String(timeValue || "").toLocaleLowerCase("es-HN");
    const match = rawTime.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const isPm = /p\.?\s*m\.?/.test(rawTime);
    const isAm = /a\.?\s*m\.?/.test(rawTime);
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    const date = new Date(`${dateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-06:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function currentHondurasDate() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Tegucigalpa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function isCurrentOrFuturePurchase(purchase) {
    const functionDate = String(purchase?.fecha_funcion || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(functionDate) && functionDate >= currentHondurasDate();
  }

  function comparePurchasesByFunction(left, right) {
    const leftStart = functionStartDate(left?.fecha_funcion, left?.hora_funcion)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightStart = functionStartDate(right?.fecha_funcion, right?.hora_funcion)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("es-HN");
  }

  function normalizeLookup(value) {
    return normalizeSearch(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeDateFilter(value) {
    const normalized = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function normalizeSeats(seats) {
    return [...new Set((Array.isArray(seats) ? seats : []).map((seat) =>
      String(seat || "").trim().toUpperCase()
    ).filter((seat) => /^[A-H](?:[1-9]|1[0-4])$/.test(seat)))].sort(compareSeats);
  }

  function readStorage() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(DEMO_STORAGE_KEY) || "null");
      if (parsed?.version === 1 && Array.isArray(parsed.compras)) return parsed;
    } catch {
      // Se reinicia únicamente el almacén de demostración dañado.
    }
    return { version: 1, compras: [] };
  }

  function writeStorage(storage) {
    global.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(storage));
  }

  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrfToken = readCookie("csrftoken");
      if (csrfToken) headers.set("X-CSRFToken", csrfToken);
    }

    let response;
    try {
      response = await fetch(path, { ...options, method, headers, credentials: "same-origin" });
    } catch (error) {
      throw new SalesApiError("No fue posible comunicarse con el servidor.", 0, "ERROR_CONEXION", error);
    }
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new SalesApiError(
        payload?.mensaje || "La solicitud no pudo completarse.",
        response.status,
        payload?.codigo || "ERROR_SOLICITUD",
        payload?.errores || null
      );
    }
    return payload;
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;
    if (!(response.headers.get("content-type") || "").includes("application/json")) return null;
    try { return await response.json(); } catch { return null; }
  }

  function buildIdempotencyHeaders() {
    return { "Idempotency-Key": createId() };
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  }

  function buildPrintableDocument(title, body) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHTML(title)}</title><style>
      :root{color-scheme:light;--content-width:52mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff}body{font-family:Arial,sans-serif;font-size:11px;line-height:1.35}body[data-paper="80"]{--content-width:72mm}main{width:var(--content-width);max-width:100%;margin:0 auto;padding:2.5mm 2mm;background:#fff}.ticket{text-align:center}.brand-logo{display:block;width:38mm;max-width:90%;max-height:15mm;object-fit:contain;margin:0 auto 2mm;filter:contrast(1.08)}h1{margin:0 0 2mm;font-size:17px;line-height:1.1}h2{margin:2mm 0 1.5mm;font-size:14px;line-height:1.2}p{margin:1.2mm 0}.document-kind{margin:0 0 1.5mm;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:center}.ticket-seat{margin:1.5mm 0;padding:1.5mm 1mm;border:1px solid #000;font-size:13px}.ticket-seat strong{font-size:18px}.qr{display:block;width:34mm;height:34mm;max-width:100%;margin:2mm auto;image-rendering:pixelated}.notice{margin:1.5mm 0 2mm;padding:1.5mm;border:1px dashed #000;background:#fff;font-size:10px;text-align:center}.foot{margin-top:2.5mm;padding-top:2mm;border-top:1px dashed #000;color:#222;font-size:9px}table{width:100%;border-collapse:collapse;margin:2mm 0;font-size:10px;table-layout:fixed}th,td{padding:1.3mm .6mm;border-bottom:1px solid #777;text-align:left;overflow-wrap:anywhere}.total{margin-top:2mm;padding-top:1.5mm;border-top:1px dashed #000;font-size:14px}.print-tools{display:none}@media screen{body{min-height:100vh;padding:64px 18px 18px;background:#dfe5ea}.print-tools{position:fixed;z-index:2;top:12px;left:50%;display:flex;gap:6px;align-items:center;transform:translateX(-50%);padding:6px;border-radius:10px;background:#050b16;box-shadow:0 2px 12px rgba(0,0,0,.25)}.print-tools button{min-height:34px;padding:7px 12px;border:1px solid #5a6a7a;border-radius:7px;color:#fff;background:#14283b;font:700 12px Arial,sans-serif;cursor:pointer}.print-tools button[aria-pressed="true"],.print-tools .print-primary{border-color:#ffd21c;color:#050b16;background:#ffd21c}main{box-shadow:0 2px 14px rgba(0,0,0,.18)}}@media print{@page{margin:2mm}html,body{width:100%;background:#fff}body{display:block;padding:0}main{width:var(--content-width);margin:0 auto;padding:0;box-shadow:none}.print-tools{display:none!important}}
    </style></head><body data-paper="58"><div class="print-tools" role="group" aria-label="Tamaño de papel"><button type="button" data-paper="58" aria-pressed="true">58 mm</button><button type="button" data-paper="80" aria-pressed="false">80 mm</button><button class="print-primary" type="button" data-print>Imprimir</button></div>${body}<script>(()=>{const buttons=[...document.querySelectorAll('[data-paper]')].filter((element)=>element.tagName==='BUTTON');buttons.forEach((button)=>button.addEventListener('click',()=>{document.body.dataset.paper=button.dataset.paper;buttons.forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));}));document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());})();</script></body></html>`;
  }

  async function buildTicketImage(purchase, ticket, qrDataUrl, logoDataUrl) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1900;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new SalesApiError("El navegador no pudo crear la imagen del boleto.", 0, "IMAGEN_NO_DISPONIBLE");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = "#050b16";

    let y = 58;
    if (logoDataUrl) {
      const logo = await loadCanvasImage(logoDataUrl);
      drawContainedImage(context, logo, 210, y, 660, 170);
      y += 190;
    } else {
      context.font = "700 58px Arial, sans-serif";
      context.fillText("Aramacao Cinema", canvas.width / 2, y + 40);
      y += 150;
    }

    context.font = "700 34px Arial, sans-serif";
    context.fillText("BOLETO DE ENTRADA", canvas.width / 2, y);
    y += 58;

    context.fillStyle = "#f4f6f8";
    context.fillRect(95, y, 890, 68);
    context.strokeStyle = "#050b16";
    context.lineWidth = 3;
    context.strokeRect(95, y, 890, 68);
    context.fillStyle = "#050b16";
    context.font = "26px Arial, sans-serif";
    context.fillText("Demostración local · sin validez comercial", canvas.width / 2, y + 18);
    y += 100;

    const qr = await loadCanvasImage(qrDataUrl);
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(240, y, 600, 600);
    context.drawImage(qr, 270, y + 30, 540, 540);
    context.imageSmoothingEnabled = true;
    y += 625;

    context.fillStyle = "#050b16";
    context.font = "700 48px Arial, sans-serif";
    y = drawWrappedCanvasText(context, purchase.pelicula, y, 900, 58) + 18;

    context.fillStyle = "#ffd21c";
    context.fillRect(120, y, 840, 112);
    context.strokeStyle = "#050b16";
    context.strokeRect(120, y, 840, 112);
    context.fillStyle = "#050b16";
    context.font = "700 34px Arial, sans-serif";
    context.fillText("ASIENTO", canvas.width / 2, y + 14);
    context.font = "700 54px Arial, sans-serif";
    context.fillText(String(ticket.asiento || "—"), canvas.width / 2, y + 52);
    y += 138;

    const details = [
      `Comprador: ${purchase.cliente_nombre || "Cliente"}`,
      `Función: ${purchase.fecha_funcion || "—"} · ${purchase.hora_funcion || "—"}`,
      `Formato: ${purchase.formato || "—"} · ${purchase.sala || "—"}`,
    ];
    if (ticket.promocion_2x1) {
      details.push(`Promoción 2x1: boleto ${ticket.posicion_2x1} de 2`);
    }
    if (purchase.canal === "TAQUILLA") details.push("Venta: Taquilla");

    context.font = "30px Arial, sans-serif";
    context.fillStyle = "#050b16";
    details.forEach((detail) => {
      y = drawWrappedCanvasText(context, detail, y, 920, 42) + 10;
    });

    y += 8;
    context.setLineDash([12, 10]);
    context.beginPath();
    context.moveTo(90, y);
    context.lineTo(990, y);
    context.strokeStyle = "#050b16";
    context.lineWidth = 2;
    context.stroke();
    context.setLineDash([]);
    y += 30;

    context.font = "26px Arial, sans-serif";
    y = drawWrappedCanvasText(context, `Compra: ${purchase.numero}`, y, 900, 36) + 8;
    y = drawWrappedCanvasText(context, `Boleto: ${ticket.numero}`, y, 900, 36) + 24;

    context.font = "24px Arial, sans-serif";
    context.fillStyle = "#2c3541";
    drawWrappedCanvasText(
      context,
      "Cada QR admite un solo ingreso. Presenta esta imagen completa en Control de entrada.",
      y,
      860,
      34
    );

    return canvasToPngBlob(canvas);
  }

  function drawWrappedCanvasText(context, value, y, maxWidth, lineHeight) {
    const words = expandCanvasWords(context, String(value || ""), maxWidth);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);

    lines.forEach((item, index) => {
      context.fillText(item, 540, y + (index * lineHeight));
    });
    return y + (Math.max(lines.length, 1) * lineHeight);
  }

  function expandCanvasWords(context, value, maxWidth) {
    return value.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (context.measureText(word).width <= maxWidth) return [word];
      const parts = [];
      let part = "";
      [...word].forEach((character) => {
        const candidate = `${part}${character}`;
        if (part && context.measureText(candidate).width > maxWidth) {
          parts.push(part);
          part = character;
        } else {
          part = candidate;
        }
      });
      if (part) parts.push(part);
      return parts;
    });
  }

  function drawContainedImage(context, image, x, y, width, height) {
    const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * ratio;
    const renderedHeight = image.naturalHeight * ratio;
    context.drawImage(
      image,
      x + ((width - renderedWidth) / 2),
      y + ((height - renderedHeight) / 2),
      renderedWidth,
      renderedHeight
    );
  }

  function loadCanvasImage(source) {
    return new Promise((resolve, reject) => {
      const image = new global.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new SalesApiError(
        "No fue posible preparar la imagen del boleto.",
        0,
        "IMAGEN_NO_DISPONIBLE"
      ));
      image.src = source;
    });
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new SalesApiError(
          "No fue posible convertir el boleto en una imagen.",
          0,
          "IMAGEN_NO_DISPONIBLE"
        ));
      }, "image/png");
    });
  }

  async function deliverTicketImage(blob, fileName, ticket) {
    const isTouchDevice = global.matchMedia?.("(pointer: coarse)")?.matches;
    if (isTouchDevice && global.File && global.navigator?.share && global.navigator?.canShare) {
      const file = new global.File([blob], fileName, { type: "image/png" });
      if (global.navigator.canShare({ files: [file] })) {
        try {
          await global.navigator.share({
            files: [file],
            title: `Boleto Aramacao Cinema · asiento ${ticket.asiento}`,
            text: "Guarda esta imagen para presentarla en Control de entrada.",
          });
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
    }
    downloadBlob(blob, fileName);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadHtml(html, fileName) {
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName);
  }

  function createReference(date, sequence, prefix = "ARA") {
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0"),
    ].join("");
    return `${prefix}-${stamp}-${String(sequence).padStart(3, "0")}`;
  }

  function createOpaqueToken() {
    return `${createId().replaceAll("-", "")}${createId().replaceAll("-", "")}`;
  }

  function createId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function requireValue(value, message) {
    if (!value) throw new SalesApiError(message, 400, "ERROR_VALIDACION");
  }

  function compareSeats(first, second) {
    const a = /^([A-Z]+)(\d+)$/.exec(first) || ["", first, "0"];
    const b = /^([A-Z]+)(\d+)$/.exec(second) || ["", second, "0"];
    return a[1].localeCompare(b[1]) || Number(a[2]) - Number(b[2]);
  }

  function moneyNumber(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function formatMoney(value) {
    return `L ${moneyNumber(value).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDateTime(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "fecha desconocida" : new Intl.DateTimeFormat("es-HN", {
      dateStyle: "medium", timeStyle: "short",
    }).format(date);
  }

  function safeFileName(value) {
    return String(value || "archivo").replace(/[^a-z0-9_-]+/gi, "-");
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  global.AramacaoSalesApi = Object.freeze({
    crearOrden: createOrder,
    iniciarPago: startPayment,
    registrarVentaTaquilla: registerTicketOfficeSale,
    rutaComprobanteTaquilla: ticketOfficeReceiptUrl,
    rutaBoletoTaquilla: ticketOfficeTicketUrl,
    buscarClientesRecuperacion: searchRecoveryCustomers,
    listarComprasRecuperablesCliente: listRecoveryPurchases,
    recuperarBoletoTaquilla: recoverTicketAtOffice,
    escanearBoleto: scanTicket,
    listarComprasDemo: listDemoPurchases,
    obtenerCompraDemo: getDemoPurchase,
    obtenerBoletoDemo: getDemoTicket,
    obtenerEstadosAsientosDemo: getDemoSeatStates,
    descargarBoletoDemo: downloadDemoTicketImage,
    imprimirBoletoDemo: printDemoTicket,
    descargarComprobanteDemo: downloadDemoReceipt,
    listarVentasAdministracion: listAdminSales,
    obtenerVentaAdministracion: getAdminSale,
    descargarComprobanteAdministracion: downloadAdminReceipt,
    descargarBoletoAdministracion: downloadAdminTicket,
    reemitirBoletoAdministracion: reissueAdminTicket,
    anularVentaAdministracion: annulAdminSale,
    reembolsarVentaAdministracion: refundAdminSale,
    generarQrDataUrl: generateQrDataUrl,
    esVistaLocal: isLocalPreview,
    SalesApiError,
  });
})(window);
