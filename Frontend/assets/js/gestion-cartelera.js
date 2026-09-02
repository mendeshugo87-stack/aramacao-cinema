"use strict";

const DATA_URL = "../../assets/data/cartelera.json";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MOVIES_PER_PAGE = 10;
const DEFAULT_ACCENT = "#0877d1";
const DEFAULT_BANNER_VISIBILITY = 65;
const DEFAULT_PROMOTION_WEEKDAYS = [1, 2, 3];
const CROP_PRESETS = {
  posterImage: { label: "Póster vertical", ratio: 2 / 3, width: 1000, height: 1500 },
  bannerImage: { label: "Fondo horizontal de Inicio", ratio: 16 / 7, width: 2560, height: 1120 },
};

const state = {
  data: null,
  moviePage: 1,
  editingMovieId: null,
  originalFunctionsSignature: "",
  posterImage: "",
  bannerImage: "",
  bannerVisibility: DEFAULT_BANNER_VISIBILITY,
  promotionWeekdays: DEFAULT_PROMOTION_WEEKDAYS,
  formSelections: {
    genreIds: [],
    actorIds: [],
  },
  personModal: {
    type: "",
    lastFocus: null,
  },
  crop: {
    targetKey: "",
    source: "",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    pointerX: 0,
    pointerY: 0,
    lastFocus: null,
  },
};

const elements = {
  sidebar: document.querySelector(".admin-sidebar"),
  menuButton: document.querySelector("#admin-menu-button"),
  movieList: document.querySelector("#admin-movie-list"),
  moviePagination: document.querySelector("#movie-pagination"),
  search: document.querySelector("#movie-search"),
  statusFilter: document.querySelector("#movie-status-filter"),
  editor: document.querySelector("#movie-editor"),
  editorTitle: document.querySelector("#movie-form-title"),
  movieForm: document.querySelector("#movie-form"),
  movieFormStatus: document.querySelector("#movie-form-status"),
  movieListStatus: document.querySelector("#movie-list-status"),
  showtimeList: document.querySelector("#showtime-editor-list"),
  posterInput: document.querySelector("#movie-poster"),
  bannerInput: document.querySelector("#movie-banner"),
  posterPreview: document.querySelector("#poster-preview"),
  bannerPreview: document.querySelector("#banner-preview"),
  bannerVisibility: document.querySelector("#movie-banner-visibility"),
  bannerVisibilityValue: document.querySelector("#movie-banner-visibility-value"),
  reframePoster: document.querySelector("#reframe-poster"),
  reframeBanner: document.querySelector("#reframe-banner"),
  classificationSelect: document.querySelector("#movie-classification"),
  genreSelect: document.querySelector("#movie-genre-select"),
  genreTags: document.querySelector("#movie-genres"),
  languageSelect: document.querySelector("#movie-language-select"),
  directorSelect: document.querySelector("#movie-director"),
  actorSelect: document.querySelector("#movie-actor-select"),
  castTags: document.querySelector("#movie-cast"),
  personModal: document.querySelector("#person-modal"),
  personModalTitle: document.querySelector("#person-modal-title"),
  personForm: document.querySelector("#person-form"),
  personFormStatus: document.querySelector("#person-form-status"),
  personType: document.querySelector("#person-type"),
  personFirstName: document.querySelector("#person-first-name"),
  personLastName: document.querySelector("#person-last-name"),
  personStageName: document.querySelector("#person-stage-name"),
  personBiography: document.querySelector("#person-biography"),
  cropModal: document.querySelector("#image-crop-modal"),
  cropModalTitle: document.querySelector("#crop-modal-title"),
  cropModalHelp: document.querySelector("#crop-modal-help"),
  cropStage: document.querySelector("#crop-stage"),
  cropImage: document.querySelector("#crop-image"),
  cropZoom: document.querySelector("#crop-zoom"),
  cropStatus: document.querySelector("#crop-status"),
  applyCrop: document.querySelector("#apply-crop"),
};

document.addEventListener("DOMContentLoaded", initializeAdmin);

async function initializeAdmin() {
  bindEvents();

  try {
    state.data = await window.CinemaStore.getData(DATA_URL);
    ensureDataShape();
    renderAll();
  } catch (error) {
    console.error("No fue posible cargar la administración:", error);
    elements.movieList.innerHTML = '<p class="empty-admin-list">No se pudo cargar la cartelera. Abre el proyecto con el servidor local.</p>';
  }
}

function bindEvents() {
  elements.menuButton.addEventListener("click", () => {
    const willOpen = !elements.sidebar.classList.contains("open");
    elements.sidebar.classList.toggle("open", willOpen);
    elements.menuButton.setAttribute("aria-expanded", String(willOpen));
  });

  elements.sidebar.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      elements.sidebar.classList.remove("open");
      elements.menuButton.setAttribute("aria-expanded", "false");
    }
  });

  elements.search.addEventListener("input", restartMoviePagination);
  elements.statusFilter.addEventListener("change", restartMoviePagination);
  document.querySelector("#new-movie-button").addEventListener("click", () => openMovieEditor());
  document.querySelector("#close-movie-editor").addEventListener("click", closeMovieEditor);
  document.querySelector("#cancel-movie-edit").addEventListener("click", closeMovieEditor);
  document.querySelector("#add-showtime").addEventListener("click", () => addShowtimeRow());
  document.querySelector("#add-director").addEventListener("click", () => openPersonModal("director"));
  document.querySelector("#add-actor").addEventListener("click", () => openPersonModal("actor"));
  elements.genreSelect.addEventListener("change", addGenreSelection);
  elements.actorSelect.addEventListener("change", addActorSelection);
  document.querySelector("#reset-demo-data").addEventListener("click", resetDemoData);

  elements.movieList.addEventListener("click", handleMovieListAction);
  elements.moviePagination.addEventListener("click", handleMoviePagination);
  elements.movieForm.addEventListener("click", handleSelectedTagRemoval);
  elements.showtimeList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-showtime]");
    if (!removeButton) return;
    removeButton.closest(".showtime-row").remove();
    renderEmptyShowtimeMessage();
  });
  elements.showtimeList.addEventListener("focusout", (event) => {
    const timeInput = event.target.closest('[data-showtime-field="time"]');
    if (timeInput) normalizeVisibleTimeInput(timeInput);
  });
  elements.showtimeList.addEventListener("change", (event) => {
    const row = event.target.closest(".showtime-row");
    if (row && event.target.matches('[data-showtime-field="date"], [data-showtime-field="promotion"]')) {
      updateShowtimePromotionMessage(row);
    }
  });

  elements.movieForm.addEventListener("submit", saveMovie);
  elements.personForm.addEventListener("submit", savePerson);
  elements.posterInput.addEventListener("change", () => handleImageSelection(elements.posterInput, "posterImage"));
  elements.bannerInput.addEventListener("change", () => handleImageSelection(elements.bannerInput, "bannerImage"));
  elements.reframePoster.addEventListener("click", () => openImageCropper(state.posterImage, "posterImage"));
  elements.reframeBanner.addEventListener("click", () => openImageCropper(state.bannerImage, "bannerImage"));
  elements.bannerVisibility.addEventListener("input", () => {
    state.bannerVisibility = normalizeBannerVisibility(elements.bannerVisibility.value);
    renderBannerPreview();
  });
  document.querySelector("#movie-title").addEventListener("input", renderBannerPreview);
  elements.cropZoom.addEventListener("input", () => {
    state.crop.zoom = Number(elements.cropZoom.value);
    updateCropTransform();
  });
  elements.cropStage.addEventListener("pointerdown", startCropDrag);
  elements.cropStage.addEventListener("pointermove", moveCropImage);
  elements.cropStage.addEventListener("pointerup", stopCropDrag);
  elements.cropStage.addEventListener("pointercancel", stopCropDrag);
  elements.cropImage.addEventListener("load", resetCropPosition);
  elements.applyCrop.addEventListener("click", applyImageCrop);
  document.querySelectorAll("[data-cancel-crop]").forEach((button) => {
    button.addEventListener("click", closeImageCropper);
  });
  document.querySelectorAll("[data-cancel-person]").forEach((button) => {
    button.addEventListener("click", closePersonModal);
  });
  window.addEventListener("resize", updateCropTransform);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.cropModal.classList.contains("open")) closeImageCropper();
    if (event.key === "Escape" && elements.personModal.classList.contains("open")) closePersonModal();
  });
}

