"use strict";

/*
 * INTEGRACIÓN CON BACKEND
 * -----------------------
 * La taquilla comparte temporalmente CinemaStore con Inicio y Administración.
 * En producción, la API protegida será la única fuente oficial de funciones,
 * precios, disponibilidad, pagos y estados de asientos.
 */
const DATA_URL = "../../assets/data/cartelera.json";

const state = {
  data: null,
  selectedDate: null,
  selectedMovie: null,
  selectedShowtime: null,
  selectedSeats: new Set(),
  /*
   * BACKEND: este mapa recibirá el estado real por función.
   * Valores admitidos: "available", "reserved" y "occupied".
   * En la maqueta permanece vacío para no inventar reservas en el navegador.
   */
  seatStatuses: new Map(),
};

const elements = {
  saleDate: document.querySelector("#sale-date"),
  movieSelect: document.querySelector("#movie-select"),
  showtimes: document.querySelector("#ticket-showtimes"),
  seatMap: document.querySelector("#seat-map"),
  seatInstruction: document.querySelector("#seat-instruction"),
  promotionBox: document.querySelector("#promotion-box"),
  promotionStatus: document.querySelector("#promotion-status"),
  summaryMovie: document.querySelector("#summary-movie"),
  summaryShowtime: document.querySelector("#summary-showtime"),
  summaryRoom: document.querySelector("#summary-room"),
  summarySeats: document.querySelector("#summary-seats"),
  admissionCount: document.querySelector("#admission-count"),
  subtotal: document.querySelector("#subtotal"),
  discount: document.querySelector("#discount"),
  total: document.querySelector("#total"),
  cashField: document.querySelector("#cash-field"),
  cashReceived: document.querySelector("#cash-received"),
  change: document.querySelector("#change"),
  saleError: document.querySelector("#sale-error"),
  clearSale: document.querySelector("#clear-sale"),
  confirmSale: document.querySelector("#confirm-sale"),
};

document.addEventListener("DOMContentLoaded", initializeTicketOffice);

async function initializeTicketOffice() {
  bindEvents();
  configureDateInput();
  renderEmptySeatMap("Selecciona una película y una función para ver los asientos.");

  try {
    state.data = await fetchCinemaData();
    populateMovies();
    applyURLSelection();
    updatePromotionAvailability();
    updateSummary();
  } catch (error) {
    console.error("No se pudo cargar la cartelera:", error);
    elements.movieSelect.innerHTML = '<option value="">No se pudo cargar la cartelera</option>';
    elements.showtimes.innerHTML = '<p class="showtime-empty">Comprueba que el servidor local está funcionando.</p>';
    showError("No fue posible consultar las películas y funciones.");
  }
}

async function fetchCinemaData() {
  return window.CinemaStore.getData(DATA_URL);
}

function bindEvents() {
  elements.saleDate.addEventListener("change", () => {
    state.selectedDate = parseLocalDate(elements.saleDate.value);
    resetFunctionSelection();
    renderShowtimes(true);
    updatePromotionAvailability();
  });

  elements.movieSelect.addEventListener("change", () => {
    state.selectedMovie = state.data.movies.find((movie) => movie.id === elements.movieSelect.value) || null;
    resetFunctionSelection();
    renderShowtimes(true);
    updatePromotionAvailability();
  });

  elements.showtimes.addEventListener("click", (event) => {
    const button = event.target.closest("[data-showtime-index]");
    if (!button || !state.selectedMovie) return;

    const available = getShowtimes(state.selectedMovie, state.selectedDate);
    selectShowtime(available[Number(button.dataset.showtimeIndex)]);
  });

  elements.seatMap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-seat]");
    if (!button || button.disabled) return;
    toggleSeat(button.dataset.seat);
  });

  document.querySelectorAll('input[name="payment"]').forEach((input) => {
    input.addEventListener("change", updatePaymentUI);
  });

  elements.cashReceived.addEventListener("input", updateSummary);
  elements.clearSale.addEventListener("click", () => resetCurrentSale(false));
  elements.confirmSale.addEventListener("click", confirmSale);
}

function configureDateInput() {
  const today = startOfLocalDay(new Date());
  const maxDate = addDays(today, 14);
  elements.saleDate.min = toLocalISODate(today);
  elements.saleDate.max = toLocalISODate(maxDate);
  elements.saleDate.value = toLocalISODate(today);
  state.selectedDate = today;
}

function populateMovies() {
  const activeMovies = state.data.movies.filter(
    (movie) => movie.status === "cartelera" && movie.active !== false
  );
  elements.movieSelect.innerHTML = [
    '<option value="">Selecciona una película</option>',
    ...activeMovies.map((movie) => `<option value="${movie.id}">${escapeHTML(movie.title)}</option>`),
  ].join("");
}

