"use strict";

/*
 * INTEGRACIÓN CON BACKEND
 * -----------------------
 * Durante la maqueta, Inicio, Taquilla y Administración comparten CinemaStore.
 * Cuando Django exponga la API, cinema-store.js será sustituido por solicitudes
 * autenticadas, por ejemplo GET /api/cartelera/. La presentación puede conservarse.
 */
const DATA_URL = "assets/data/cartelera.json";

const state = {
  data: null,
  selectedDate: new Date(),
  featuredMovies: [],
  heroIndex: 0,
  heroTimer: null,
  lastFocusedElement: null,
  modalMovie: null,
};

const elements = {
  hero: document.querySelector("#hero"),
  heroBackdrop: document.querySelector(".hero-backdrop"),
  heroEyebrow: document.querySelector("#hero-eyebrow"),
  heroTitle: document.querySelector("#hero-title"),
  heroDescription: document.querySelector("#hero-description"),
  heroMeta: document.querySelector("#hero-meta"),
  heroPoster: document.querySelector("#hero-poster"),
  heroPosterImage: document.querySelector("#hero-poster-image"),
  heroPosterLabel: document.querySelector("#hero-poster-label"),
  heroBuy: document.querySelector("#hero-buy"),
  heroTrailer: document.querySelector("#hero-trailer"),
  heroDetails: document.querySelector("#hero-details"),
  heroDots: document.querySelector("#hero-dots"),
  heroPrev: document.querySelector("#hero-prev"),
  heroNext: document.querySelector("#hero-next"),
  dateTabs: document.querySelector("#date-tabs"),
  movieGrid: document.querySelector("#movie-grid"),
  upcomingGrid: document.querySelector("#upcoming-grid"),
  menuToggle: document.querySelector("#menu-toggle"),
  navigation: document.querySelector("#main-navigation"),
  modal: document.querySelector("#movie-modal"),
  modalTitle: document.querySelector("#modal-title"),
  modalDescription: document.querySelector("#modal-description"),
  modalDetails: document.querySelector("#modal-details"),
  modalBuy: document.querySelector("#modal-buy"),
  modalTrailer: document.querySelector("#modal-trailer"),
  trailerModal: document.querySelector("#trailer-modal"),
  trailerModalTitle: document.querySelector("#trailer-modal-title"),
  trailerPlayer: document.querySelector("#trailer-player"),
  trailerBuy: document.querySelector("#trailer-buy"),
};

document.addEventListener("DOMContentLoaded", initializePage);

async function initializePage() {
  bindStaticEvents();
  document.querySelector("#current-year").textContent = new Date().getFullYear();

  try {
    state.data = await fetchCinemaData();
    state.featuredMovies = state.data.movies.filter(
      (movie) => movie.status === "cartelera" && movie.featured && movie.active !== false
    );

    renderDateTabs();
    renderMovies();
    renderUpcomingMovies();
    renderHero();
    startHeroRotation();
  } catch (error) {
    console.error("No se pudo cargar la cartelera:", error);
    showDataError();
  }
}

async function fetchCinemaData() {
  return window.CinemaStore.getData(DATA_URL);
}

function bindStaticEvents() {
  elements.menuToggle.addEventListener("click", toggleMobileMenu);
  elements.navigation.addEventListener("click", (event) => {
    if (event.target.matches("a")) closeMobileMenu();
  });

  elements.heroPrev.addEventListener("click", () => changeHero(-1));
  elements.heroNext.addEventListener("click", () => changeHero(1));
  elements.heroDetails.addEventListener("click", () => {
    const movie = state.featuredMovies[state.heroIndex];
    if (movie) openMovieModal(movie);
  });

  elements.heroTrailer.addEventListener("click", () => {
    const movie = state.featuredMovies[state.heroIndex];
    if (movie) openTrailerModal(movie);
  });

  elements.modalTrailer.addEventListener("click", () => {
    if (!state.modalMovie) return;
    const movie = state.modalMovie;
    const returnFocus = state.lastFocusedElement;
    closeMovieModal(false);
    openTrailerModal(movie, returnFocus);
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeMovieModal);
  });

  document.querySelectorAll("[data-close-trailer]").forEach((button) => {
    button.addEventListener("click", closeTrailerModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (elements.trailerModal.classList.contains("open")) closeTrailerModal();
    else if (elements.modal.classList.contains("open")) closeMovieModal();
  });
}