function ensureDataShape() {
  state.data.movies = Array.isArray(state.data.movies) ? state.data.movies : [];
  state.data.directors = Array.isArray(state.data.directors) ? state.data.directors : [];
  state.data.actors = Array.isArray(state.data.actors) ? state.data.actors : [];
  state.data.genres = Array.isArray(state.data.genres) ? state.data.genres : [];
  state.data.languages = Array.isArray(state.data.languages) ? state.data.languages : [];
  state.data.classifications = Array.isArray(state.data.classifications) ? state.data.classifications : [];
  state.promotionWeekdays = Array.isArray(state.data.promotion?.allowedWeekdays)
    ? state.data.promotion.allowedWeekdays.map(Number)
    : DEFAULT_PROMOTION_WEEKDAYS;

  state.data.movies.forEach((movie) => {
    if (typeof movie.active !== "boolean") movie.active = true;
    movie.funciones = Array.isArray(movie.funciones) ? movie.funciones : [];
    movie.bannerVisibility = normalizeBannerVisibility(movie.bannerVisibility);
  });

  prepareMovieCatalogs();
  preparePeopleCatalogs();
}

function renderAll() {
  renderMetrics();
  renderMovieList();
}

function renderMetrics() {
  const activeMovies = state.data.movies.filter((movie) => movie.active !== false);
  document.querySelector("#metric-billboard").textContent = activeMovies.filter((movie) => movie.status === "cartelera").length;
  document.querySelector("#metric-upcoming").textContent = activeMovies.filter((movie) => movie.status === "proximamente").length;
  document.querySelector("#metric-featured").textContent = activeMovies.filter((movie) => movie.status === "cartelera" && movie.featured).length;
  document.querySelector("#metric-showtimes").textContent = state.data.movies.reduce(
    (total, movie) => total + countShowtimes(movie),
    0
  );
}

function renderMovieList() {
  if (!state.data) return;
  const query = normalizeText(elements.search.value);
  const selectedStatus = elements.statusFilter.value;

  const filteredMovies = state.data.movies.filter((movie) => {
    const searchable = normalizeText([movie.title, movie.classification, ...(movie.genres || [])].join(" "));
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "retirada" ? movie.active === false : movie.status === selectedStatus && movie.active !== false);
    return matchesQuery && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / MOVIES_PER_PAGE));
  state.moviePage = clamp(state.moviePage, 1, totalPages);
  const firstMovie = (state.moviePage - 1) * MOVIES_PER_PAGE;
  // En la demostración dividimos el catálogo local. El endpoint real entregará estos mismos bloques de 10.
  const moviesOnPage = filteredMovies.slice(firstMovie, firstMovie + MOVIES_PER_PAGE);

  if (!moviesOnPage.length) {
    elements.movieList.innerHTML = '<p class="empty-admin-list">No hay películas que coincidan con el filtro.</p>';
  } else {
    elements.movieList.innerHTML = moviesOnPage.map(renderMovieRow).join("");
  }

  renderMoviePagination(filteredMovies.length, totalPages);
}

function restartMoviePagination() {
  state.moviePage = 1;
  renderMovieList();
}