function applyURLSelection() {
  const params = new URLSearchParams(window.location.search);
  const requestedDate = params.get("date");
  const requestedMovie = params.get("movie");
  const requestedTime = params.get("time");

  if (requestedDate && requestedDate >= elements.saleDate.min && requestedDate <= elements.saleDate.max) {
    elements.saleDate.value = requestedDate;
    state.selectedDate = parseLocalDate(requestedDate);
  }

  const movie = state.data.movies.find(
    (item) => item.status === "cartelera" && item.active !== false && item.id === requestedMovie
  );

  if (movie) {
    state.selectedMovie = movie;
    elements.movieSelect.value = movie.id;
    renderShowtimes(false);

    const shows = getShowtimes(movie, state.selectedDate);
    const requestedShow = shows.find((show) => show.time === requestedTime);
    if (requestedShow) selectShowtime(requestedShow);
  } else {
    renderShowtimes(false);
  }
}

function renderShowtimes(autoSelectFirst) {
  if (!state.selectedMovie) {
    elements.showtimes.innerHTML = '<p class="showtime-empty">Selecciona una película para consultar sus horarios.</p>';
    updateSummary();
    return;
  }

  const shows = getShowtimes(state.selectedMovie, state.selectedDate);

  if (!shows.length) {
    elements.showtimes.innerHTML = '<p class="showtime-empty">Esta película no tiene funciones publicadas en la fecha seleccionada.</p>';
    renderEmptySeatMap("No hay una función disponible para mostrar asientos.");
    updateSummary();
    return;
  }

  elements.showtimes.innerHTML = shows
    .map(
      (show, index) => `
        <button class="ticket-showtime" type="button" data-showtime-index="${index}">
          <strong>${escapeHTML(show.time)}</strong>
          <span>${escapeHTML(show.room)} · ${escapeHTML(show.format)} · ${formatMoney(show.price)}</span>
        </button>
      `
    )
    .join("");

  if (autoSelectFirst && shows.length === 1) selectShowtime(shows[0]);
  updateSummary();
}

function selectShowtime(showtime) {
  if (!showtime) return;

  state.selectedShowtime = showtime;
  state.selectedSeats.clear();
  state.seatStatuses.clear();

  /*
   * BACKEND: al elegir una función, consultar aquí la disponibilidad real.
   * El servidor devolverá cada asiento como disponible, reservado u ocupado.
   */

  const shows = getShowtimes(state.selectedMovie, state.selectedDate);
  elements.showtimes.querySelectorAll("[data-showtime-index]").forEach((button) => {
    const show = shows[Number(button.dataset.showtimeIndex)];
    button.classList.toggle("selected", show.id === showtime.id);
  });

  renderSeatMap();
  updatePromotionAvailability();
  updateSummary();
}

function renderSeatMap() {
  if (!state.selectedShowtime) {
    renderEmptySeatMap("Primero selecciona una función.");
    return;
  }

  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const seatsPerRow = 14;
  const fragments = [];

  rows.forEach((row) => {
    fragments.push(`<span class="row-label" aria-hidden="true">${row}</span>`);
    for (let number = 1; number <= seatsPerRow; number += 1) {
      const seat = `${row}${number}`;
      const status = state.seatStatuses.get(seat) || "available";
      const unavailable = status === "reserved" || status === "occupied";
      const selected = state.selectedSeats.has(seat);
      const statusLabel = {
        available: "disponible",
        reserved: "reservado, pago confirmado",
        occupied: "ocupado, boleto escaneado",
      }[status];

      if (number === 8) {
        fragments.push('<span class="seat-aisle" aria-hidden="true"></span>');
      }

      fragments.push(`
        <button
          class="seat ${status}${selected ? " selected" : ""}"
          type="button"
          data-seat="${seat}"
          aria-label="Asiento ${seat}, ${statusLabel}"
          aria-pressed="${selected}"
          ${unavailable ? "disabled" : ""}
        >${number}</button>
      `);
    }
  });

  elements.seatMap.innerHTML = fragments.join("");
  elements.seatInstruction.textContent = `${state.selectedShowtime.time} · ${state.selectedShowtime.room}. La selección es temporal hasta confirmar el pago.`;
}

function renderEmptySeatMap(message) {
  elements.seatMap.innerHTML = `<p class="seat-map-disabled">${escapeHTML(message)}</p>`;
  elements.seatInstruction.textContent = message;
}

function toggleSeat(seat) {
  if (state.selectedSeats.has(seat)) {
    state.selectedSeats.delete(seat);
  } else {
    state.selectedSeats.add(seat);
  }

  renderSeatMap();
  updateSummary();
}

function resetFunctionSelection() {
  state.selectedShowtime = null;
  state.selectedSeats.clear();
  renderEmptySeatMap("Selecciona una función para ver los asientos.");
  updatePromotionAvailability();
  showError("");
}

function resetCurrentSale(clearMovie) {
  state.selectedShowtime = null;
  state.selectedSeats.clear();
  elements.cashReceived.value = "";
  document.querySelector('input[name="payment"][value="efectivo"]').checked = true;

  if (clearMovie) {
    state.selectedMovie = null;
    elements.movieSelect.value = "";
  }

  renderShowtimes(false);
  renderEmptySeatMap("Selecciona una función para ver los asientos.");
  updatePromotionAvailability();
  updatePaymentUI();
  updateSummary();
  showError("");
}

