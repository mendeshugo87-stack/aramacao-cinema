"use strict";

/*
 * COMPRA EN LÍNEA: FUNCIÓN, ASIENTOS Y BLOQUEO TEMPORAL
 * ------------------------------------------------------
 * Comparte las reglas de Sala 1 y 2x1 utilizadas por Taquilla. La API real
 * de disponibilidad queda aislada en seat-api.js para facilitar la conexión
 * con Django. Esta etapa todavía no cobra ni genera boletos.
 */
const DATA_URL = "../../assets/data/cartelera.json";
const DEMO_SALES_STORAGE_KEY = "aramacao-demo-ventas-v1";
const AVAILABILITY_REFRESH_MS = 5000;

const state = {
  data: null,
  selectedMovie: null,
  selectedDate: "",
  selectedShowtime: null,
  selectedSeats: new Set(),
  seatPairs: new Map(),
  statuses: new Map(),
  distribution: [],
  currentBlock: null,
  blockTimer: null,
  availabilityRefreshPending: false,
  availabilityRefreshQueued: false,
};

const elements = {
  localNotice: document.querySelector("#local-preview-notice"),
  movieSelect: document.querySelector("#purchase-movie"),
  dateInput: document.querySelector("#purchase-date"),
  showtimes: document.querySelector("#purchase-showtimes"),
  promotion: document.querySelector("#purchase-promotion"),
  promotionStatus: document.querySelector("#purchase-promotion-status"),
  seatMap: document.querySelector("#purchase-seat-map"),
  seatInstruction: document.querySelector("#seat-instruction"),
  seatCount: document.querySelector("#seat-count"),
  summaryMovie: document.querySelector("#summary-movie"),
  summaryDate: document.querySelector("#summary-date"),
  summaryShowtime: document.querySelector("#summary-showtime"),
  summaryRoom: document.querySelector("#summary-room"),
  summaryFormat: document.querySelector("#summary-format"),
  summarySeats: document.querySelector("#summary-seats"),
  summaryAdmissions: document.querySelector("#summary-admissions"),
  summarySubtotal: document.querySelector("#summary-subtotal"),
  summaryDiscount: document.querySelector("#summary-discount"),
  summaryTotal: document.querySelector("#summary-total"),
  blockStatus: document.querySelector("#block-status"),
  blockCountdown: document.querySelector("#block-countdown"),
  error: document.querySelector("#purchase-error"),
  status: document.querySelector("#purchase-status"),
  continueButton: document.querySelector("#continue-purchase"),
  releaseButton: document.querySelector("#release-block"),
};

document.addEventListener("DOMContentLoaded", initializePurchase);

async function initializePurchase() {
  bindEvents();
  startAvailabilitySynchronization();
  configureDate();
  renderEmptySeatMap("Selecciona una función para consultar los asientos.");

  try {
    await requireCustomerSession();
    state.data = await window.CinemaStore.getData(DATA_URL);
    populateMovies();
    applyQuerySelection();
    renderShowtimes(true);
    updatePromotion();
    updateSummary();
  } catch (error) {
    console.error("No se pudo iniciar la compra:", error);
    showError(getErrorMessage(error));
  }
}

function bindEvents() {
  elements.movieSelect.addEventListener("change", async () => {
    await releaseCurrentBlock({ silent: true });
    state.selectedMovie = findMovie(elements.movieSelect.value);
    state.selectedShowtime = null;
    clearSeatSelection();
    renderShowtimes(true);
    updateQuery();
    updatePromotion();
    updateSummary();
    showError("");
  });

  elements.dateInput.addEventListener("change", async () => {
    await releaseCurrentBlock({ silent: true });
    state.selectedDate = elements.dateInput.value;
    state.selectedShowtime = null;
    clearSeatSelection();
    renderShowtimes(true);
    updateQuery();
    updatePromotion();
    updateSummary();
    showError("");
  });

  elements.showtimes.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-showtime-id]");
    if (!button || button.disabled) return;
    const showtime = getShowtimes().find((item) => item.id === button.dataset.showtimeId);
    await selectShowtime(showtime);
  });

  elements.seatMap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-seat]");
    if (!button || button.disabled || state.currentBlock) return;
    toggleSeat(button.dataset.seat);
  });

  elements.continueButton.addEventListener("click", createTemporaryBlock);
  elements.releaseButton.addEventListener("click", () => releaseCurrentBlock());

  window.addEventListener("storage", (event) => {
    if (event.key === DEMO_SALES_STORAGE_KEY) refreshCurrentAvailability();
  });
  window.addEventListener("focus", refreshCurrentAvailability);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshCurrentAvailability();
  });
}