function toggleMobileMenu() {
  const willOpen = !elements.navigation.classList.contains("open");
  elements.navigation.classList.toggle("open", willOpen);
  elements.menuToggle.setAttribute("aria-expanded", String(willOpen));
}

function closeMobileMenu() {
  elements.navigation.classList.remove("open");
  elements.menuToggle.setAttribute("aria-expanded", "false");
}

function renderDateTabs() {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index));

  elements.dateTabs.innerHTML = dates
    .map((date, index) => {
      const weekday = new Intl.DateTimeFormat("es-HN", { weekday: "short" })
        .format(date)
        .replace(".", "");
      const dayAndMonth = new Intl.DateTimeFormat("es-HN", {
        day: "numeric",
        month: "short",
      })
        .format(date)
        .replace(".", "");

      return `
        <button
          class="date-tab${index === 0 ? " active" : ""}"
          type="button"
          data-date="${toLocalISODate(date)}"
          aria-pressed="${index === 0}"
        >
          <strong>${index === 0 ? "Hoy" : capitalize(weekday)}</strong>
          <span>${dayAndMonth}</span>
        </button>
      `;
    })
    .join("");

  elements.dateTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;

    state.selectedDate = parseLocalDate(button.dataset.date);

    elements.dateTabs.querySelectorAll(".date-tab").forEach((tab) => {
      const isSelected = tab === button;
      tab.classList.toggle("active", isSelected);
      tab.setAttribute("aria-pressed", String(isSelected));
    });

    renderMovies();
  });
}

