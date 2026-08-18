"use strict";

/*
 * ADAPTADOR DE AFORO Y BLOQUEOS
 * -----------------------------
 * La interfaz llama únicamente a estas funciones. Cuando Django esté listo,
 * si alguna ruta cambia se corrige aquí y no en toda la página de compra.
 *
 * En localhost se usa sessionStorage solo para demostrar un bloqueo de
 * 10 minutos. No crea ventas, pagos, boletos ni disponibilidad real.
 */
(function exposeSeatApi(global) {
  const API_ROOT = "/api/v1";
  const BLOCK_SECONDS = 600;
  const DEMO_STORAGE_PREFIX = "aramacao-demo-bloqueo:";

  const routes = Object.freeze({
    disponibilidad: (functionId) =>
      `${API_ROOT}/cartelera/funciones/${encodeURIComponent(functionId)}/asientos/`,
    crearBloqueo: () => `${API_ROOT}/compras/bloqueos/`,
    liberarBloqueo: (blockId) =>
      `${API_ROOT}/compras/bloqueos/${encodeURIComponent(blockId)}/`,
  });

  class SeatApiError extends Error {
    constructor(message, status = 0, code = "ERROR_CONEXION", details = null) {
      super(message);
      this.name = "SeatApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function isLocalPreview() {
    return ["localhost", "127.0.0.1", "[::1]"].includes(global.location.hostname);
  }

  async function getAvailability(functionId, context = {}) {
    requireFunctionId(functionId);
    if (isLocalPreview()) return buildDemoAvailability(functionId, context);
    return request(routes.disponibilidad(functionId));
  }

  async function createBlock(functionId, seats, context = {}) {
    requireFunctionId(functionId);
    const normalizedSeats = normalizeSeatCodes(seats);
    if (!normalizedSeats.length) {
      throw new SeatApiError(
        "Selecciona al menos un asiento.",
        400,
        "ERROR_VALIDACION",
        { asientos: ["Selecciona al menos un asiento."] }
      );
    }

    if (isLocalPreview()) return createDemoBlock(functionId, normalizedSeats, context);

    return request(routes.crearBloqueo(), {
      method: "POST",
      body: JSON.stringify({
        funcion_id: functionId,
        asientos: normalizedSeats,
      }),
    });
  }

  async function releaseBlock(blockId) {
    if (!blockId) return;
    if (isLocalPreview()) {
      removeDemoBlockById(blockId);
      return { liberado: true };
    }

    return request(routes.liberarBloqueo(blockId), { method: "DELETE" });
  }

  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrfToken = readCookie("csrftoken");
      if (csrfToken) headers.set("X-CSRFToken", csrfToken);
    }

    let response;
    try {
      response = await fetch(path, {
        ...options,
        method,
        headers,
        credentials: "same-origin",
      });
    } catch (error) {
      throw new SeatApiError(
        "No fue posible comunicarse con el servidor.",
        0,
        "ERROR_CONEXION",
        error
      );
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new SeatApiError(
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
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function buildDemoAvailability(functionId, context) {
    const currentBlock = readDemoBlock(functionId);
    const start = buildHondurasDateTime(context.fecha, context.hora);
    const saleUntil = new Date(start.getTime() + 20 * 60 * 1000);

    return {
      funcion_id: functionId,
      hora_inicio: toHondurasIso(start),
      venta_hasta: toHondurasIso(saleUntil),
      venta_disponible: true,
      bloqueo_temporal_segundos: BLOCK_SECONDS,
      sala: {
        nombre: "Sala 1",
        aforo_total: 112,
        pasillo_despues_del_asiento: 7,
        distribucion: buildOfficialDistribution(),
      },
      asientos_bloqueados_temporalmente: ["B8", "B9"],
      asientos_reservados: ["C1", "C2"],
      asientos_ocupados: ["D1"],
      mi_bloqueo: currentBlock,
    };
  }

  function createDemoBlock(functionId, seats, context) {
    const availability = buildDemoAvailability(functionId, context);
    const unavailable = new Set([
      ...availability.asientos_bloqueados_temporalmente,
      ...availability.asientos_reservados,
      ...availability.asientos_ocupados,
    ]);

    const invalidSeat = seats.find((seat) => !isOfficialSeat(seat));
    if (invalidSeat) {
      throw new SeatApiError(
        `El asiento ${invalidSeat} no pertenece a Sala 1.`,
        400,
        "ASIENTO_INVALIDO",
        { asientos: [invalidSeat] }
      );
    }

    const conflict = seats.find((seat) => unavailable.has(seat));
    if (conflict) {
      throw new SeatApiError(
        `El asiento ${conflict} ya no está disponible.`,
        409,
        "ASIENTO_NO_DISPONIBLE",
        { asientos: [conflict] }
      );
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + BLOCK_SECONDS * 1000);
    const block = {
      id: createId(),
      funcion_id: functionId,
      asientos: seats,
      estado: "ACTIVO",
      creado_en: toHondurasIso(createdAt),
      expira_en: toHondurasIso(expiresAt),
      segundos_restantes: BLOCK_SECONDS,
    };

    global.sessionStorage.setItem(storageKey(functionId), JSON.stringify(block));
    return structuredClone(block);
  }

  function readDemoBlock(functionId) {
    const raw = global.sessionStorage.getItem(storageKey(functionId));
    if (!raw) return null;

    try {
      const block = JSON.parse(raw);
      const remaining = secondsUntil(block.expira_en);
      if (remaining <= 0) {
        global.sessionStorage.removeItem(storageKey(functionId));
        return null;
      }
      return { ...block, segundos_restantes: remaining };
    } catch {
      global.sessionStorage.removeItem(storageKey(functionId));
      return null;
    }
  }

  function removeDemoBlockById(blockId) {
    for (let index = global.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = global.sessionStorage.key(index);
      if (!key?.startsWith(DEMO_STORAGE_PREFIX)) continue;
      try {
        const value = JSON.parse(global.sessionStorage.getItem(key));
        if (value?.id === blockId) global.sessionStorage.removeItem(key);
      } catch {
        global.sessionStorage.removeItem(key);
      }
    }
  }

  function buildOfficialDistribution() {
    return ["A", "B", "C", "D", "E", "F", "G", "H"].map((row) => ({
      fila: row,
      asientos: Array.from({ length: 14 }, (_, index) => index + 1),
    }));
  }

  function normalizeSeatCodes(seats) {
    return [...new Set((Array.isArray(seats) ? seats : []).map((seat) =>
      String(seat || "").trim().toUpperCase()
    ).filter(Boolean))].sort(compareSeats);
  }

  function isOfficialSeat(seat) {
    const match = /^([A-H])(\d{1,2})$/.exec(seat);
    return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 14);
  }

  function compareSeats(first, second) {
    const firstMatch = /^([A-Z]+)(\d+)$/.exec(first) || ["", first, "0"];
    const secondMatch = /^([A-Z]+)(\d+)$/.exec(second) || ["", second, "0"];
    return firstMatch[1].localeCompare(secondMatch[1]) ||
      Number(firstMatch[2]) - Number(secondMatch[2]);
  }

  function requireFunctionId(functionId) {
    if (!functionId) {
      throw new SeatApiError(
        "Selecciona una función.",
        400,
        "FUNCION_REQUERIDA"
      );
    }
  }

  function storageKey(functionId) {
    return `${DEMO_STORAGE_PREFIX}${functionId}`;
  }

  function createId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function secondsUntil(value) {
    const expiration = parseDateTime(value);
    if (!expiration) return 0;
    return Math.max(0, Math.ceil((expiration.getTime() - Date.now()) / 1000));
  }

  function buildHondurasDateTime(dateValue, timeValue) {
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))
      ? dateValue
      : toLocalIsoDate(new Date());
    const safeTime = /^\d{2}:\d{2}$/.test(String(timeValue || ""))
      ? timeValue
      : "19:00";
    return new Date(`${safeDate}T${safeTime}:00-06:00`);
  }

  function parseDateTime(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function toHondurasIso(date) {
    const shifted = new Date(date.getTime() - 6 * 60 * 60 * 1000);
    return `${shifted.toISOString().slice(0, 19)}-06:00`;
  }

  function toLocalIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  }

  global.AramacaoSeatApi = Object.freeze({
    consultarDisponibilidad: getAvailability,
    crearBloqueo: createBlock,
    liberarBloqueo: releaseBlock,
    esVistaLocal: isLocalPreview,
    SeatApiError,
  });
})(window);