function startAvailabilitySynchronization() {
  window.setInterval(() => {
    if (!document.hidden) refreshCurrentAvailability();
  }, AVAILABILITY_REFRESH_MS);
}

async function requireCustomerSession() {
  if (window.AramacaoSeatApi.esVistaLocal()) {
    elements.localNotice.hidden = false;
    return;
  }

  const response = await window.AramacaoCustomerApi.obtenerSesionActual();
  if (!response?.autenticado || !response?.cliente) {
    redirectToLogin();
    throw new Error("Debes iniciar sesión para continuar la compra.");
  }
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  const login = new URL("../cuenta/iniciar-sesion.html", window.location.href);
  login.searchParams.set("next", next);
  copyPurchaseParameters(login.searchParams);
  window.location.replace(login.href);
}

function configureDate() {
  const today = toLocalISODate(new Date());
  elements.dateInput.min = today;
  elements.dateInput.value = today;
  state.selectedDate = today;
}

function populateMovies() {
  const movies = getCurrentMovies();
  elements.movieSelect.innerHTML = [
    '<option value="">Selecciona una película</option>',
    ...movies.map((movie) =>
      `<option value="${escapeHTML(movie.id)}">${escapeHTML(movie.title || movie.titulo || "Película")}</option>`
    ),
  ].join("");
}

function applyQuerySelection() {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get("movie") || "";
  const requestedDate = params.get("date") || "";

  if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    state.selectedDate = requestedDate;
    elements.dateInput.value = requestedDate;
  }

  state.selectedMovie = findMovie(movieId);
  if (state.selectedMovie) elements.movieSelect.value = state.selectedMovie.id;

  if (!state.selectedMovie) {
    const firstMovie = getCurrentMovies().find((movie) =>
      (movie.funciones || []).some((showtime) => showtime.fecha === state.selectedDate)
    );
    if (firstMovie) {
      state.selectedMovie = firstMovie;
      elements.movieSelect.value = firstMovie.id;
    }
  }
}

function renderShowtimes(autoSelectRequested = false) {
  const showtimes = getShowtimes();
  if (!state.selectedMovie || !state.selectedDate) {
    elements.showtimes.innerHTML = '<p class="empty-inline">Selecciona película y fecha.</p>';
    return;
  }

  if (!showtimes.length) {
    elements.showtimes.innerHTML = '<p class="empty-inline">No hay funciones para esta fecha.</p>';
    renderEmptySeatMap("No hay una función disponible para mostrar asientos.");
    return;
  }

  const requestedTime = new URLSearchParams(window.location.search).get("time") || "";
  const requestedFunction = new URLSearchParams(window.location.search).get("function") || "";
  elements.showtimes.innerHTML = showtimes.map((showtime) => `
    <button
      class="purchase-showtime${state.selectedShowtime?.id === showtime.id ? " selected" : ""}"
      type="button"
      data-showtime-id="${escapeHTML(showtime.id)}"
    >
      ${escapeHTML(showtime.time)}
      <small>${escapeHTML(showtime.format)} · ${formatMoney(showtime.price)}</small>
    </button>
  `).join("");

  if (autoSelectRequested && !state.selectedShowtime) {
    const requested = showtimes.find((showtime) =>
      showtime.id === requestedFunction || showtime.rawTime === requestedTime || showtime.time === requestedTime
    );
    if (requested) selectShowtime(requested);
  }
}

async function selectShowtime(showtime) {
  if (!showtime) return;
  await releaseCurrentBlock({ silent: true });
  state.selectedShowtime = showtime;
  clearSeatSelection();
  renderShowtimes(false);
  updateQuery();
  updatePromotion();
  updateSummary();
  showError("");
  showStatus("Consultando la disponibilidad de Sala 1…");

  await refreshCurrentAvailability({ initial: true });
}

