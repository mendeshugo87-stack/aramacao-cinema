"use strict";

const DATA_URL = "../../assets/data/cartelera.json";
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CROP_PRESETS = {
  posterImage: { label: "Póster vertical", ratio: 2 / 3, width: 800, height: 1200 },
  bannerImage: { label: "Imagen del carrusel", ratio: 16 / 7, width: 1600, height: 700 },
};

const state = {
  data: null,
  editingMovieId: null,
  posterImage: "",
  bannerImage: "",
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
  showtimeList: document.querySelector("#showtime-editor-list"),
  posterInput: document.querySelector("#movie-poster"),
  bannerInput: document.querySelector("#movie-banner"),
  posterPreview: document.querySelector("#poster-preview"),
  bannerPreview: document.querySelector("#banner-preview"),
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
  promotionDescription: document.querySelector("#promotion-description"),
  promotionStatus: document.querySelector("#promotion-status"),
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

  elements.movieForm.addEventListener("submit", saveMovie);
  elements.promotionForm.addEventListener("submit", savePromotion);
  elements.posterInput.addEventListener("change", () => handleImageSelection(elements.posterInput, "posterImage"));
  elements.bannerInput.addEventListener("change", () => handleImageSelection(elements.bannerInput, "bannerImage"));
  elements.reframePoster.addEventListener("click", () => openImageCropper(state.posterImage, "posterImage"));
  elements.reframeBanner.addEventListener("click", () => openImageCropper(state.bannerImage, "bannerImage"));
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
  state.data.promotion = state.data.promotion || { enabled: false, description: "" };
  state.data.movies.forEach((movie) => {
    if (typeof movie.active !== "boolean") movie.active = true;
    movie.schedules = movie.schedules || {};
  });
}

function renderAll() {
  renderMetrics();
  renderMovieList();
  elements.promotionEnabled.checked = Boolean(state.data.promotion.enabled);
  elements.promotionDescription.value = state.data.promotion.description || "";
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
  elements.movieForm.reset();
  elements.showtimeList.replaceChildren();
  state.editingMovieId = movie?.id || null;
  state.posterImage = movie?.posterImage || "";
  state.bannerImage = movie?.bannerImage || "";
  elements.editorTitle.textContent = movie ? "Editar película" : "Nueva película";
  document.querySelector("#movie-id").value = movie?.id || "";

  if (movie) fillMovieForm(movie);
  else {
    document.querySelector("#movie-active").checked = true;
    document.querySelector("#movie-accent").value = "#0877d1";
  }

  renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
  renderImagePreview(elements.bannerPreview, state.bannerImage, "Sin imagen");
  syncReframeButtons();
  renderEmptyShowtimeMessage();
  syncFeaturedAvailability();
  elements.editor.hidden = false;
  elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => document.querySelector("#movie-title").focus(), 250);
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
  setValue("movie-accent", sanitizeColor(movie.accent));
  document.querySelector("#movie-active").checked = movie.active !== false;
  document.querySelector("#movie-featured").checked = Boolean(movie.featured);

  Object.entries(movie.schedules || {}).forEach(([weekday, showtimes]) => {
    showtimes.forEach((showtime) => addShowtimeRow({ weekday, ...showtime }));
  });
}

function closeMovieEditor() {
  elements.editor.hidden = true;
  state.editingMovieId = null;
  document.querySelector("#peliculas").scrollIntoView({ behavior: "smooth", block: "start" });
}

