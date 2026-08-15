"use strict";

const DATA_URL = "../../assets/data/cartelera.json";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_ACCENT = "#0877d1";
const DEFAULT_BANNER_VISIBILITY = 65;
const CORRECT_PROMOTION_DESCRIPTION = "Por cada dos admisiones se cobra una en las funciones seleccionadas. Administración configura la promoción y Taquilla solamente informa al cliente.";
const CROP_PRESETS = {
  posterImage: { label: "Póster vertical", ratio: 2 / 3, width: 1000, height: 1500 },
  bannerImage: { label: "Fondo horizontal de Inicio", ratio: 16 / 7, width: 2560, height: 1120 },
};

const state = {
  data: null,
  editingMovieId: null,
  originalFunctionsSignature: "",
  posterImage: "",
  bannerImage: "",
  bannerVisibility: DEFAULT_BANNER_VISIBILITY,
  promotionEditorOpen: false,
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
  cropModal: document.querySelector("#image-crop-modal"),
  cropModalTitle: document.querySelector("#crop-modal-title"),
  cropModalHelp: document.querySelector("#crop-modal-help"),
  cropStage: document.querySelector("#crop-stage"),
  cropImage: document.querySelector("#crop-image"),
  cropZoom: document.querySelector("#crop-zoom"),
  cropStatus: document.querySelector("#crop-status"),
  applyCrop: document.querySelector("#apply-crop"),
  promotionForm: document.querySelector("#promotion-form"),
  promotionEnabled: document.querySelector("#promotion-enabled"),
  promotionMovieOptions: document.querySelector("#promotion-movie-options"),
  promotionStartDate: document.querySelector("#promotion-start-date"),
  promotionEndDate: document.querySelector("#promotion-end-date"),
  promotionScope: document.querySelector("#promotion-scope"),
  promotionFunctionFieldset: document.querySelector("#promotion-function-fieldset"),
  promotionFunctionOptions: document.querySelector("#promotion-function-options"),
  promotionDescription: document.querySelector("#promotion-description"),
  promotionStatus: document.querySelector("#promotion-status"),
  promotionEditor: document.querySelector("#promotion-form"),
  promotionSummary: document.querySelector("#promotion-summary"),
  promotionSummaryState: document.querySelector("#promotion-summary-state"),
  promotionSummaryTitle: document.querySelector("#promotion-summary-title"),
  promotionSummaryPeriod: document.querySelector("#promotion-summary-period"),
  promotionSummaryMovies: document.querySelector("#promotion-summary-movies"),
  promotionSummaryFeedback: document.querySelector("#promotion-summary-feedback"),
  editPromotionButton: document.querySelector("#edit-promotion-button"),
  closePromotionEditor: document.querySelector("#close-promotion-editor"),
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

  elements.search.addEventListener("input", renderMovieList);
  elements.statusFilter.addEventListener("change", renderMovieList);
  document.querySelector("#new-movie-button").addEventListener("click", () => openMovieEditor());
  document.querySelector("#close-movie-editor").addEventListener("click", closeMovieEditor);
  document.querySelector("#cancel-movie-edit").addEventListener("click", closeMovieEditor);
  document.querySelector("#add-showtime").addEventListener("click", () => addShowtimeRow());
  document.querySelector("#reset-demo-data").addEventListener("click", resetDemoData);

  elements.movieList.addEventListener("click", handleMovieListAction);
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

  elements.movieForm.addEventListener("submit", saveMovie);
  elements.promotionForm.addEventListener("submit", savePromotion);
  elements.promotionForm.addEventListener("change", handlePromotionFormChange);
  elements.posterInput.addEventListener("change", () => handleImageSelection(elements.posterInput, "posterImage"));
  elements.bannerInput.addEventListener("change", () => handleImageSelection(elements.bannerInput, "bannerImage"));
  elements.reframePoster.addEventListener("click", () => openImageCropper(state.posterImage, "posterImage"));
  elements.reframeBanner.addEventListener("click", () => openImageCropper(state.bannerImage, "bannerImage"));
  elements.bannerVisibility.addEventListener("input", () => {
    state.bannerVisibility = normalizeBannerVisibility(elements.bannerVisibility.value);
    renderBannerPreview();
  });
  document.querySelector("#movie-title").addEventListener("input", renderBannerPreview);
  elements.editPromotionButton.addEventListener("click", openPromotionEditor);
  elements.closePromotionEditor.addEventListener("click", closePromotionEditor);
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
  window.addEventListener("resize", updateCropTransform);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.cropModal.classList.contains("open")) closeImageCropper();
  });
  document.querySelector("#movie-status").addEventListener("change", syncFeaturedAvailability);
}