async function refreshCurrentAvailability({ initial = false } = {}) {
  const selectedShowtime = state.selectedShowtime;
  if (!selectedShowtime) return;
  if (state.availabilityRefreshPending) {
    state.availabilityRefreshQueued = true;
    return;
  }

  state.availabilityRefreshPending = true;
  try {
    const availability = await window.AramacaoSeatApi.consultarDisponibilidad(
      selectedShowtime.id,
      { fecha: state.selectedDate, hora: selectedShowtime.rawTime }
    );
    if (String(state.selectedShowtime?.id || "") !== String(selectedShowtime.id)) return;
    applyAvailability(availability);
    if (initial) showStatus("");
  } catch (error) {
    if (initial) renderEmptySeatMap("No fue posible consultar los asientos.");
    if (initial) showStatus("");
    showError(getErrorMessage(error));
  } finally {
    state.availabilityRefreshPending = false;
    const refreshAgain = state.availabilityRefreshQueued
      || (state.selectedShowtime && String(state.selectedShowtime.id) !== String(selectedShowtime.id));
    state.availabilityRefreshQueued = false;
    if (refreshAgain) {
      refreshCurrentAvailability({ initial: true });
    }
  }
}

function applyAvailability(availability) {
  state.distribution = normalizeDistribution(availability?.sala?.distribucion);
  state.statuses.clear();

  addStatuses(availability?.asientos_bloqueados_temporalmente, "blocked");
  addStatuses(availability?.asientos_reservados, "reserved");
  addStatuses(availability?.asientos_ocupados, "occupied");

  const conflicts = [...state.selectedSeats].filter((seat) =>
    ["blocked", "reserved", "occupied"].includes(state.statuses.get(seat))
  );

  const ownBlock = availability?.mi_bloqueo;
  if (ownBlock?.id && Array.isArray(ownBlock.asientos)) {
    state.currentBlock = ownBlock;
    state.selectedSeats = new Set(ownBlock.asientos);
    ownBlock.asientos.forEach((seat) => state.statuses.set(seat, "mine"));
    startBlockCountdown();
  } else {
    if (state.currentBlock) {
      stopBlockCountdown();
      state.currentBlock = null;
    }
    if (conflicts.length) {
      state.selectedSeats.clear();
      state.seatPairs.clear();
      showError(`La disponibilidad cambió. ${conflicts.join(", ")} ya no está disponible; vuelve a seleccionar.`);
    }
  }

  renderSeatMap();
  updateBlockUI();
  updateSummary();
}

function normalizeDistribution(distribution) {
  if (Array.isArray(distribution) && distribution.length) {
    return distribution.map((row) => ({
      row: String(row.fila || row.row || "").toUpperCase(),
      seats: (row.asientos || row.seats || []).map(Number).filter(Number.isFinite),
    })).filter((row) => row.row && row.seats.length);
  }

  return ["A", "B", "C", "D", "E", "F", "G", "H"].map((row) => ({
    row,
    seats: Array.from({ length: 14 }, (_, index) => index + 1),
  }));
}

function addStatuses(seats, status) {
  (Array.isArray(seats) ? seats : []).forEach((item) => {
    const code = typeof item === "string" ? item : item?.codigo || item?.asiento;
    if (code) state.statuses.set(String(code).toUpperCase(), status);
  });
}

function renderSeatMap() {
  if (!state.selectedShowtime) {
    renderEmptySeatMap("Selecciona una función para consultar los asientos.");
    return;
  }

  const fragments = [];
  state.distribution.forEach(({ row, seats }) => {
    fragments.push(`<span class="row-label" aria-hidden="true">${escapeHTML(row)}</span>`);
    seats.forEach((number) => {
      const seat = `${row}${number}`;
      const status = state.statuses.get(seat) || "available";
      const selected = state.selectedSeats.has(seat);
      const unavailable = ["blocked", "reserved", "occupied", "mine"].includes(status);
      const label = getSeatStatusLabel(status, selected);

      if (number === 8) fragments.push('<span class="seat-aisle" aria-hidden="true"></span>');

      fragments.push(`
        <button
          class="purchase-seat ${escapeHTML(status)}${selected && status === "available" ? " selected" : ""}"
          type="button"
          data-seat="${escapeHTML(seat)}"
          aria-label="Asiento ${escapeHTML(seat)}, ${escapeHTML(label)}"
          aria-pressed="${selected}"
          ${unavailable ? "disabled" : ""}
        >${number}</button>
      `);
    });
  });

  elements.seatMap.innerHTML = fragments.join("");
  elements.seatInstruction.textContent = state.currentBlock
    ? "Tus asientos están apartados temporalmente mientras continúas al pago."
    : `${state.selectedShowtime.time} · Sala 1. Seleccionar todavía no reserva el asiento.`;
}