function handleMoviePagination(event) {
  const button = event.target.closest("[data-movie-page]");
  if (!button || button.disabled) return;

  state.moviePage = Number(button.dataset.moviePage);
  renderMovieList();
  document.querySelector("#peliculas").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMoviePagination(totalMovies, totalPages) {
  const previousPage = Math.max(1, state.moviePage - 1);
  const nextPage = Math.min(totalPages, state.moviePage + 1);
  const pageButtons = getVisibleMoviePages(totalPages).map((page) => {
    if (page === "…") return '<span class="movie-pagination-gap" aria-hidden="true">…</span>';
    const current = page === state.moviePage;
    return `<button type="button" data-movie-page="${page}" ${current ? 'class="active" aria-current="page"' : ""}>${page}</button>`;
  }).join("");

  elements.moviePagination.innerHTML = `
    <p>Página ${state.moviePage} de ${totalPages} · ${totalMovies} ${totalMovies === 1 ? "película" : "películas"}</p>
    <div>
      <button type="button" data-movie-page="${previousPage}" ${state.moviePage === 1 ? "disabled" : ""}>Anterior</button>
      ${pageButtons}
      <button type="button" data-movie-page="${nextPage}" ${state.moviePage === totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

function getVisibleMoviePages(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = [1];
  const start = Math.max(2, state.moviePage - 1);
  const end = Math.min(totalPages - 1, state.moviePage + 1);
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

function renderMovieRow(movie) {
  const imageUrl = getSafeImageUrl(movie.posterImage);
  const statusClass = movie.active === false ? "inactive" : movie.status === "proximamente" ? "upcoming" : "";
  const statusText = movie.active === false ? "Retirada" : movie.status === "proximamente" ? "Próximamente" : "Cartelera";

  return `
    <article class="admin-movie-item">
      <div class="admin-movie-thumb" style="--thumb-accent:${sanitizeColor(movie.accent)}">
        ${imageUrl ? `<img src="${escapeHTML(imageUrl)}" alt="">` : escapeHTML(getInitials(movie.title))}
      </div>
      <div class="admin-movie-name">
        <strong>${escapeHTML(movie.title)}</strong>
        <small>${escapeHTML((movie.genres || []).join(" / "))} · ${Number(movie.durationMinutes) || 0} min</small>
      </div>
      <div class="admin-movie-detail">
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      <div class="admin-movie-detail">
        <strong>${movie.featured && movie.active !== false ? "Sí" : "No"}</strong>
        <small>Carrusel</small>
      </div>
      <div class="admin-movie-detail hide-tablet">
        <strong>${countShowtimes(movie)}</strong>
        <small>Funciones</small>
      </div>
      <div class="admin-movie-actions">
        <button type="button" data-action="edit" data-movie-id="${escapeHTML(movie.id)}">Editar</button>
        <button type="button" data-action="toggle" data-movie-id="${escapeHTML(movie.id)}">${movie.active === false ? "Publicar" : "Retirar"}</button>
      </div>
    </article>
  `;
}

function handleMovieListAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const movie = state.data.movies.find((item) => item.id === button.dataset.movieId);
  if (!movie) return;

  if (button.dataset.action === "edit") openMovieEditor(movie);
  if (button.dataset.action === "toggle") toggleMoviePublication(movie);
}

async function toggleMoviePublication(movie) {
  movie.active = movie.active === false;
  if (!movie.active) movie.featured = false;
  await persistAndRender();
}

function openMovieEditor(movie = null) {
  clearFormErrors();
  hideMovieListStatus();
  elements.movieForm.reset();
  elements.showtimeList.replaceChildren();
  state.editingMovieId = movie?.id || null;
  state.originalFunctionsSignature = buildFunctionsSignature(movie?.funciones || []);
  state.posterImage = movie?.posterImage || "";
  state.bannerImage = movie?.bannerImage || "";
  state.bannerVisibility = normalizeBannerVisibility(movie?.bannerVisibility);
  elements.editorTitle.textContent = movie ? "Editar película" : "Nueva película";
  document.querySelector("#movie-id").value = movie?.id || "";
  renderCatalogSelectors(movie);
  renderPeopleSelectors(movie?.directorId || "", movie?.actorIds || []);

  if (movie) fillMovieForm(movie);
  else {
    document.querySelector("#movie-active").checked = true;
  }

  renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
  renderBannerPreview();
  syncReframeButtons();
  renderEmptyShowtimeMessage();
  elements.editor.removeAttribute("hidden");
  elements.editor.classList.add("is-open");
  window.requestAnimationFrame(() => {
    elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.querySelector("#movie-title").focus(), 250);
  });
}

function fillMovieForm(movie) {
  setValue("movie-title", movie.title);
  setValue("movie-short-synopsis", movie.shortSynopsis);
  setValue("movie-full-synopsis", movie.fullSynopsis);
  setValue("movie-duration", movie.durationMinutes);
  setValue("movie-release-date", movie.releaseDate);
  setValue("movie-trailer", movie.trailerUrl);
  document.querySelector("#movie-active").checked = movie.active !== false;
  document.querySelector("#movie-featured").checked = Boolean(movie.featured);

  [...(movie.funciones || [])]
    .sort(compareFunctions)
    .forEach((showtime) => addShowtimeRow(showtime));
}

function closeMovieEditor() {
  elements.editor.setAttribute("hidden", "");
  elements.editor.classList.remove("is-open");
  state.editingMovieId = null;
  state.originalFunctionsSignature = "";
  document.querySelector("#peliculas").scrollIntoView({ behavior: "smooth", block: "start" });
}

function addShowtimeRow(showtime = {}) {
  elements.showtimeList.querySelector(".no-showtimes-admin")?.remove();
  const row = document.createElement("div");
  row.className = "showtime-row";
  row.dataset.functionId = showtime.id || createFunctionId();
  const minimumDate = showtime.fecha ? "" : ` min="${toLocalISODate(new Date())}"`;
  row.innerHTML = `
    <label>Fecha
      <input data-showtime-field="date" type="date"${minimumDate} value="${escapeHTML(showtime.fecha || "")}" required>
    </label>
    <label>Hora obligatoria
      <input data-showtime-field="time" type="text" inputmode="numeric" autocomplete="off" placeholder="Ej. 2:00 p. m." value="${escapeHTML(formatTimeForDisplay(showtime.hora || ""))}" required>
    </label>
    <label>Formato
      <select data-showtime-field="format"><option ${showtime.formato === "2D" ? "selected" : ""}>2D</option><option ${showtime.formato === "3D" ? "selected" : ""}>3D</option></select>
    </label>
    <label>Precio (L)
      <input data-showtime-field="price" type="number" min="0" step="1" value="${Number(showtime.precio) || 120}" required>
    </label>
    <span class="fixed-room"><small></small><strong>Sala 1</strong></span>
    <button class="remove-showtime" type="button" data-remove-showtime aria-label="Quitar función">×</button>
    <div class="showtime-promotion-row">
      <label class="showtime-promotion">
        <input data-showtime-field="promotion" type="checkbox" ${showtime.promotion === true || showtime.promocion_2x1?.aplica === true ? "checked" : ""}>
        <span><strong>Aplicar 2x1</strong><small>Solo para esta función.</small></span>
      </label>
      <small class="showtime-promotion-message" data-promotion-message></small>
    </div>
  `;
  elements.showtimeList.append(row);
  updateShowtimePromotionMessage(row);
}

function renderEmptyShowtimeMessage() {
  if (elements.showtimeList.querySelector(".showtime-row")) return;
  elements.showtimeList.innerHTML = '<p class="no-showtimes-admin">Todavía no agregaste funciones para esta película.</p>';
}

function updateShowtimePromotionMessage(row) {
  const date = row.querySelector('[data-showtime-field="date"]').value;
  const checkbox = row.querySelector('[data-showtime-field="promotion"]');
  const message = row.querySelector("[data-promotion-message]");
  const isAllowed = isPromotionDateAllowed(date);

  row.classList.toggle("promotion-not-allowed", checkbox.checked && Boolean(date) && !isAllowed);
  if (!checkbox.checked) {
    message.textContent = "";
  } else if (!date) {
    message.textContent = "Selecciona la fecha para validar la promoción.";
  } else if (isAllowed) {
    message.textContent = "Día permitido por la regla actual.";
  } else {
    message.textContent = `No se puede publicar con 2x1. Días permitidos: ${formatWeekdayNames(state.promotionWeekdays)}.`;
  }
}

function isPromotionDateAllowed(date) {
  return Boolean(date && state.promotionWeekdays.includes(getWeekdayFromISO(date)));
}

function formatWeekdayNames(weekdays) {
  const names = { 0: "domingo", 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado" };
  return (weekdays || []).map((day) => names[day]).filter(Boolean).join(", ") || "ninguno";
}

async function saveMovie(event) {
  event.preventDefault();
  clearFormErrors();
  if (!validateMovieForm()) return;

  const existingMovie = state.data.movies.find((movie) => movie.id === state.editingMovieId);
  const classificationId = normalizeCatalogId(elements.classificationSelect.value);
  const genreIds = [...state.formSelections.genreIds];
  const languageId = elements.languageSelect.value
    ? normalizeCatalogId(elements.languageSelect.value)
    : "";
  const directorId = elements.directorSelect.value
    ? normalizeCatalogId(elements.directorSelect.value)
    : "";
  const actorIds = getSelectedActorIds();
  const classification = findCatalogItem(state.data.classifications, classificationId);
  const genres = genreIds.map((id) => findCatalogItem(state.data.genres, id)).filter(Boolean);
  const language = findCatalogItem(state.data.languages, languageId);
  const director = state.data.directors.find((person) => String(person.id) === String(directorId));
  const actors = actorIds
    .map((actorId) => state.data.actors.find((person) => String(person.id) === String(actorId)))
    .filter(Boolean);
  const movieStatus = existingMovie?.status || "proximamente";
  const movie = {
    id: existingMovie?.id || createMovieId(document.querySelector("#movie-title").value),
    title: document.querySelector("#movie-title").value.trim(),
    heroLabel: existingMovie?.heroLabel || "Ahora en cartelera",
    shortSynopsis: document.querySelector("#movie-short-synopsis").value.trim(),
    fullSynopsis: document.querySelector("#movie-full-synopsis").value.trim() || document.querySelector("#movie-short-synopsis").value.trim(),
    durationMinutes: Number(document.querySelector("#movie-duration").value),
    classificationId,
    classification: classification ? getCatalogName(classification) : "",
    genreIds,
    genres: genres.map(getCatalogName),
    languageId,
    languageIds: languageId ? [languageId] : [],
    language: language ? getCatalogName(language) : "",
    directorId,
    directorIds: directorId ? [directorId] : [],
    director: director ? getPersonName(director) : "Por confirmar",
    actorIds,
    cast: actors.length ? actors.map(getPersonName) : ["Por confirmar"],
    status: movieStatus,
    featured: document.querySelector("#movie-featured").checked,
    active: document.querySelector("#movie-active").checked,
    accent: existingMovie?.accent || DEFAULT_ACCENT,
    releaseDate: document.querySelector("#movie-release-date").value,
    trailerUrl: document.querySelector("#movie-trailer").value.trim(),
    posterImage: state.posterImage,
    bannerImage: state.bannerImage,
    bannerVisibility: state.bannerVisibility,
    funciones: collectFunctions(),
    createdAt: existingMovie?.createdAt || new Date().toISOString(),
  };

  if (existingMovie) Object.assign(existingMovie, movie);
  else {
    state.data.movies.unshift(movie);
    state.moviePage = 1;
  }

  try {
    await persistAndRender();
    showMovieListStatus(`“${movie.title}” se guardó correctamente. Puedes editar otra película o revisar el cambio en Inicio.`);
    closeMovieEditor();
  } catch (error) {
    console.error("No fue posible guardar la película:", error);
    elements.movieFormStatus.textContent = "No se pudo guardar la película en esta demostración.";
    elements.movieFormStatus.className = "admin-form-status error";
  }
}

function validateMovieForm() {
  let valid = true;
  const requiredFields = [
    ["movie-title", 2, "Escribe el título de la película."],
    ["movie-short-synopsis", 10, "Agrega una descripción de al menos 10 caracteres."],
  ];

  requiredFields.forEach(([id, minimum, message]) => {
    const input = document.getElementById(id);
    if (input.value.trim().length < minimum) {
      setFieldError(input, message);
      valid = false;
    }
  });

  const duration = document.querySelector("#movie-duration");
  if (Number(duration.value) < 1 || Number(duration.value) > 500) {
    setFieldError(duration, "Escribe una duración válida.");
    valid = false;
  }

  const classification = document.querySelector("#movie-classification");
  if (!classification.value) {
    setFieldError(classification, "Selecciona la clasificación.");
    valid = false;
  }

  if (!state.formSelections.genreIds.length) {
    setFieldError(elements.genreSelect, "Selecciona al menos un género.");
    valid = false;
  }

  if (!elements.languageSelect.value) {
    setFieldError(elements.languageSelect, "Selecciona un idioma.");
    valid = false;
  }

  const trailer = document.querySelector("#movie-trailer");
  if (trailer.value.trim() && !getYouTubeVideoId(trailer.value)) {
    setFieldError(trailer, "Pega un enlace válido de un video de YouTube.");
    valid = false;
  }

  const currentFunctions = collectFunctions();
  const functionsChanged = buildFunctionsSignature(currentFunctions) !== state.originalFunctionsSignature;

  /*
   * Una película existente puede contener funciones guardadas por una versión
   * anterior de la maqueta. Esas funciones no deben impedir cambiar solamente
   * el título, la descripción, el tráiler o las imágenes. Las validaciones de
   * horario se ejecutan cuando Administración modifica realmente las funciones.
   */
  if (functionsChanged) {
    const invalidShowtime = [...elements.showtimeList.querySelectorAll(".showtime-row")].find((row) => {
      const timeInput = row.querySelector('[data-showtime-field="time"]');
      const normalizedTime = parseTimeInput(timeInput.value);
      timeInput.setCustomValidity(normalizedTime ? "" : "Escribe una hora válida con a. m. o p. m.");
      timeInput.toggleAttribute("aria-invalid", !normalizedTime);
      if (normalizedTime) timeInput.value = formatTimeForDisplay(normalizedTime);

      return [...row.querySelectorAll("input[required], select[required]")]
        .some((input) => !input.value || !input.checkValidity());
    });
    if (invalidShowtime) {
      elements.movieFormStatus.textContent = "Cada función debe tener fecha, una hora válida, formato y precio. Ejemplo de hora: 2:00 p. m.";
      elements.movieFormStatus.className = "admin-form-status error";
      valid = false;
    }

    const invalidPromotion = [...elements.showtimeList.querySelectorAll(".showtime-row")].find((row) => {
      const promotion = row.querySelector('[data-showtime-field="promotion"]');
      const date = row.querySelector('[data-showtime-field="date"]').value;
      updateShowtimePromotionMessage(row);
      return promotion.checked && !isPromotionDateAllowed(date);
    });
    if (invalidPromotion) {
      elements.movieFormStatus.textContent = `El 2x1 solo puede publicarse en estos días: ${formatWeekdayNames(state.promotionWeekdays)}.`;
      elements.movieFormStatus.className = "admin-form-status error";
      valid = false;
    }
  }

  if (valid && functionsChanged) {
    const conflict = findRoomConflict(currentFunctions, Number(duration.value));
    if (conflict) {
      elements.movieFormStatus.textContent = conflict;
      elements.movieFormStatus.className = "admin-form-status error";
      valid = false;
    }
  }

  if (!valid) {
    if (!elements.movieFormStatus.textContent) {
      elements.movieFormStatus.textContent = "Revisa los campos marcados antes de guardar.";
      elements.movieFormStatus.className = "admin-form-status error";
    }
    elements.movieForm.querySelector('[aria-invalid="true"]')?.focus();
  }

  return valid;
}

function collectFunctions() {
  return [...elements.showtimeList.querySelectorAll(".showtime-row")]
    .map((row) => ({
      id: row.dataset.functionId || createFunctionId(),
      fecha: row.querySelector('[data-showtime-field="date"]').value,
      hora: parseTimeInput(row.querySelector('[data-showtime-field="time"]').value),
      sala: "Sala 1",
      formato: row.querySelector('[data-showtime-field="format"]').value,
      precio: Number(row.querySelector('[data-showtime-field="price"]').value),
      promotion: row.querySelector('[data-showtime-field="promotion"]').checked,
    }))
    .sort(compareFunctions);
}

function buildFunctionsSignature(functions) {
  return JSON.stringify(
    [...(functions || [])]
      .map((showtime) => ({
        id: String(showtime.id || ""),
        fecha: String(showtime.fecha || ""),
        hora: String(showtime.hora || ""),
        sala: "Sala 1",
        formato: String(showtime.formato || "2D"),
        precio: Number(showtime.precio) || 0,
        promotion: showtime.promotion === true || showtime.promocion_2x1?.aplica === true,
      }))
      .sort(compareFunctions)
  );
}

function prepareMovieCatalogs() {
  state.data.genres = normalizeMovieCatalog(state.data.genres, "genre");
  state.data.languages = normalizeMovieCatalog(state.data.languages, "language");
  state.data.classifications = normalizeMovieCatalog(state.data.classifications, "classification");

  // Los nombres antiguos se conservan para la demostración, pero el formulario ya trabaja con ID.
  state.data.movies.forEach((movie) => {
    movie.genreIds = Array.isArray(movie.genreIds) && movie.genreIds.length
      ? movie.genreIds.map(normalizeCatalogId)
      : (movie.genres || []).map((name) => addExistingCatalogItem(state.data.genres, name)).filter(Boolean);
    movie.languageIds = Array.isArray(movie.languageIds) && movie.languageIds.length
      ? movie.languageIds.map(normalizeCatalogId)
      : [addExistingCatalogItem(state.data.languages, movie.language)].filter(Boolean);
    movie.languageId = movie.languageId
      ? normalizeCatalogId(movie.languageId)
      : movie.languageIds[0] || "";
    movie.classificationId = movie.classificationId
      ? normalizeCatalogId(movie.classificationId)
      : addExistingCatalogItem(state.data.classifications, movie.classification);
  });
}

function normalizeMovieCatalog(catalog) {
  return catalog.map((item, index) => {
    if (typeof item === "string") return { id: index + 1, name: item, active: true };
    return {
      ...item,
      id: item.id ?? index + 1,
      active: item.active !== false && item.activo !== false,
    };
  });
}

function addExistingCatalogItem(catalog, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return "";
  const existing = catalog.find((item) => normalizeText(getCatalogName(item)) === normalizeText(cleanName));
  if (existing) return existing.id;

  const item = { id: getNextNumericId(catalog), name: cleanName, active: true };
  catalog.push(item);
  return item.id;
}

function renderCatalogSelectors(movie) {
  state.formSelections.genreIds = [...(movie?.genreIds || [])].map(normalizeCatalogId);

  renderCatalogOptions(elements.classificationSelect, state.data.classifications, "Seleccionar");
  renderCatalogOptions(elements.genreSelect, state.data.genres, "Seleccionar género");
  renderCatalogOptions(elements.languageSelect, state.data.languages, "Seleccionar idioma");
  elements.classificationSelect.value = movie?.classificationId ?? "";
  elements.languageSelect.value = movie?.languageId ?? movie?.languageIds?.[0] ?? "";
  renderGenreTags();
}

function renderCatalogOptions(select, catalog, placeholder) {
  const options = [...catalog]
    .filter((item) => item.active !== false)
    .sort((first, second) => getCatalogName(first).localeCompare(getCatalogName(second), "es", { sensitivity: "base" }));
  select.innerHTML = `<option value="">${placeholder}</option>${options
    .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(getCatalogName(item))}</option>`)
    .join("")}`;
}

function addGenreSelection() {
  if (!elements.genreSelect.value) return;

  const id = normalizeCatalogId(elements.genreSelect.value);
  if (!state.formSelections.genreIds.some((selectedId) => String(selectedId) === String(id))) {
    state.formSelections.genreIds.push(id);
  }
  elements.genreSelect.value = "";
  elements.genreSelect.removeAttribute("aria-invalid");
  const error = elements.movieForm.querySelector('[data-error-for="movie-genre-select"]');
  if (error) error.textContent = "";
  renderGenreTags();
}

function renderGenreTags() {
  renderSelectedTags(elements.genreTags, state.formSelections.genreIds, state.data.genres, "genre", "Sin géneros seleccionados");
}

function renderSelectedTags(container, selectedIds, catalog, type, emptyText) {
  const items = selectedIds.map((id) => findCatalogItem(catalog, id)).filter(Boolean);
  container.innerHTML = items.length
    ? items.map((item) => `
        <span class="selected-tag">
          ${escapeHTML(getCatalogName(item))}
          <button type="button" data-remove-tag="${type}" data-item-id="${escapeHTML(item.id)}" aria-label="Quitar ${escapeHTML(getCatalogName(item))}">×</button>
        </span>
      `).join("")
    : `<small class="selected-tag-empty">${emptyText}</small>`;
}

function handleSelectedTagRemoval(event) {
  const button = event.target.closest("[data-remove-tag]");
  if (!button) return;
  const id = button.dataset.itemId;

  if (button.dataset.removeTag === "genre") {
    state.formSelections.genreIds = state.formSelections.genreIds.filter((itemId) => String(itemId) !== id);
    renderGenreTags();
  }
  if (button.dataset.removeTag === "actor") {
    state.formSelections.actorIds = state.formSelections.actorIds.filter((itemId) => String(itemId) !== id);
    renderActorTags();
  }
}

function normalizeCatalogId(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : String(value);
}

function findCatalogItem(catalog, id) {
  return catalog.find((item) => String(item.id) === String(id));
}

function getCatalogName(item) {
  return String(item?.name || item?.nombre || "").trim();
}

function preparePeopleCatalogs() {
  // Las películas antiguas guardaban nombres escritos. Los convertimos en personas reutilizables para trabajar después con sus ID.
  state.data.directors = state.data.directors.map(normalizePerson);
  state.data.actors = state.data.actors.map(normalizePerson);

  state.data.movies.forEach((movie) => {
    const directorId = movie.directorId || movie.directorIds?.[0] || addExistingPerson(state.data.directors, movie.director);
    movie.directorId = directorId ? normalizeCatalogId(directorId) : "";
    movie.directorIds = movie.directorId ? [movie.directorId] : [];

    if (!Array.isArray(movie.actorIds) || !movie.actorIds.length) {
      movie.actorIds = (movie.cast || [])
        .map((name) => addExistingPerson(state.data.actors, name))
        .filter(Boolean);
    } else {
      movie.actorIds = movie.actorIds.map(normalizeCatalogId);
    }
  });
}

function normalizePerson(person, index) {
  return {
    ...person,
    id: person.id !== undefined && person.id !== null
      ? normalizeCatalogId(person.id)
      : index + 1,
    active: person.active !== false && person.activo !== false,
  };
}

function addExistingPerson(catalog, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName || normalizeText(cleanName) === "por confirmar") return "";

  const existing = catalog.find((person) => normalizeText(getPersonName(person)) === normalizeText(cleanName));
  if (existing) return existing.id;

  const person = {
    id: getNextNumericId(catalog),
    fullName: cleanName,
    active: true,
  };
  catalog.push(person);
  return person.id;
}