function updatePromotionAvailability() {
  if (!state.data) return;

  const available = isPromotionAvailable();
  elements.promotionBox.classList.toggle("unavailable", !available);
  elements.promotionBox.classList.toggle("active", available);

  if (!state.selectedMovie || !state.selectedShowtime) {
    elements.promotionStatus.textContent = "Selecciona una película y una función para consultar si participa.";
  } else if (!available) {
    elements.promotionStatus.textContent = "Esta función no tiene promoción activa.";
  } else {
    elements.promotionStatus.textContent = "2x1 activo. El descuento se calcula automáticamente al seleccionar dos o más asientos.";
  }

  updateSummary();
}

function isPromotionAvailable() {
  const promotion = state.data?.promotion;
  const selectedDate = state.selectedDate ? toLocalISODate(state.selectedDate) : "";
  const correctFunction = promotion?.appliesTo !== "especificas" ||
    promotion.functionIds?.includes(state.selectedShowtime?.id);
  return Boolean(
    promotion?.enabled &&
      state.selectedMovie &&
      state.selectedShowtime &&
      state.selectedDate &&
      promotion.movieIds?.includes(state.selectedMovie.id) &&
      promotion.startDate &&
      promotion.endDate &&
      selectedDate >= promotion.startDate &&
      selectedDate <= promotion.endDate &&
      promotion.allowedWeekdays?.includes(state.selectedDate.getDay()) &&
      correctFunction
  );
}

function calculateTotals() {
  const admissions = state.selectedSeats.size;
  const unitPrice = Number(state.selectedShowtime?.price || 0);
  const validPromotion = isPromotionAvailable();
  const freeAdmissions = validPromotion ? Math.floor(admissions / 2) : 0;
  const subtotal = admissions * unitPrice;
  const discount = freeAdmissions * unitPrice;

  return {
    admissions,
    unitPrice,
    freeAdmissions,
    subtotal,
    discount,
    total: subtotal - discount,
  };
}

function updateSummary() {
  const totals = calculateTotals();
  const sortedSeats = [...state.selectedSeats].sort(sortSeats);

  elements.summaryMovie.textContent = state.selectedMovie?.title || "Sin seleccionar";
  elements.summaryShowtime.textContent = state.selectedShowtime?.time || "Sin seleccionar";
  elements.summaryRoom.textContent = state.selectedShowtime?.room || "—";
  elements.summarySeats.textContent = sortedSeats.length ? sortedSeats.join(", ") : "Ninguno";
  elements.admissionCount.textContent = String(totals.admissions);
  elements.subtotal.textContent = formatMoney(totals.subtotal);
  elements.discount.textContent = `−${formatMoney(totals.discount)}`;
  elements.total.textContent = formatMoney(totals.total);

  const received = Number(elements.cashReceived.value || 0);
  elements.change.textContent = formatMoney(Math.max(received - totals.total, 0));
}

function updatePaymentUI() {
  const payment = getPaymentMethod();
  elements.cashField.classList.toggle("hidden", payment !== "efectivo");
  if (payment !== "efectivo") elements.cashReceived.value = "";
  updateSummary();
}

function confirmSale() {
  showError("");

  if (!state.selectedMovie || !state.selectedShowtime) {
    showError("Selecciona la película y la función antes de confirmar.");
    return;
  }

  if (!state.selectedSeats.size) {
    showError("Selecciona al menos un asiento.");
    return;
  }

  const totals = calculateTotals();
  const paymentMethod = getPaymentMethod();
  const cashReceived = Number(elements.cashReceived.value || 0);

  if (paymentMethod === "efectivo" && cashReceived < totals.total) {
    showError(`El efectivo recibido debe ser igual o mayor que ${formatMoney(totals.total)}.`);
    elements.cashReceived.focus();
    return;
  }

  /*
   * BACKEND CRÍTICO:
   * reemplazar este punto por la confirmación real del pago y la venta.
   * El servidor debe volver a validar la disponibilidad dentro de una
   * operación segura. Solo si el pago fue aprobado cambiará los asientos a
   * "reservado". El diseño del recibo y los boletos queda a cargo de backend.
   *
   * Esta maqueta no persiste ni cambia estados para no imponerle al backend
   * una estrategia de reservas.
   */
  window.alert("La venta está lista para conectarse al backend.");
}

function getShowtimes(movie, date) {
  if (!movie || !date) return [];
  const selectedDate = toLocalISODate(date);
  return (movie.funciones || [])
    .filter((showtime) => showtime.fecha === selectedDate)
    .sort((first, second) => first.hora.localeCompare(second.hora))
    .map((showtime) => ({
      id: showtime.id,
      time: formatTimeForDisplay(showtime.hora),
      room: "Sala 1",
      format: showtime.formato,
      price: Number(showtime.precio),
    }));
}

function getPaymentMethod() {
  return document.querySelector('input[name="payment"]:checked')?.value || "efectivo";
}

function showError(message) {
  elements.saleError.textContent = message;
}

function formatTimeForDisplay(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return String(value || "");
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "p. m." : "a. m."}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function sortSeats(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
