"use strict";

const pageState = {
  data: null,
  selectedDate: new Date(),
};

document.addEventListener("DOMContentLoaded", initializePublicPage);

async function initializePublicPage() {
  bindNavigation();
  setCurrentYear();
  bindContactForm();
  bindTrailerModal();

  const view = document.body.dataset.cinemaView;
  if (!view) return;

  try {
    pageState.data = await window.CinemaStore.getData("../../assets/data/cartelera.json");
    if (view === "cartelera") renderCarteleraPage();
    if (view === "proximamente") renderUpcomingPage();
  } catch (error) {
    console.error("No se pudo cargar la información del cine:", error);
    const target = document.querySelector("#public-movie-grid");
    if (target) target.innerHTML = '<p class="error-message">No fue posible cargar las películas. Actualiza la página para intentarlo de nuevo.</p>';
  }
}

function bindNavigation() {
  const toggle = document.querySelector("#menu-toggle");
  const navigation = document.querySelector("#main-navigation");
  if (!toggle || !navigation) return;

  toggle.addEventListener("click", () => {
    const willOpen = !navigation.classList.contains("open");
    navigation.classList.toggle("open", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  navigation.addEventListener("click", (event) => {
    if (!event.target.matches("a")) return;
    navigation.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

function setCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}

function renderCarteleraPage() {
  renderDateTabs();
  renderCurrentMovies();
}

function renderDateTabs() {
  const target = document.querySelector("#public-date-tabs");
  if (!target) return;

  const dates = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index));
  target.innerHTML = dates.map((date, index) => {
    const weekday = new Intl.DateTimeFormat("es-HN", { weekday: "short" }).format(date).replace(".", "");
    const dayAndMonth = new Intl.DateTimeFormat("es-HN", { day: "numeric", month: "short" }).format(date).replace(".", "");
    return `
      <button class="date-tab${index === 0 ? " active" : ""}" type="button" data-date="${toLocalISODate(date)}" aria-pressed="${index === 0}">
        <strong>${index === 0 ? "Hoy" : capitalize(weekday)}</strong>
        <span>${escapeHTML(dayAndMonth)}</span>
      </button>`;
  }).join("");

  target.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    pageState.selectedDate = parseLocalDate(button.dataset.date);
    target.querySelectorAll(".date-tab").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    renderCurrentMovies();
  });
}

function renderCurrentMovies() {
  const target = document.querySelector("#public-movie-grid");
  if (!target) return;
  const movies = pageState.data.movies.filter((movie) => movie.status === "cartelera" && movie.active !== false);

  target.innerHTML = movies.length
    ? movies.map((movie) => renderCurrentMovieCard(movie)).join("")
    : '<p class="empty-message">No hay películas publicadas para esta fecha.</p>';
  bindMovieActions(target);
}

function renderCurrentMovieCard(movie) {
  const shows = getShowtimes(movie, pageState.selectedDate);
  const loginUrl = buildLoginUrl(movie.id, toLocalISODate(pageState.selectedDate));
  return `
    <article class="movie-card">
      <div class="movie-art" style="--card-accent: ${sanitizeColor(movie.accent)}">
        ${renderMovieImage(movie.posterImage, movie.title, "movie-art-image")}
        <span class="classification">${escapeHTML(movie.classification)}</span>
        <span class="movie-art-label">${escapeHTML(movie.title)}</span>
      </div>
      <div class="movie-card-body">
        <h3>${escapeHTML(movie.title)}</h3>
        <p class="movie-card-subtitle">${Number(movie.durationMinutes) || 0} min · ${escapeHTML((movie.genres || []).join(" / "))}</p>
        <div class="showtimes" aria-label="Horarios disponibles">
          ${shows.length ? shows.map((show) => `<span class="showtime">${escapeHTML(show.time)}</span>`).join("") : '<span class="no-showtimes">Sin funciones este día</span>'}
        </div>
        <div class="card-actions">
          ${getYouTubeEmbedUrl(movie.trailerUrl) ? `<button class="card-trailer" type="button" data-trailer-id="${escapeHTML(movie.id)}">Ver tráiler</button>` : ""}
          ${shows.length ? `<a class="card-link" href="${loginUrl}">Comprar boletos →</a>` : ""}
        </div>
      </div>
    </article>`;
}

function renderUpcomingPage() {
  const target = document.querySelector("#public-movie-grid");
  if (!target) return;
  const movies = pageState.data.movies.filter((movie) => movie.status === "proximamente" && movie.active !== false);

  target.innerHTML = movies.length
    ? movies.map((movie) => `
      <article class="upcoming-card">
        <div class="upcoming-art" style="--card-accent: ${sanitizeColor(movie.accent)}">
          ${renderMovieImage(movie.bannerImage || movie.posterImage, movie.title, "movie-art-image")}
          <span class="movie-art-label">${escapeHTML(movie.title)}</span>
        </div>
        <div class="upcoming-body">
          <div>
            <h3>${escapeHTML(movie.title)}</h3>
            <span class="movie-card-subtitle">${escapeHTML((movie.genres || []).join(" / "))}</span>
          </div>
          <span class="release-date">${formatReleaseDate(movie.releaseDate)}</span>
        </div>
        ${getYouTubeEmbedUrl(movie.trailerUrl) ? `<div class="movie-card-body"><button class="card-trailer" type="button" data-trailer-id="${escapeHTML(movie.id)}">Ver tráiler</button></div>` : ""}
      </article>`).join("")
    : '<p class="empty-message">Los próximos estrenos se publicarán pronto.</p>';
  bindMovieActions(target);
}

function bindMovieActions(target) {
  target.querySelectorAll("[data-trailer-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const movie = pageState.data.movies.find((item) => item.id === button.dataset.trailerId);
      if (movie) openTrailer(movie);
    });
  });
}