function renderPeopleSelectors(selectedDirectorId = "", selectedActorIds = []) {
  const directors = [...state.data.directors]
    .filter((person) => person.active !== false)
    .sort(comparePeople);
  elements.directorSelect.innerHTML = `<option value="">Por confirmar</option>${directors
    .map((person) => `<option value="${escapeHTML(person.id)}">${escapeHTML(getPersonOptionLabel(person, directors))}</option>`)
    .join("")}`;
  elements.directorSelect.value = String(selectedDirectorId || "");

  const actors = [...state.data.actors]
    .filter((person) => person.active !== false)
    .sort(comparePeople);
  elements.actorSelect.innerHTML = `<option value="">Seleccionar actor</option>${actors
    .map((person) => `<option value="${escapeHTML(person.id)}">${escapeHTML(getPersonOptionLabel(person, actors))}</option>`)
    .join("")}`;
  state.formSelections.actorIds = (selectedActorIds || []).map(normalizeCatalogId);
  renderActorTags();
}

function addActorSelection() {
  const actorId = elements.actorSelect.value
    ? normalizeCatalogId(elements.actorSelect.value)
    : "";
  if (!actorId) return;
  if (!state.formSelections.actorIds.some((selectedId) => String(selectedId) === String(actorId))) {
    state.formSelections.actorIds.push(actorId);
  }
  elements.actorSelect.value = "";
  renderActorTags();
}