function ensureDataShape() {
  state.data.movies = Array.isArray(state.data.movies) ? state.data.movies : [];
  state.data.promotion = {
    enabled: false,
    movieIds: [],
    startDate: "",
    endDate: "",
    allowedWeekdays: [1, 2, 3],
    appliesTo: "todas",
    functionIds: [],
    description: "",
    ...(state.data.promotion || {}),
  };
  if (/vendedor\s+decide/i.test(state.data.promotion.description || "")) {
    state.data.promotion.description = CORRECT_PROMOTION_DESCRIPTION;
  }
  state.data.movies.forEach((movie) => {
    if (typeof movie.active !== "boolean") movie.active = true;
    movie.funciones = Array.isArray(movie.funciones) ? movie.funciones : [];
    movie.bannerVisibility = normalizeBannerVisibility(movie.bannerVisibility);
  });
}

function renderAll() {
  renderMetrics();
  renderMovieList();
  renderPromotionForm();
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

  const movies = state.data.movies.filter((movie) => {
    const searchable = normalizeText([movie.title, movie.classification, ...(movie.genres || [])].join(" "));
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "retirada" ? movie.active === false : movie.status === selectedStatus && movie.active !== false);
    return matchesQuery && matchesStatus;
  });

  if (!movies.length) {
    elements.movieList.innerHTML = '<p class="empty-admin-list">No hay películas que coincidan con el filtro.</p>';
    return;
  }

  elements.movieList.innerHTML = movies.map(renderMovieRow).join("");
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

  if (movie) fillMovieForm(movie);
  else {
    document.querySelector("#movie-active").checked = true;
  }

  renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
  renderBannerPreview();
  syncReframeButtons();
  renderEmptyShowtimeMessage();
  syncFeaturedAvailability();
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
  setValue("movie-classification", movie.classification);
  setValue("movie-genres", (movie.genres || []).join(", "));
  setValue("movie-language", movie.language);
  setValue("movie-director", movie.director);
  setValue("movie-cast", (movie.cast || []).join(", "));
  setValue("movie-status", movie.status || "cartelera");
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
  `;
  elements.showtimeList.append(row);
}

function renderEmptyShowtimeMessage() {
  if (elements.showtimeList.querySelector(".showtime-row")) return;
  elements.showtimeList.innerHTML = '<p class="no-showtimes-admin">Todavía no agregaste funciones para esta película.</p>';
}

async function saveMovie(event) {
  event.preventDefault();
  clearFormErrors();
  if (!validateMovieForm()) return;

  const existingMovie = state.data.movies.find((movie) => movie.id === state.editingMovieId);
  const movieStatus = document.querySelector("#movie-status").value;
  const movie = {
    id: existingMovie?.id || createMovieId(document.querySelector("#movie-title").value),
    title: document.querySelector("#movie-title").value.trim(),
    heroLabel: existingMovie?.heroLabel || "Ahora en cartelera",
    shortSynopsis: document.querySelector("#movie-short-synopsis").value.trim(),
    fullSynopsis: document.querySelector("#movie-full-synopsis").value.trim() || document.querySelector("#movie-short-synopsis").value.trim(),
    durationMinutes: Number(document.querySelector("#movie-duration").value),
    classification: document.querySelector("#movie-classification").value,
    genres: splitCommaList(document.querySelector("#movie-genres").value),
    language: document.querySelector("#movie-language").value.trim(),
    director: document.querySelector("#movie-director").value.trim() || "Por confirmar",
    cast: splitCommaList(document.querySelector("#movie-cast").value, ["Por confirmar"]),
    status: movieStatus,
    featured: movieStatus === "cartelera" && document.querySelector("#movie-featured").checked,
    active: document.querySelector("#movie-active").checked,
    accent: existingMovie?.accent || DEFAULT_ACCENT,
    releaseDate: document.querySelector("#movie-release-date").value,
    trailerUrl: document.querySelector("#movie-trailer").value.trim(),
    posterImage: state.posterImage,
    bannerImage: state.bannerImage,
    bannerVisibility: state.bannerVisibility,
    funciones: collectFunctions(),
  };

  if (existingMovie) Object.assign(existingMovie, movie);
  else state.data.movies.unshift(movie);

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
    ["movie-genres", 2, "Escribe al menos un género."],
    ["movie-language", 2, "Indica el idioma."],
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
      }))
      .sort(compareFunctions)
  );
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

async function savePromotion(event) {
  event.preventDefault();
  clearPromotionStatus();

  const movieIds = getCheckedValues('input[name="promotion-movie"]');
  const allowedWeekdays = getCheckedValues('input[name="promotion-weekday"]').map(Number);
  const functionIds = getCheckedValues('input[name="promotion-function"]');
  const enabled = elements.promotionEnabled.checked;
  const appliesTo = elements.promotionScope.value;
  const startDate = elements.promotionStartDate.value;
  const endDate = elements.promotionEndDate.value;

  if (enabled && !movieIds.length) {
    return showPromotionError("Selecciona al menos una película para activar la promoción.");
  }
  if (enabled && (!startDate || !endDate || startDate > endDate)) {
    return showPromotionError("Selecciona un periodo de fechas válido.");
  }
  if (enabled && !allowedWeekdays.length) {
    return showPromotionError("Selecciona lunes, martes y/o miércoles.");
  }
  if (enabled && appliesTo === "especificas" && !functionIds.length) {
    return showPromotionError("Selecciona al menos una función específica.");
  }

  const eligibleFunctions = getFunctionsForPromotionRules(movieIds, startDate, endDate, allowedWeekdays);
  const effectiveFunctions = appliesTo === "especificas"
    ? eligibleFunctions.filter(({ showtime }) => functionIds.includes(showtime.id))
    : eligibleFunctions;
  const effectiveMovieIds = new Set(effectiveFunctions.map(({ movie }) => movie.id));
  const moviesWithoutFunctions = state.data.movies
    .filter((movie) => movieIds.includes(movie.id) && !effectiveMovieIds.has(movie.id))
    .map((movie) => movie.title);

  if (enabled && moviesWithoutFunctions.length) {
    return showPromotionError(`Estas películas no tienen funciones que cumplan las reglas: ${moviesWithoutFunctions.join(", ")}. Ajusta las fechas, los días o las funciones específicas.`);
  }

  state.data.promotion = {
    ...state.data.promotion,
    enabled,
    movieIds,
    startDate,
    endDate,
    allowedWeekdays,
    appliesTo,
    functionIds: appliesTo === "especificas" ? functionIds : [],
    description: elements.promotionDescription.value.trim(),
  };
  await window.CinemaStore.saveData(state.data);
  state.promotionEditorOpen = false;
  renderPromotionSummary();
  setPromotionEditorVisibility(false);
  elements.promotionSummaryFeedback.textContent = enabled
    ? "Promoción guardada. Inicio y Taquilla ya consultan estas condiciones."
    : "La configuración quedó guardada, pero la promoción está desactivada.";
  elements.promotionSummaryFeedback.hidden = false;
}

function renderPromotionForm() {
  const promotion = state.data.promotion;
  elements.promotionEnabled.checked = Boolean(promotion.enabled);
  elements.promotionStartDate.value = promotion.startDate || "";
  elements.promotionEndDate.value = promotion.endDate || "";
  elements.promotionScope.value = promotion.appliesTo === "especificas" ? "especificas" : "todas";
  elements.promotionDescription.value = promotion.description || "";

  document.querySelectorAll('input[name="promotion-weekday"]').forEach((input) => {
    input.checked = (promotion.allowedWeekdays || []).includes(Number(input.value));
  });

  const eligibleMovies = state.data.movies.filter(
    (movie) => movie.status === "cartelera" && movie.active !== false
  );
  elements.promotionMovieOptions.innerHTML = eligibleMovies.length
    ? eligibleMovies.map((movie) => `
        <label>
          <input type="checkbox" name="promotion-movie" value="${escapeHTML(movie.id)}" ${(promotion.movieIds || []).includes(movie.id) ? "checked" : ""}>
          <span><strong>${escapeHTML(movie.title)}</strong><small>${countShowtimes(movie)} funciones guardadas</small></span>
        </label>
      `).join("")
    : '<p class="promotion-empty">Primero agrega y publica una película en cartelera para configurar la promoción.</p>';

  elements.promotionEnabled.disabled = !eligibleMovies.length;
  renderPromotionFunctionOptions();
  renderPromotionSummary();
  setPromotionEditorVisibility(state.promotionEditorOpen || !hasPromotionConfiguration(promotion));
}

function renderPromotionSummary() {
  const promotion = state.data.promotion;
  const configured = hasPromotionConfiguration(promotion);
  const entries = getSavedPromotionEntries(promotion);
  const effectiveEntries = entries.filter((entry) => entry.functions.length);

  elements.promotionSummary.classList.toggle("is-active", Boolean(promotion.enabled && effectiveEntries.length));
  elements.promotionSummary.classList.toggle("is-inactive", Boolean(configured && !promotion.enabled));
  elements.promotionSummaryState.textContent = promotion.enabled
    ? effectiveEntries.length ? "Activa" : "Revisar"
    : configured ? "Desactivada" : "Sin configurar";
  elements.promotionSummaryTitle.textContent = promotion.enabled
    ? effectiveEntries.length ? "2x1 activo en estas películas" : "La promoción está activa, pero no tiene funciones válidas"
    : configured ? "Promoción guardada, pero desactivada" : "Todavía no hay una promoción configurada";
  elements.promotionSummaryPeriod.textContent = configured
    ? `Del ${formatDateForDisplay(promotion.startDate)} al ${formatDateForDisplay(promotion.endDate)} · ${formatPromotionWeekdays(promotion.allowedWeekdays)}.`
    : "Guarda las reglas para ver aquí el resumen permanente.";

  elements.promotionSummaryMovies.innerHTML = configured
    ? entries.map(({ movie, functions }) => `
        <div class="promotion-summary-movie${functions.length ? "" : " without-functions"}">
          <strong>${escapeHTML(movie.title)}</strong>
          <span>${functions.length ? `${functions.length} ${functions.length === 1 ? "función participante" : "funciones participantes"}` : "Sin funciones que cumplan las reglas"}</span>
          ${functions.length ? `<small>${functions.slice(0, 3).map((showtime) => escapeHTML(formatFunctionSummary(showtime))).join(" · ")}${functions.length > 3 ? ` · +${functions.length - 3} más` : ""}</small>` : ""}
        </div>
      `).join("")
    : "";

  elements.editPromotionButton.textContent = configured ? "Editar promoción" : "Configurar promoción";
}

function hasPromotionConfiguration(promotion) {
  return Boolean(
    (promotion.movieIds || []).length ||
    promotion.startDate ||
    promotion.endDate ||
    (promotion.functionIds || []).length
  );
}

function getFunctionsForPromotionRules(movieIds, startDate, endDate, allowedWeekdays) {
  return state.data.movies
    .filter((movie) => movieIds.includes(movie.id))
    .flatMap((movie) => (movie.funciones || []).map((showtime) => ({ movie, showtime })))
    .filter(({ showtime }) => {
      const weekday = getWeekdayFromISO(showtime.fecha);
      const inPeriod = (!startDate || showtime.fecha >= startDate) && (!endDate || showtime.fecha <= endDate);
      return inPeriod && (!allowedWeekdays.length || allowedWeekdays.includes(weekday));
    })
    .sort((left, right) => compareFunctions(left.showtime, right.showtime));
}

function getSavedPromotionEntries(promotion) {
  const selectedMovieIds = Array.isArray(promotion.movieIds) ? promotion.movieIds : [];
  const eligibleFunctions = getFunctionsForPromotionRules(
    selectedMovieIds,
    promotion.startDate || "",
    promotion.endDate || "",
    promotion.allowedWeekdays || []
  );
  const functionsByMovie = new Map(selectedMovieIds.map((movieId) => [movieId, []]));

  eligibleFunctions.forEach(({ movie, showtime }) => {
    const isSelected = promotion.appliesTo !== "especificas" || (promotion.functionIds || []).includes(showtime.id);
    if (isSelected) functionsByMovie.get(movie.id)?.push(showtime);
  });

  return state.data.movies
    .filter((movie) => selectedMovieIds.includes(movie.id))
    .map((movie) => ({ movie, functions: functionsByMovie.get(movie.id) || [] }));
}

function formatPromotionWeekdays(weekdays) {
  const names = { 1: "lunes", 2: "martes", 3: "miércoles" };
  const selected = (weekdays || []).map((day) => names[day]).filter(Boolean);
  return selected.length ? selected.join(", ") : "sin días seleccionados";
}

function formatFunctionSummary(showtime) {
  const [year, month, day] = String(showtime.fecha || "").split("-");
  return `${day}/${month}/${year} ${formatTimeForDisplay(showtime.hora)} ${showtime.formato}`;
}

function openPromotionEditor() {
  state.promotionEditorOpen = true;
  renderPromotionForm();
  elements.promotionSummaryFeedback.hidden = true;
  window.requestAnimationFrame(() => {
    elements.promotionEditor.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.promotionEnabled.focus();
  });
}

function closePromotionEditor() {
  state.promotionEditorOpen = false;
  setPromotionEditorVisibility(false);
  elements.promotionSummary.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setPromotionEditorVisibility(visible) {
  elements.promotionEditor.hidden = !visible;
}

function handlePromotionFormChange(event) {
  if (
    event.target.matches('input[name="promotion-movie"]') ||
    event.target === elements.promotionStartDate ||
    event.target === elements.promotionEndDate ||
    event.target.matches('input[name="promotion-weekday"]') ||
    event.target === elements.promotionScope
  ) {
    renderPromotionFunctionOptions();
  }
  clearPromotionStatus();
  elements.promotionSummaryFeedback.hidden = true;
}

function renderPromotionFunctionOptions() {
  const showSpecific = elements.promotionScope.value === "especificas";
  elements.promotionFunctionFieldset.hidden = !showSpecific;
  if (!showSpecific) return;

  const selectedMovieIds = getCheckedValues('input[name="promotion-movie"]');
  const selectedWeekdays = getCheckedValues('input[name="promotion-weekday"]').map(Number);
  const startDate = elements.promotionStartDate.value;
  const endDate = elements.promotionEndDate.value;
  const savedIds = new Set(state.data.promotion.functionIds || []);
  const functions = getFunctionsForPromotionRules(selectedMovieIds, startDate, endDate, selectedWeekdays);

  elements.promotionFunctionOptions.innerHTML = functions.length
    ? functions.map(({ movie, showtime }) => `
        <label>
          <input type="checkbox" name="promotion-function" value="${escapeHTML(showtime.id)}" ${savedIds.has(showtime.id) ? "checked" : ""}>
          <span>
            <strong>${escapeHTML(movie.title)}</strong>
            <small>${escapeHTML(formatDateForDisplay(showtime.fecha))} · ${escapeHTML(formatTimeForDisplay(showtime.hora))} · ${escapeHTML(showtime.formato)}</small>
          </span>
        </label>
      `).join("")
    : '<p class="promotion-empty">No hay funciones que coincidan con las películas, fechas y días seleccionados.</p>';
}

function getCheckedValues(selector) {
  return [...elements.promotionForm.querySelectorAll(`${selector}:checked`)].map((input) => input.value);
}

function showPromotionError(message) {
  elements.promotionStatus.textContent = message;
  elements.promotionStatus.className = "admin-form-status error";
}

function clearPromotionStatus() {
  elements.promotionStatus.textContent = "";
  elements.promotionStatus.className = "admin-form-status";
}

async function resetDemoData() {
  const confirmed = window.confirm("¿Restablecer las películas y la promoción de demostración? Las pruebas cargadas en este navegador se reemplazarán.");
  if (!confirmed) return;

  state.data = await window.CinemaStore.resetData(DATA_URL);
  ensureDataShape();
  state.promotionEditorOpen = false;
  closeMovieEditor();
  renderAll();
}

async function persistAndRender() {
  await window.CinemaStore.saveData(state.data);
  renderMetrics();
  renderMovieList();
  renderPromotionForm();
}

function syncFeaturedAvailability() {
  const isUpcoming = document.querySelector("#movie-status").value === "proximamente";
  const featured = document.querySelector("#movie-featured");
  featured.disabled = isUpcoming;
  if (isUpcoming) featured.checked = false;
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

function splitCommaList(value, fallback = []) {
  const items = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
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