function renderEmptySeatMap(message) {
  elements.seatMap.innerHTML = `<p class="seat-map-message">${escapeHTML(message)}</p>`;
  elements.seatInstruction.textContent = message;
}

function toggleSeat(seat) {
  if (isPromotionAvailable()) {
    if (state.selectedSeats.has(seat)) {
      removePromotionPair(seat);
    } else {
      const pairedSeat = findAvailablePairSeat(seat);
      if (!pairedSeat) {
        showError("No hay dos asientos contiguos disponibles en ese lugar. Selecciona otro asiento.");
        return;
      }

      state.selectedSeats.add(seat);
      state.selectedSeats.add(pairedSeat);
      state.seatPairs.set(seat, pairedSeat);
      state.seatPairs.set(pairedSeat, seat);
      showStatus(`2x1: se seleccionaron los asientos ${seat} y ${pairedSeat}.`);
    }
  } else if (state.selectedSeats.has(seat)) {
    state.selectedSeats.delete(seat);
  } else {
    state.selectedSeats.add(seat);
  }

  renderSeatMap();
  updateSummary();
  showError("");
}

function removePromotionPair(seat) {
  const pairedSeat = state.seatPairs.get(seat);
  state.selectedSeats.delete(seat);
  state.seatPairs.delete(seat);

  if (pairedSeat) {
    state.selectedSeats.delete(pairedSeat);
    state.seatPairs.delete(pairedSeat);
  }

  showStatus("");
}

function findAvailablePairSeat(seat) {
  const match = /^([A-H])(\d{1,2})$/.exec(String(seat || ""));
  if (!match) return "";

  const row = match[1];
  const number = Number(match[2]);
  const firstSeat = number <= 7 ? 1 : 8;
  const lastSeat = number <= 7 ? 7 : 14;
  const candidates = [number + 1, number - 1]
    .filter((candidate) => candidate >= firstSeat && candidate <= lastSeat)
    .map((candidate) => `${row}${candidate}`);

  return candidates.find((candidate) =>
    !state.selectedSeats.has(candidate) &&
    (state.statuses.get(candidate) || "available") === "available"
  ) || "";
}

async function createTemporaryBlock() {
  showError("");
  showStatus("");
  if (!state.selectedShowtime) {
    showError("Selecciona una función.");
    return;
  }
  if (!state.selectedSeats.size) {
    showError("Selecciona al menos un asiento.");
    return;
  }

  if (isPromotionAvailable() && state.selectedSeats.size % 2 !== 0) {
    showError("La promoción 2x1 requiere seleccionar los asientos en pares.");
    return;
  }

  setBusy(true);
  try {
    const block = await window.AramacaoSeatApi.crearBloqueo(
      state.selectedShowtime.id,
      [...state.selectedSeats].sort(compareSeats),
      { fecha: state.selectedDate, hora: state.selectedShowtime.rawTime }
    );
    state.currentBlock = block;
    block.asientos.forEach((seat) => state.statuses.set(seat, "mine"));
    startBlockCountdown();
    updateBlockUI();
    renderSeatMap();
    showStatus("Asientos apartados durante 10 minutos. El formulario de pago se conectará en la siguiente etapa.");
  } catch (error) {
    showError(getErrorMessage(error));
    if (error?.code === "ASIENTO_NO_DISPONIBLE") {
      await selectShowtime(state.selectedShowtime);
    }
  } finally {
    setBusy(false);
  }
}