function renderActorTags() {
  const actors = state.formSelections.actorIds
    .map((id) => state.data.actors.find((person) => String(person.id) === String(id)))
    .filter(Boolean);
  elements.castTags.innerHTML = actors.length
    ? actors.map((actor) => {
      const label = getPersonOptionLabel(actor, state.data.actors);
      return `
        <span class="selected-tag">
          ${escapeHTML(label)}
          <button type="button" data-remove-tag="actor" data-item-id="${escapeHTML(actor.id)}" aria-label="Quitar ${escapeHTML(label)}">×</button>
        </span>
      `;
    }).join("")
    : '<small class="selected-tag-empty">Sin actores seleccionados</small>';
}

function getSelectedActorIds() {
  return [...state.formSelections.actorIds];
}

function openPersonModal(type) {
  state.personModal.type = type;
  state.personModal.lastFocus = document.activeElement;
  elements.personForm.reset();
  elements.personType.value = type;
  elements.personFormStatus.textContent = "";
  elements.personFormStatus.className = "admin-form-status";
  elements.personModalTitle.textContent = type === "director" ? "Agregar director" : "Agregar actor";
  elements.personForm.querySelectorAll(".actor-only").forEach((field) => {
    field.hidden = type !== "actor";
  });
  elements.personModal.removeAttribute("inert");
  elements.personModal.setAttribute("aria-hidden", "false");
  elements.personModal.classList.add("open");
  document.body.classList.add("admin-modal-open");
  window.setTimeout(() => elements.personFirstName.focus(), 60);
}