function bindTrailerModal() {
  document.querySelectorAll("[data-close-trailer]").forEach((button) => {
    button.addEventListener("click", closeTrailer);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTrailer();
  });
}

function openTrailer(movie) {
  const modal = document.querySelector("#trailer-modal");
  const player = document.querySelector("#trailer-player");
  const title = document.querySelector("#trailer-modal-title");
  const embedUrl = getYouTubeEmbedUrl(movie.trailerUrl);
  if (!modal || !player || !embedUrl) return;

  title.textContent = movie.title;
  player.src = `${embedUrl}?autoplay=1&rel=0`;
  modal.removeAttribute("inert");
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
  document.body.classList.add("modal-open");
  modal.querySelector(".modal-close")?.focus();
}

function closeTrailer() {
  const modal = document.querySelector("#trailer-modal");
  const player = document.querySelector("#trailer-player");
  if (!modal?.classList.contains("open")) return;
  player.src = "about:blank";
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("inert", "");
  document.body.classList.remove("modal-open");
}

function bindContactForm() {
  const form = document.querySelector("#public-contact-form");
  if (!form) return;
  const status = document.querySelector("#public-form-status");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
    const requiredFields = [...form.querySelectorAll("[required]")];
    const invalidFields = requiredFields.filter((field) => !field.value.trim() || !field.checkValidity());

    if (invalidFields.length) {
      invalidFields.forEach((field) => field.setAttribute("aria-invalid", "true"));
      status.textContent = "Completa correctamente los campos obligatorios.";
      status.className = "public-form-status error";
      invalidFields[0].focus();
      return;
    }

    /* BACKEND: enviar el mensaje, registrar consentimiento y aplicar protección contra spam. */
    status.textContent = "Mensaje listo. El backend se encargará de enviarlo al equipo de Aramacao Cinema.";
    status.className = "public-form-status success";
  });
}

function getShowtimes(movie, date) {
  return movie.schedules?.[String(date.getDay())] || [];
}

function buildLoginUrl(movie = "", date = "", time = "") {
  const params = new URLSearchParams();
  if (movie) params.set("movie", movie);
  if (date) params.set("date", date);
  if (time) params.set("time", time);
  const query = params.toString();
  return `../cuenta/iniciar-sesion.html${query ? `?${query}` : ""}`;
}

function getYouTubeEmbedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  } catch {
    return "";
  }
}

function renderMovieImage(value, title, className) {
  const url = getSafeMediaUrl(value);
  return url ? `<img class="${className}" src="${escapeHTML(url)}" alt="Póster de ${escapeHTML(title)}" loading="lazy">` : "";
}

function getSafeMediaUrl(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function sanitizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#0877d1";
}

function formatReleaseDate(value) {
  if (!value) return "Fecha por confirmar";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-HN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