async function releaseCurrentBlock(options = {}) {
  if (!state.currentBlock?.id) return;
  const block = state.currentBlock;
  stopBlockCountdown();

  try {
    await window.AramacaoSeatApi.liberarBloqueo(block.id);
  } catch (error) {
    if (!options.silent) {
      showError(getErrorMessage(error));
      return;
    }
  }

  block.asientos?.forEach((seat) => state.statuses.delete(seat));
  state.currentBlock = null;
  clearSeatSelection();
  updateBlockUI();
  renderSeatMap();
  updateSummary();
  if (!options.silent) showStatus("Los asientos fueron liberados.");
}

function startBlockCountdown() {
  stopBlockCountdown();
  updateCountdown();
  state.blockTimer = window.setInterval(updateCountdown, 1000);
}

function stopBlockCountdown() {
  if (state.blockTimer) window.clearInterval(state.blockTimer);
  state.blockTimer = null;
}

function updateCountdown() {
  if (!state.currentBlock) return;
  const remaining = getRemainingSeconds(state.currentBlock);
  elements.blockCountdown.textContent = formatCountdown(remaining);

  if (remaining <= 0) {
    const expiredSeats = [...state.selectedSeats];
    stopBlockCountdown();
    state.currentBlock = null;
    expiredSeats.forEach((seat) => state.statuses.delete(seat));
    clearSeatSelection();
    updateBlockUI();
    renderSeatMap();
    updateSummary();
    showStatus("");
    showError("El bloqueo expiró. Vuelve a seleccionar los asientos.");
  }
}

function updateBlockUI() {
  const hasBlock = Boolean(state.currentBlock?.id);
  elements.blockStatus.hidden = !hasBlock;
  elements.releaseButton.hidden = !hasBlock;
  elements.continueButton.hidden = hasBlock;
  updateContinueButton();
}

function updatePromotion() {
  const available = isPromotionAvailable();
  elements.promotion.classList.toggle("active", available);
  if (!state.selectedMovie || !state.selectedShowtime) {
    elements.promotionStatus.textContent = "Selecciona una función para consultar la promoción.";
  } else if (available) {
    elements.promotionStatus.textContent = "2x1 activo. Elige un asiento y se seleccionará automáticamente otro contiguo.";
  } else {
    elements.promotionStatus.textContent = "Esta función no tiene promoción activa.";
  }
}

function isPromotionAvailable() {
  const promotion = state.data?.promotion;
  const selectedDate = state.selectedDate;
  const weekday = selectedDate ? parseLocalDate(selectedDate).getDay() : -1;
  const correctFunction = promotion?.appliesTo !== "especificas" ||
    promotion.functionIds?.includes(state.selectedShowtime?.id);

  return Boolean(
    promotion?.enabled &&
    state.selectedMovie &&
    state.selectedShowtime &&
    promotion.movieIds?.includes(state.selectedMovie.id) &&
    promotion.startDate &&
    promotion.endDate &&
    selectedDate >= promotion.startDate &&
    selectedDate <= promotion.endDate &&
    promotion.allowedWeekdays?.includes(weekday) &&
    correctFunction
  );
}

function calculateTotals() {
  const admissions = state.selectedSeats.size;
  const unitPrice = Number(state.selectedShowtime?.price || 0);
  const freeAdmissions = isPromotionAvailable() ? Math.floor(admissions / 2) : 0;
  const subtotal = admissions * unitPrice;
  const discount = freeAdmissions * unitPrice;
  return { admissions, subtotal, discount, total: subtotal - discount };
}

function updateSummary() {
  const totals = calculateTotals();
  const seats = [...state.selectedSeats].sort(compareSeats);
  elements.summaryMovie.textContent = getMovieTitle(state.selectedMovie) || "Sin seleccionar";
  elements.summaryDate.textContent = state.selectedDate ? formatDate(state.selectedDate) : "Sin seleccionar";
  elements.summaryShowtime.textContent = state.selectedShowtime?.time || "Sin seleccionar";
  elements.summaryRoom.textContent = state.selectedShowtime?.room || "Sala 1";
  elements.summaryFormat.textContent = state.selectedShowtime?.format || "—";
  elements.summarySeats.textContent = seats.length ? seats.join(", ") : "Ninguno";
  elements.summaryAdmissions.textContent = String(totals.admissions);
  elements.summarySubtotal.textContent = formatMoney(totals.subtotal);
  elements.summaryDiscount.textContent = `−${formatMoney(totals.discount)}`;
  elements.summaryTotal.textContent = formatMoney(totals.total);
  elements.seatCount.textContent = `${totals.admissions} seleccionado${totals.admissions === 1 ? "" : "s"}`;
  updateContinueButton();
}