function closePersonModal() {
  if (!elements.personModal.classList.contains("open")) return;
  elements.personModal.classList.remove("open");
  elements.personModal.setAttribute("aria-hidden", "true");
  elements.personModal.setAttribute("inert", "");
  document.body.classList.remove("admin-modal-open");
  state.personModal.lastFocus?.focus();
}

async function savePerson(event) {
  event.preventDefault();
  const type = elements.personType.value;
  const firstName = elements.personFirstName.value.trim();
  const lastName = elements.personLastName.value.trim();
  const catalog = type === "director" ? state.data.directors : state.data.actors;

  if (firstName.length < 2 || lastName.length < 2) {
    return showPersonError("Escribe el nombre y el apellido completos.");
  }

  const person = {
    id: getNextNumericId(catalog),
    firstName,
    lastName,
    biography: elements.personBiography.value.trim(),
    active: true,
  };
  if (type === "actor") {
    person.stageName = elements.personStageName.value.trim();
  }

  catalog.push(person);
  const selectedDirectorId = type === "director" ? person.id : elements.directorSelect.value;
  const selectedActorIds = getSelectedActorIds();
  if (type === "actor") selectedActorIds.push(person.id);

  try {
    await window.CinemaStore.saveData(state.data);
    renderPeopleSelectors(selectedDirectorId, selectedActorIds);
    closePersonModal();
  } catch (error) {
    console.error("No fue posible guardar la persona:", error);
    catalog.pop();
    showPersonError("No se pudo guardar en esta demostración.");
  }
}

function showPersonError(message) {
  elements.personFormStatus.textContent = message;
  elements.personFormStatus.className = "admin-form-status error";
}

function getPersonName(person) {
  return String(
    person?.stageName ||
    person?.nombre_artistico ||
    getPersonLegalName(person)
  ).trim();
}

function getPersonLegalName(person) {
  return String(
    person?.fullName ||
    person?.nombre_completo ||
    [person?.firstName || person?.nombre, person?.lastName || person?.apellido].filter(Boolean).join(" ")
  ).trim();
}