function addShowtimeRow(showtime = {}) {
  elements.showtimeList.querySelector(".no-showtimes-admin")?.remove();
  const row = document.createElement("div");
  row.className = "showtime-row";
  row.innerHTML = `
    <label>Día
      <select data-showtime-field="weekday">${WEEKDAYS.map((day, index) => `<option value="${index}" ${String(showtime.weekday) === String(index) ? "selected" : ""}>${day}</option>`).join("")}</select>
    </label>
    <label>Hora
      <input data-showtime-field="time" type="time" value="${toTimeInput(showtime.time)}" required>
    </label>
    <label>Sala
      <input data-showtime-field="room" type="text" value="${escapeHTML(showtime.room || "Sala 1")}" maxlength="30" required>
    </label>
    <label>Formato
      <select data-showtime-field="format"><option ${showtime.format === "2D" ? "selected" : ""}>2D</option><option ${showtime.format === "3D" ? "selected" : ""}>3D</option></select>
    </label>
    <label>Precio (L)
      <input data-showtime-field="price" type="number" min="0" step="1" value="${Number(showtime.price) || 120}" required>
    </label>
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
    accent: document.querySelector("#movie-accent").value,
    releaseDate: document.querySelector("#movie-release-date").value,
    trailerUrl: document.querySelector("#movie-trailer").value.trim(),
    posterImage: state.posterImage,
    bannerImage: state.bannerImage,
    schedules: collectShowtimes(),
  };

  if (existingMovie) Object.assign(existingMovie, movie);
  else state.data.movies.unshift(movie);

  try {
    await persistAndRender();
    elements.movieFormStatus.textContent = "Película guardada. Actualiza Inicio para comprobar el cambio.";
    elements.movieFormStatus.className = "admin-form-status success";
    state.editingMovieId = movie.id;
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

  const invalidShowtime = [...elements.showtimeList.querySelectorAll(".showtime-row")].find((row) =>
    [...row.querySelectorAll("input[required]")].some((input) => !input.value || !input.checkValidity())
  );
  if (invalidShowtime) {
    elements.movieFormStatus.textContent = "Revisa los datos de las funciones.";
    elements.movieFormStatus.className = "admin-form-status error";
    valid = false;
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

function collectShowtimes() {
  const schedules = {};
  elements.showtimeList.querySelectorAll(".showtime-row").forEach((row) => {
    const weekday = row.querySelector('[data-showtime-field="weekday"]').value;
    const showtime = {
      time: formatTimeForDisplay(row.querySelector('[data-showtime-field="time"]').value),
      room: row.querySelector('[data-showtime-field="room"]').value.trim(),
      format: row.querySelector('[data-showtime-field="format"]').value,
      price: Number(row.querySelector('[data-showtime-field="price"]').value),
    };
    if (!schedules[weekday]) schedules[weekday] = [];
    schedules[weekday].push(showtime);
  });
  return schedules;
}

async function handleImageSelection(input, stateKey) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > MAX_IMAGE_BYTES) {
    input.value = "";
    elements.movieFormStatus.textContent = "La imagen debe ser PNG, JPG o WebP y pesar como máximo 4 MB.";
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

function openImageCropper(source, stateKey) {
  const safeSource = getSafeImageUrl(source);
  const preset = CROP_PRESETS[stateKey];
  if (!safeSource || !preset) return;

  state.crop.targetKey = stateKey;
  state.crop.source = safeSource;
  state.crop.lastFocus = document.activeElement;
  elements.cropModalTitle.textContent = `Encuadrar ${preset.label.toLowerCase()}`;
  elements.cropModalHelp.textContent = `Arrastra la imagen y ajusta el zoom. La vista final tendrá proporción ${preset.width === 800 ? "2:3" : "16:7"}.`;
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
    const preview = state.crop.targetKey === "posterImage" ? elements.posterPreview : elements.bannerPreview;
    renderImagePreview(preview, state[state.crop.targetKey], "Sin imagen");
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
  state.data.promotion.enabled = elements.promotionEnabled.checked;
  state.data.promotion.description = elements.promotionDescription.value.trim();
  await window.CinemaStore.saveData(state.data);
  elements.promotionStatus.textContent = "Promoción actualizada en los datos compartidos.";
  elements.promotionStatus.className = "admin-form-status success";
}

async function resetDemoData() {
  const confirmed = window.confirm("¿Restablecer las películas y la promoción de demostración? Las pruebas cargadas en este navegador se reemplazarán.");
  if (!confirmed) return;

  state.data = await window.CinemaStore.resetData(DATA_URL);
  ensureDataShape();
  closeMovieEditor();
  renderAll();
}

async function persistAndRender() {
  await window.CinemaStore.saveData(state.data);
  renderMetrics();
  renderMovieList();
}

function syncFeaturedAvailability() {
  const isUpcoming = document.querySelector("#movie-status").value === "proximamente";
  const featured = document.querySelector("#movie-featured");
  featured.disabled = isUpcoming;
  if (isUpcoming) featured.checked = false;
}

function countShowtimes(movie) {
  return Object.values(movie.schedules || {}).reduce((total, showtimes) => total + showtimes.length, 0);
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

function toTimeInput(displayTime) {
  if (!displayTime) return "";
  const match = String(displayTime).match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i);
  if (!match) return /^\d{2}:\d{2}$/.test(displayTime) ? displayTime : "";
  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3].toLowerCase();
  if (period === "p" && hour !== 12) hour += 12;
  if (period === "a" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
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