function updateContinueButton() {
  elements.continueButton.disabled = Boolean(
    !state.selectedShowtime || !state.selectedSeats.size || state.currentBlock
  );
}

function setBusy(busy) {
  elements.continueButton.disabled = busy || !state.selectedSeats.size;
  elements.continueButton.textContent = busy
    ? "Apartando asientos…"
    : "Apartar asientos y continuar";
}

function clearSeatSelection() {
  state.selectedSeats.clear();
  state.seatPairs.clear();
  state.statuses.clear();
  state.distribution = [];
  renderEmptySeatMap(state.selectedShowtime
    ? "Consultando disponibilidad…"
    : "Selecciona una función para consultar los asientos.");
}

function getCurrentMovies() {
  return (state.data?.movies || []).filter((movie) => {
    const section = String(movie.section || movie.seccion || "").toUpperCase();
    return (section === "CARTELERA" || (!section && movie.published !== false)) &&
      movie.publicada !== false && movie.published !== false;
  });
}

function findMovie(movieId) {
  return getCurrentMovies().find((movie) => String(movie.id) === String(movieId)) || null;
}

function getShowtimes() {
  if (!state.selectedMovie || !state.selectedDate) return [];
  return (state.selectedMovie.funciones || [])
    .filter((showtime) => showtime.fecha === state.selectedDate)
    .sort((first, second) => first.hora.localeCompare(second.hora))
    .map((showtime) => ({
      id: String(showtime.id),
      rawTime: showtime.hora,
      time: formatTimeForDisplay(showtime.hora),
      room: "Sala 1",
      format: showtime.formato || "2D",
      price: Number(showtime.precio || 0),
    }));
}

function getMovieTitle(movie) {
  return movie?.title || movie?.titulo || "";
}

function updateQuery() {
  const url = new URL(window.location.href);
  setOrDelete(url.searchParams, "movie", state.selectedMovie?.id);
  setOrDelete(url.searchParams, "date", state.selectedDate);
  setOrDelete(url.searchParams, "time", state.selectedShowtime?.rawTime);
  setOrDelete(url.searchParams, "function", state.selectedShowtime?.id);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function setOrDelete(params, name, value) {
  if (value) params.set(name, value);
  else params.delete(name);
}

function copyPurchaseParameters(target) {
  const source = new URLSearchParams(window.location.search);
  ["movie", "date", "time", "function"].forEach((name) => {
    if (source.has(name)) target.set(name, source.get(name));
  });
}

function getSeatStatusLabel(status, selected) {
  if (status === "mine") return "apartado para esta compra";
  if (status === "blocked") return "en proceso de compra, apartado temporalmente";
  if (status === "reserved") return "reservado, pago confirmado";
  if (status === "occupied") return "ocupado, boleto escaneado";
  if (selected) return "seleccionado";
  return "disponible";
}

function getRemainingSeconds(block) {
  const expiration = new Date(block.expira_en || block.expires_at || "");
  if (!Number.isNaN(expiration.getTime())) {
    return Math.max(0, Math.ceil((expiration.getTime() - Date.now()) / 1000));
  }
  return Math.max(0, Number(block.segundos_restantes || 0));
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimeForDisplay(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return String(value || "");
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "p. m." : "a. m."}`;
}

function formatMoney(value) {
  return `L ${Number(value || 0).toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-HN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareSeats(first, second) {
  const firstMatch = /^([A-Z]+)(\d+)$/.exec(first) || ["", first, "0"];
  const secondMatch = /^([A-Z]+)(\d+)$/.exec(second) || ["", second, "0"];
  return firstMatch[1].localeCompare(secondMatch[1]) ||
    Number(firstMatch[2]) - Number(secondMatch[2]);
}

function showError(message) {
  elements.error.textContent = message || "";
}

function showStatus(message) {
  elements.status.textContent = message || "";
}

function getErrorMessage(error) {
  if (error instanceof window.AramacaoSeatApi.SeatApiError) return error.message;
  return error?.message || "No fue posible completar la operación.";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