function getPersonOptionLabel(person, catalog) {
  const visibleName = getPersonName(person);
  const legalName = getPersonLegalName(person);
  const repeatedName = legalName && catalog
    .filter((item) => normalizeText(getPersonLegalName(item)) === normalizeText(legalName))
    .length > 1;
  const nameWithDetails = legalName && normalizeText(visibleName) !== normalizeText(legalName)
    ? `${visibleName} (${legalName})`
    : visibleName;
  return repeatedName ? `${nameWithDetails} · ID ${person.id}` : nameWithDetails;
}

function comparePeople(first, second) {
  return getPersonName(first).localeCompare(getPersonName(second), "es", { sensitivity: "base" });
}

function getNextNumericId(catalog) {
  const ids = catalog.map((item) => Number(item.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

async function handleImageSelection(input, stateKey) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > MAX_IMAGE_BYTES) {
    input.value = "";
    elements.movieFormStatus.textContent = "La imagen debe ser PNG, JPG o WebP y pesar como máximo 8 MB.";
    elements.movieFormStatus.className = "admin-form-status error";
    return;
  }

  try {
    const source = await readFileAsDataUrl(file);
    openImageCropper(source, stateKey);
  } catch (error) {
    console.error("No fue posible leer la imagen:", error);
    input.value = "";
    elements.movieFormStatus.textContent = "No se pudo leer la imagen seleccionada.";
    elements.movieFormStatus.className = "admin-form-status error";
  }
}

function renderImagePreview(container, imageUrl, emptyText) {
  const safeUrl = getSafeImageUrl(imageUrl);
  container.innerHTML = safeUrl ? `<img src="${escapeHTML(safeUrl)}" alt="Vista previa">` : `<span>${emptyText}</span>`;
}

function renderBannerPreview() {
  const safeUrl = getSafeImageUrl(state.bannerImage);
  const title = document.querySelector("#movie-title").value.trim() || "Título de la película";
  const overlay = buildBannerOverlay(state.bannerVisibility);
  elements.bannerVisibility.value = String(state.bannerVisibility);
  elements.bannerVisibilityValue.value = `${state.bannerVisibility}%`;
  elements.bannerVisibilityValue.textContent = `${state.bannerVisibility}%`;
  elements.bannerPreview.style.setProperty("--banner-preview-overlay", overlay);
  elements.bannerPreview.innerHTML = safeUrl
    ? `<img src="${escapeHTML(safeUrl)}" alt="Vista previa del fondo"><span class="banner-preview-copy"><small>Así se verá en Inicio</small><strong>${escapeHTML(title)}</strong></span>`
    : '<span>Sin imagen</span>';
}

function buildBannerOverlay(visibility) {
  const visibleRatio = normalizeBannerVisibility(visibility) / 100;
  const shadow = 1 - visibleRatio;
  const left = clamp(shadow + 0.35, 0.55, 0.95);
  const center = clamp(shadow + 0.18, 0.35, 0.82);
  const right = clamp(shadow + 0.05, 0.2, 0.7);
  const bottom = clamp(shadow + 0.2, 0.4, 0.85);
  const top = clamp(shadow - 0.05, 0.12, 0.65);
  return `linear-gradient(90deg, rgba(3, 8, 16, ${left}) 0%, rgba(3, 8, 16, ${center}) 48%, rgba(3, 8, 16, ${right}) 100%), linear-gradient(0deg, rgba(3, 8, 16, ${bottom}), rgba(3, 8, 16, ${top}) 65%, rgba(3, 8, 16, ${center}))`;
}

function openImageCropper(source, stateKey) {
  const safeSource = getSafeImageUrl(source);
  const preset = CROP_PRESETS[stateKey];
  if (!safeSource || !preset) return;

  state.crop.targetKey = stateKey;
  state.crop.source = safeSource;
  state.crop.lastFocus = document.activeElement;
  elements.cropModalTitle.textContent = `Encuadrar ${preset.label.toLowerCase()}`;
  elements.cropModalHelp.textContent = `Arrastra la imagen y ajusta el zoom. La vista final tendrá proporción ${stateKey === "posterImage" ? "2:3" : "16:7"}.`;
  elements.cropStage.style.aspectRatio = `${preset.width} / ${preset.height}`;
  elements.cropStage.classList.toggle("poster-crop", stateKey === "posterImage");
  elements.cropStatus.textContent = "";
  elements.cropZoom.value = "1";
  elements.cropImage.src = safeSource;
  elements.cropModal.removeAttribute("inert");
  elements.cropModal.classList.add("open");
  elements.cropModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  elements.cropModal.querySelector(".crop-close").focus();
}

function resetCropPosition() {
  state.crop.zoom = 1;
  state.crop.offsetX = 0;
  state.crop.offsetY = 0;
  elements.cropZoom.value = "1";
  updateCropTransform();
}

function getCropLayout() {
  const stageWidth = elements.cropStage.clientWidth;
  const stageHeight = elements.cropStage.clientHeight;
  const imageWidth = elements.cropImage.naturalWidth;
  const imageHeight = elements.cropImage.naturalHeight;
  if (!stageWidth || !stageHeight || !imageWidth || !imageHeight) return null;

  const stageRatio = stageWidth / stageHeight;
  const imageRatio = imageWidth / imageHeight;
  let baseWidth;
  let baseHeight;

  if (imageRatio > stageRatio) {
    baseHeight = stageHeight;
    baseWidth = baseHeight * imageRatio;
  } else {
    baseWidth = stageWidth;
    baseHeight = baseWidth / imageRatio;
  }

  const width = baseWidth * state.crop.zoom;
  const height = baseHeight * state.crop.zoom;
  const maxX = Math.max(0, (width - stageWidth) / 2);
  const maxY = Math.max(0, (height - stageHeight) / 2);
  state.crop.offsetX = clamp(state.crop.offsetX, -maxX, maxX);
  state.crop.offsetY = clamp(state.crop.offsetY, -maxY, maxY);

  return {
    stageWidth,
    stageHeight,
    width,
    height,
    left: (stageWidth - width) / 2 + state.crop.offsetX,
    top: (stageHeight - height) / 2 + state.crop.offsetY,
  };
}

function updateCropTransform() {
  if (!elements.cropModal.classList.contains("open")) return;
  const layout = getCropLayout();
  if (!layout) return;

  Object.assign(elements.cropImage.style, {
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
  });
}

function startCropDrag(event) {
  if (event.button !== 0 || !elements.cropImage.complete) return;
  state.crop.dragging = true;
  state.crop.pointerX = event.clientX;
  state.crop.pointerY = event.clientY;
  elements.cropStage.classList.add("dragging");
  elements.cropStage.setPointerCapture(event.pointerId);
}

function moveCropImage(event) {
  if (!state.crop.dragging) return;
  state.crop.offsetX += event.clientX - state.crop.pointerX;
  state.crop.offsetY += event.clientY - state.crop.pointerY;
  state.crop.pointerX = event.clientX;
  state.crop.pointerY = event.clientY;
  updateCropTransform();
}

function stopCropDrag(event) {
  if (!state.crop.dragging) return;
  state.crop.dragging = false;
  elements.cropStage.classList.remove("dragging");
  if (elements.cropStage.hasPointerCapture(event.pointerId)) {
    elements.cropStage.releasePointerCapture(event.pointerId);
  }
}

function applyImageCrop() {
  const preset = CROP_PRESETS[state.crop.targetKey];
  const layout = getCropLayout();
  if (!preset || !layout) return;

  const sourceScale = elements.cropImage.naturalWidth / layout.width;
  const sourceX = Math.max(0, -layout.left * sourceScale);
  const sourceY = Math.max(0, -layout.top * sourceScale);
  const sourceWidth = layout.stageWidth * sourceScale;
  const sourceHeight = layout.stageHeight * sourceScale;
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const context = canvas.getContext("2d");

  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      elements.cropImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      preset.width,
      preset.height
    );

    state[state.crop.targetKey] = canvas.toDataURL("image/webp", 0.9);
    if (state.crop.targetKey === "posterImage") {
      renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
    } else {
      renderBannerPreview();
    }
    syncReframeButtons();
    closeImageCropper();
  } catch (error) {
    console.error("No fue posible recortar la imagen:", error);
    elements.cropStatus.textContent = "No se pudo aplicar el encuadre. Selecciona nuevamente el archivo desde tu equipo.";
  }
}

