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
    escanearBoleto: () => `${API_ROOT}/taquilla/boletos/escanear/`,
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
      cliente_nombre: String(payload.cliente_nombre || "Cliente de prueba"),
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

  async function downloadDemoTicket(ticketId) {
    const { purchase, ticket } = getDemoTicket(ticketId);
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
        <p class="notice">Boleto de demostración local</p>
        <img class="qr" src="${qrDataUrl}" alt="Código QR del boleto ${escapeHTML(ticket.asiento)}">
        <h2>${escapeHTML(purchase.pelicula)}</h2>
        <p><strong>Comprador:</strong> ${escapeHTML(purchase.cliente_nombre)}</p>
        <p><strong>Función:</strong> ${escapeHTML(purchase.fecha_funcion)} · ${escapeHTML(purchase.hora_funcion)}</p>
        <p><strong>Formato:</strong> ${escapeHTML(purchase.formato)} · ${escapeHTML(purchase.sala)}</p>
        <p><strong>Asiento:</strong> ${escapeHTML(ticket.asiento)}</p>
        ${promotion}
        ${purchase.canal === "TAQUILLA" ? `<p><strong>Venta:</strong> Taquilla</p>` : ""}
        <p><strong>Boleto:</strong> ${escapeHTML(ticket.numero)}</p>
        <p class="foot">Cada QR admite un solo ingreso. No compartas esta imagen.</p>
      </main>`
    );
    downloadHtml(html, `boleto-${safeFileName(ticket.numero)}.html`);
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
        <p class="notice">Comprobante de compra no fiscal · demostración local</p>
        <p><strong>Referencia:</strong> ${escapeHTML(purchase.numero)}</p>
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
      :root{color-scheme:light}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff}body{font-family:Arial,sans-serif;font-size:11px;line-height:1.35}main{width:52mm;max-width:100%;margin:0 auto;padding:2.5mm 2mm;background:#fff}.ticket{text-align:center}.brand-logo{display:block;width:38mm;max-width:90%;max-height:15mm;object-fit:contain;margin:0 auto 2mm;filter:contrast(1.08)}h1{margin:0 0 2mm;font-size:17px;line-height:1.1}h2{margin:2mm 0 1.5mm;font-size:14px;line-height:1.2}p{margin:1.2mm 0}.qr{display:block;width:34mm;height:34mm;max-width:100%;margin:2mm auto;image-rendering:pixelated}.notice{margin:1.5mm 0 2mm;padding:1.5mm;border:1px dashed #000;background:#fff;font-size:10px}.foot{margin-top:2.5mm;padding-top:2mm;border-top:1px dashed #000;color:#222;font-size:9px}table{width:100%;border-collapse:collapse;margin:2mm 0;font-size:10px;table-layout:fixed}th,td{padding:1.3mm .6mm;border-bottom:1px solid #777;text-align:left;overflow-wrap:anywhere}.total{margin-top:2mm;padding-top:1.5mm;border-top:1px dashed #000;font-size:14px}@media screen{body{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:18px;background:#dfe5ea}main{box-shadow:0 2px 14px rgba(0,0,0,.18)}}@media print{@page{margin:2mm}html,body{width:100%;background:#fff}body{display:block;padding:0}main{width:52mm;margin:0 auto;padding:0;box-shadow:none}}
    </style></head><body>${body}</body></html>`;
  }

  function downloadHtml(html, fileName) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    escanearBoleto: scanTicket,
    listarComprasDemo: listDemoPurchases,
    obtenerCompraDemo: getDemoPurchase,
    obtenerBoletoDemo: getDemoTicket,
    obtenerEstadosAsientosDemo: getDemoSeatStates,
    descargarBoletoDemo: downloadDemoTicket,
    descargarComprobanteDemo: downloadDemoReceipt,
    generarQrDataUrl: generateQrDataUrl,
    esVistaLocal: isLocalPreview,
    SalesApiError,
  });
})(window);