function renderMovies() {
  const movies = state.data.movies.filter(
    (movie) => movie.status === "cartelera" && movie.active !== false
  );

  if (!movies.length) {
    elements.movieGrid.innerHTML = '<p class="empty-message">No hay películas publicadas para esta fecha.</p>';
    return;
  }

  elements.movieGrid.innerHTML = movies
    .map((movie) => {
      const showtimes = getShowtimes(movie, state.selectedDate);
      const dateParam = toLocalISODate(state.selectedDate);

      return `
        <article class="movie-card">
          <div class="movie-art" style="--card-accent: ${sanitizeColor(movie.accent)}">
            ${renderMovieImage(movie.posterImage, movie.title, "movie-art-image")}
            <span class="classification">${escapeHTML(movie.classification)}</span>
            <span class="movie-art-label">${escapeHTML(movie.title)}</span>
          </div>
          <div class="movie-card-body">
            <h3>${escapeHTML(movie.title)}</h3>
            <p class="movie-card-subtitle">${movie.durationMinutes} min · ${escapeHTML(movie.genres.join(" / "))}</p>
            <div class="showtimes" aria-label="Horarios disponibles">
              ${
                showtimes.length
                  ? showtimes.map((show) => `<span class="showtime">${escapeHTML(show.time)}</span>`).join("")
                  : '<span class="no-showtimes">Sin funciones este día</span>'
              }
            </div>
            <div class="card-actions">
              <button class="card-details" type="button" data-movie-details="${movie.id}">Detalles</button>
              ${renderTrailerButton(movie)}
              ${
                showtimes.length
                  ? `<a class="card-link" href="${buildCustomerAccountUrl(movie.id, dateParam)}">Elegir función →</a>`
                  : ""
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  elements.movieGrid.querySelectorAll("[data-movie-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const movie = state.data.movies.find((item) => item.id === button.dataset.movieDetails);
      if (movie) openMovieModal(movie);
    });
  });

  elements.movieGrid.querySelectorAll("[data-movie-trailer]").forEach((button) => {
    button.addEventListener("click", () => {
      const movie = state.data.movies.find((item) => item.id === button.dataset.movieTrailer);
      if (movie) openTrailerModal(movie);
    });
  });
}

function renderUpcomingMovies() {
  const upcoming = state.data.movies.filter(
    (movie) => movie.status === "proximamente" && movie.active !== false
  );

  elements.upcomingGrid.innerHTML = upcoming.length
    ? upcoming
        .map(
          (movie) => `
            <article class="upcoming-card">
              <div class="upcoming-art" style="--card-accent: ${sanitizeColor(movie.accent)}">
                ${renderMovieImage(movie.bannerImage || movie.posterImage, movie.title, "movie-art-image")}
                <span class="movie-art-label">${escapeHTML(movie.title)}</span>
              </div>
              <div class="upcoming-body">
                <div>
                  <h3>${escapeHTML(movie.title)}</h3>
                  <span class="movie-card-subtitle">${escapeHTML(movie.genres.join(" / "))}</span>
                </div>
                <span class="release-date">${formatReleaseDate(movie.releaseDate)}</span>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="empty-message">Los próximos estrenos se publicarán pronto.</p>';
}

function renderHero() {
  if (!state.featuredMovies.length) {
    elements.heroTitle.textContent = "Muy pronto, nuevas historias";
    elements.heroDescription.textContent = "La administración todavía no ha publicado películas destacadas.";
    elements.heroMeta.replaceChildren();
    elements.heroDetails.disabled = true;
    elements.heroTrailer.hidden = true;
    return;
  }

  const movie = state.featuredMovies[state.heroIndex];
  const firstShow = getShowtimes(movie, new Date())[0];

  elements.hero.style.setProperty("--hero-accent", sanitizeColor(movie.accent));
  elements.heroEyebrow.textContent = movie.heroLabel || "Ahora en cartelera";
  elements.heroTitle.textContent = movie.title;
  elements.heroDescription.textContent = movie.shortSynopsis;
  elements.heroMeta.innerHTML = [
    `${movie.durationMinutes} min`,
    movie.classification,
    movie.genres.join(" / "),
    movie.language,
  ]
    .map((item) => `<span class="meta-pill">${escapeHTML(item)}</span>`)
    .join("");

  elements.heroPoster.style.setProperty("--poster-accent", sanitizeColor(movie.accent));
  elements.heroPosterLabel.textContent = movie.title;
  setHeroImages(movie);
  setTrailerButton(elements.heroTrailer, movie);
  elements.heroBuy.href = buildCustomerAccountUrl(
    movie.id,
    toLocalISODate(new Date()),
    firstShow?.time
  );

  elements.heroDots.innerHTML = state.featuredMovies
    .map(
      (_, index) => `
        <button
          class="hero-dot${index === state.heroIndex ? " active" : ""}"
          type="button"
          data-hero-index="${index}"
          aria-label="Mostrar película ${index + 1}"
          aria-current="${index === state.heroIndex ? "true" : "false"}"
        ></button>
      `
    )
    .join("");

  elements.heroDots.querySelectorAll("[data-hero-index]").forEach((dot) => {
    dot.addEventListener("click", () => {
      state.heroIndex = Number(dot.dataset.heroIndex);
      renderHero();
      restartHeroRotation();
    });
  });
}

function changeHero(direction) {
  if (!state.featuredMovies.length) return;

  state.heroIndex =
    (state.heroIndex + direction + state.featuredMovies.length) % state.featuredMovies.length;
  renderHero();
  restartHeroRotation();
}

function startHeroRotation() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (state.featuredMovies.length < 2) return;

  state.heroTimer = window.setInterval(() => {
    state.heroIndex = (state.heroIndex + 1) % state.featuredMovies.length;
    renderHero();
  }, 7000);
}

function restartHeroRotation() {
  window.clearInterval(state.heroTimer);
  startHeroRotation();
}

function openMovieModal(movie) {
  state.lastFocusedElement = document.activeElement;
  state.modalMovie = movie;
  elements.modalTitle.textContent = movie.title;
  elements.modalDescription.textContent = movie.fullSynopsis || movie.shortSynopsis;
  elements.modalDetails.innerHTML = `
    <dt>Duración</dt><dd>${movie.durationMinutes} minutos</dd>
    <dt>Clasificación</dt><dd>${escapeHTML(movie.classification)}</dd>
    <dt>Género</dt><dd>${escapeHTML(movie.genres.join(", "))}</dd>
    <dt>Idioma</dt><dd>${escapeHTML(movie.language)}</dd>
    <dt>Dirección</dt><dd>${escapeHTML(movie.director)}</dd>
    <dt>Reparto</dt><dd>${escapeHTML(movie.cast.join(", "))}</dd>
  `;
  elements.modalBuy.href = buildCustomerAccountUrl(movie.id);
  setTrailerButton(elements.modalTrailer, movie);
  elements.modal.removeAttribute("inert");
  elements.modal.classList.add("open");
  elements.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  elements.modal.querySelector(".modal-close").focus();
}

function closeMovieModal(restoreFocus = true) {
  elements.modal.classList.remove("open");
  elements.modal.setAttribute("aria-hidden", "true");
  elements.modal.setAttribute("inert", "");
  document.body.classList.remove("modal-open");
  state.modalMovie = null;
  if (restoreFocus) state.lastFocusedElement?.focus();
}

function openTrailerModal(movie, returnFocus = null) {
  const embedUrl = getYouTubeEmbedUrl(movie.trailerUrl);
  if (!embedUrl) return;

  state.lastFocusedElement = returnFocus || document.activeElement;
  elements.trailerModalTitle.textContent = movie.title;
  elements.trailerPlayer.src = `${embedUrl}?autoplay=1&rel=0`;
  elements.trailerBuy.href = buildCustomerAccountUrl(movie.id);
  elements.trailerModal.removeAttribute("inert");
  elements.trailerModal.classList.add("open");
  elements.trailerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  elements.trailerModal.querySelector(".modal-close").focus();
}

function closeTrailerModal() {
  elements.trailerModal.classList.remove("open");
  elements.trailerModal.setAttribute("aria-hidden", "true");
  elements.trailerModal.setAttribute("inert", "");
  elements.trailerPlayer.src = "about:blank";
  document.body.classList.remove("modal-open");
  state.lastFocusedElement?.focus();
}

function getShowtimes(movie, date) {
  return movie.schedules[String(date.getDay())] || [];
}

function showDataError() {
  elements.heroTitle.textContent = "No pudimos cargar la cartelera";
  elements.heroDescription.textContent = "Comprueba que abriste la página mediante el servidor local y vuelve a intentarlo.";
  elements.movieGrid.innerHTML = '<p class="error-message">No fue posible consultar las películas.</p>';
  elements.upcomingGrid.innerHTML = '<p class="error-message">No fue posible consultar los próximos estrenos.</p>';
}

function addDays(date, days) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
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

function formatReleaseDate(value) {
  if (!value) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-HN", { day: "numeric", month: "short" })
    .format(parseLocalDate(value))
    .replace(".", "");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sanitizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#0877d1";
}

function getSafeMediaUrl(value) {
  if (!value) return "";
  const trimmedValue = String(value).trim();

  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(trimmedValue)) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function getYouTubeVideoId(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) return "";

    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (!["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(hostname)) return "";

    if (url.pathname === "/watch") return url.searchParams.get("v") || "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || "";
    return "";
  } catch {
    return "";
  }
}

function getYouTubeEmbedUrl(value) {
  const videoId = getYouTubeVideoId(value);
  return /^[a-zA-Z0-9_-]{6,20}$/.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : "";
}

function renderMovieImage(value, title, className) {
  const imageUrl = getSafeMediaUrl(value);
  if (!imageUrl) return "";

  return `<img class="${className}" src="${escapeHTML(imageUrl)}" alt="Póster de ${escapeHTML(title)}" loading="lazy">`;
}

function renderTrailerButton(movie) {
  if (!getYouTubeEmbedUrl(movie.trailerUrl)) return "";
  return `<button class="card-trailer" type="button" data-movie-trailer="${escapeHTML(movie.id)}">Ver tráiler</button>`;
}

function setTrailerButton(button, movie) {
  button.hidden = !getYouTubeEmbedUrl(movie.trailerUrl);
  button.dataset.movieTrailer = movie.id;
}

/*
 * BACKEND: el inicio de sesión será el punto de entrada a la compra. Si el
 * cliente aún no tiene cuenta, el formulario ofrece crearla sin perder estos
 * parámetros. Django validará la sesión antes de mostrar funciones y asientos.
 */
function buildCustomerAccountUrl(movieId = "", date = "", time = "") {
  const params = new URLSearchParams();
  if (movieId) params.set("movie", movieId);
  if (date) params.set("date", date);
  if (time) params.set("time", time);
  const query = params.toString();
  return `pages/cuenta/iniciar-sesion.html${query ? `?${query}` : ""}`;
}

function setHeroImages(movie) {
  const posterUrl = getSafeMediaUrl(movie.posterImage);
  const bannerUrl = getSafeMediaUrl(movie.bannerImage);

  elements.heroPosterImage.hidden = !posterUrl;
  elements.heroPosterLabel.hidden = Boolean(posterUrl);
  if (posterUrl) elements.heroPosterImage.src = posterUrl;
  else elements.heroPosterImage.removeAttribute("src");

  elements.heroBackdrop.classList.toggle("has-image", Boolean(bannerUrl));
  elements.heroBackdrop.style.backgroundImage = bannerUrl
    ? `linear-gradient(90deg, rgba(4, 9, 16, 0.96), rgba(4, 9, 16, 0.34)), url("${bannerUrl.replaceAll('"', "%22")}")`
    : "";
}

/* Evita insertar etiquetas HTML si un texto recibido de la API contiene caracteres especiales. */
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