function closeImageCropper() {
  if (!elements.cropModal.classList.contains("open")) return;
  elements.cropModal.classList.remove("open");
  elements.cropModal.setAttribute("aria-hidden", "true");
  elements.cropModal.setAttribute("inert", "");
  document.body.classList.remove("admin-modal-open");
  state.crop.dragging = false;
  elements.cropStage.classList.remove("dragging");
  state.crop.lastFocus?.focus();
}

function syncReframeButtons() {
  elements.reframePoster.hidden = !getSafeImageUrl(state.posterImage);
  elements.reframeBanner.hidden = !getSafeImageUrl(state.bannerImage);
}

async function resetDemoData() {
  const confirmed = window.confirm("¿Restablecer las películas y los catálogos de demostración? Las pruebas cargadas en este navegador se reemplazarán.");
  if (!confirmed) return;

  state.data = await window.CinemaStore.resetData(DATA_URL);
  ensureDataShape();
  state.moviePage = 1;
  closePersonModal();
  closeMovieEditor();
  renderAll();
}

async function persistAndRender() {
  await window.CinemaStore.saveData(state.data);
  renderMetrics();
  renderMovieList();
}

function countShowtimes(movie) {
  return (movie.funciones || []).length;
}

function findRoomConflict(functions, currentDuration) {
  const scheduled = [];

  state.data.movies.forEach((movie) => {
    if (movie.id === state.editingMovieId) return;
    (movie.funciones || []).forEach((showtime) => {
      scheduled.push({ movieTitle: movie.title, duration: Number(movie.durationMinutes) || 0, ...showtime });
    });
  });

  functions.forEach((showtime) => {
    scheduled.push({
      movieTitle: document.querySelector("#movie-title").value.trim() || "esta película",
      duration: currentDuration,
      current: true,
      ...showtime,
    });
  });

  for (let index = 0; index < scheduled.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < scheduled.length; otherIndex += 1) {
      const first = scheduled[index];
      const second = scheduled[otherIndex];
      if (first.fecha !== second.fecha || (!first.current && !second.current)) continue;

      const firstStart = timeToMinutes(first.hora);
      const secondStart = timeToMinutes(second.hora);
      const overlaps = firstStart < secondStart + second.duration && secondStart < firstStart + first.duration;
      if (overlaps) {
        const conflict = first.current ? second : first;
        return `La Sala 1 ya tiene una función de ${conflict.movieTitle} el ${formatDateForDisplay(conflict.fecha)} a las ${formatTimeForDisplay(conflict.hora)}.`;
      }
    }
  }

  return "";
}

function setFieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = elements.movieForm.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
}

function clearFormErrors() {
  elements.movieFormStatus.textContent = "";
  elements.movieFormStatus.className = "admin-form-status";
  elements.movieForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  elements.movieForm.querySelectorAll(".admin-field-error").forEach((error) => { error.textContent = ""; });
  elements.movieForm.querySelectorAll('[data-showtime-field="time"]').forEach((input) => input.setCustomValidity(""));
}

function showMovieListStatus(message) {
  elements.movieListStatus.textContent = message;
  elements.movieListStatus.hidden = false;
}

function hideMovieListStatus() {
  elements.movieListStatus.textContent = "";
  elements.movieListStatus.hidden = true;
}

function setValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

function createMovieId(title) {
  const slug = normalizeText(title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pelicula";
  return `${slug}-${Date.now().toString(36)}`;
}

function createFunctionId() {
  return `funcion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseTimeInput(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(".", "")
    .replace(/\s+/g, "");
  if (!normalized) return "";

  const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)?$/);
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3] || "";
  if (minute > 59) return "";

  if (period) {
    if (hour < 1 || hour > 12) return "";
    if (period === "am" && hour === 12) hour = 0;
    if (period === "pm" && hour !== 12) hour += 12;
  } else if (hour > 23) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeVisibleTimeInput(input) {
  const normalized = parseTimeInput(input.value);
  input.setCustomValidity(normalized ? "" : "Escribe una hora válida con a. m. o p. m.");
  input.toggleAttribute("aria-invalid", Boolean(input.value.trim()) && !normalized);
  if (normalized) input.value = formatTimeForDisplay(normalized);
}

function compareFunctions(first, second) {
  return `${first.fecha || ""}T${first.hora || ""}`.localeCompare(`${second.fecha || ""}T${second.hora || ""}`);
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "0:0").split(":").map(Number);
  return hour * 60 + minute;
}

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayFromISO(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return -1;
  return new Date(year, month - 1, day, 12, 0, 0).getDay();
}

function formatDateForDisplay(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "fecha sin definir";
  return new Intl.DateTimeFormat("es-HN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12, 0, 0));
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getInitials(title) {
  return String(title || "P").split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function sanitizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#0877d1";
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeBannerVisibility(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(clamp(numericValue, 35, 85) / 5) * 5
    : DEFAULT_BANNER_VISIBILITY;
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
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
    return ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] || "" : "";
  } catch {
    return "";
  }
}

function getSafeImageUrl(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(text)) return text;
  return isSafeExternalUrl(text) ? new URL(text).href : "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function formatTimeForDisplay(value) {
  if (!value) return "";
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "p. m." : "a. m.";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
