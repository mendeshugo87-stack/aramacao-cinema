"use strict";

/*
 * ADMINISTRACIÓN DE PELÍCULAS
 * ----------------------------
 * Lista, filtra, publica y edita películas. El editor de funciones vive en
 * administracion-funciones.js y el recorte de imagen en recortador-imagen.js:
 * este archivo solo orquesta el formulario y decide CUÁNDO llamar a cada uno.
 *
 * Al guardar, la película y sus funciones se envían por separado
 * (peliculas-api.js y funciones-api.js) para que, cuando exista Django,
 * cambiar el título no reenvíe todas las funciones y viceversa.
 */
const MOVIES_PER_PAGE = 10;
const DEFAULT_ACCENT = "#0877d1";
const DEFAULT_BANNER_VISIBILITY = 65;
const CROP_PRESETS = {
  posterImage: { label: "Póster vertical", width: 1000, height: 1500, angosto: true },
  bannerImage: { label: "Fondo horizontal de Inicio", width: 2560, height: 1120 },
  photoImage: { label: "Foto de perfil", width: 400, height: 400, redondo: true, ayuda: "Se mostrará pequeña y recortada en círculo." },
};

const state = {
  data: null,
  moviePage: 1,
  editingMovieId: null,
  posterImage: "",
  bannerImage: "",
  bannerVisibility: DEFAULT_BANNER_VISIBILITY,
  formSelections: { genreIds: [], actorIds: [] },
  personModal: { type: "", lastFocus: null, photoImage: "" },
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
  personPhotoInput: document.querySelector("#person-photo"),
  personPhotoPreview: document.querySelector("#person-photo-preview"),
};

/*
 * El panel independiente de Funciones (administracion-funciones.js) espera
 * esta promesa antes de leer CinemaStore, para no repetir en paralelo la
 * migración de catálogos que hace este archivo al cargar.
 */
window.AdministracionPeliculasListo = initializeAdmin();

async function initializeAdmin() {
  bindEvents();

  try {
    /*
     * A propósito NO se piden estos datos con Promise.all: CinemaStore
     * también escribe en cada lectura (getData vuelve a guardar lo que
     * normaliza), así que leer en paralelo puede hacer que una lectura más
     * vieja sobreescriba la migración de catálogos que hace la siguiente.
     * Uno por uno evita esa condición de carrera.
     */
    const catalogos = await window.PeliculasApi.obtenerCatalogos();
    const { resultados: peliculas } = await window.PeliculasApi.obtenerPeliculas();
    state.data = { movies: peliculas, ...catalogos };
    ensureDataShape();
    await guardarMigracionDeCatalogos();
    renderAll();
  } catch (error) {
    console.error("No fue posible cargar la administración:", error);
    elements.movieList.innerHTML = '<p class="empty-admin-list">No se pudo cargar la cartelera. Abre el proyecto con el servidor local.</p>';
  }
}

/*
 * Las películas antiguas guardaban géneros/director/reparto como texto suelto;
 * ensureDataShape() los convierte a catálogos con ID la primera vez que se
 * cargan. Ese cambio se guarda aquí, pero SOLO sobre los campos que este
 * archivo conoce (películas y catálogos) — nunca se sobrescribe el registro
 * completo, porque promociones-api guarda "promotion" por separado y un
 * guardado ciego lo borraría.
 */
async function guardarMigracionDeCatalogos() {
  const registroCompleto = await window.CinemaStore.getData("../../assets/data/cartelera.json");
  registroCompleto.movies = state.data.movies;
  registroCompleto.genres = state.data.genres;
  registroCompleto.languages = state.data.languages;
  registroCompleto.classifications = state.data.classifications;
  registroCompleto.directors = state.data.directors;
  registroCompleto.actors = state.data.actors;
  await window.CinemaStore.saveData(registroCompleto);
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
  document.querySelector("#add-director").addEventListener("click", () => openPersonModal("director"));
  document.querySelector("#add-actor").addEventListener("click", () => openPersonModal("actor"));
  elements.genreSelect.addEventListener("change", addGenreSelection);
  elements.actorSelect.addEventListener("change", addActorSelection);
  document.querySelector("#reset-demo-data").addEventListener("click", resetDemoData);

  elements.movieList.addEventListener("click", handleMovieListAction);
  elements.moviePagination.addEventListener("click", handleMoviePagination);
  elements.movieForm.addEventListener("click", handleSelectedTagRemoval);
  elements.movieForm.addEventListener("submit", saveMovie);
  elements.personForm.addEventListener("submit", savePerson);

  elements.posterInput.addEventListener("change", () => handleImageSelection(elements.posterInput, "posterImage"));
  elements.bannerInput.addEventListener("change", () => handleImageSelection(elements.bannerInput, "bannerImage"));
  elements.reframePoster.addEventListener("click", () => abrirRecortador(state.posterImage, "posterImage"));
  elements.reframeBanner.addEventListener("click", () => abrirRecortador(state.bannerImage, "bannerImage"));
  elements.personPhotoInput?.addEventListener("change", () => handlePersonPhotoSelection());
  document.querySelector("#reframe-person-photo")?.addEventListener("click", () => {
    abrirRecortador(state.personModal.photoImage, "photoImage", (dataUrl) => {
      state.personModal.photoImage = dataUrl;
      renderImagePreview(elements.personPhotoPreview, dataUrl, "Sin foto");
    });
  });

  elements.bannerVisibility.addEventListener("input", () => {
    state.bannerVisibility = normalizeBannerVisibility(elements.bannerVisibility.value);
    renderBannerPreview();
  });
  document.querySelector("#movie-title").addEventListener("input", renderBannerPreview);
  document.querySelectorAll("[data-cancel-person]").forEach((button) => {
    button.addEventListener("click", closePersonModal);
  });
  document.addEventListener("keydown", (event) => {
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
    (total, movie) => total + (movie.funciones || []).length, 0
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
  const moviesOnPage = filteredMovies.slice(firstMovie, firstMovie + MOVIES_PER_PAGE);

  elements.movieList.innerHTML = moviesOnPage.length
    ? moviesOnPage.map(renderMovieRow).join("")
    : '<p class="empty-admin-list">No hay películas que coincidan con el filtro.</p>';

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
        ${imageUrl ? `<img src="${AramacaoUtil.escaparHtml(imageUrl)}" alt="">` : AramacaoUtil.escaparHtml(getInitials(movie.title))}
      </div>
      <div class="admin-movie-name">
        <strong>${AramacaoUtil.escaparHtml(movie.title)}</strong>
        <small>${AramacaoUtil.escaparHtml((movie.genres || []).join(" / "))} · ${Number(movie.durationMinutes) || 0} min</small>
      </div>
      <div class="admin-movie-detail"><span class="status-pill ${statusClass}">${statusText}</span></div>
      <div class="admin-movie-detail"><strong>${movie.featured && movie.active !== false ? "Sí" : "No"}</strong><small>Carrusel</small></div>
      <div class="admin-movie-detail hide-tablet"><strong>${(movie.funciones || []).length}</strong><small>Funciones</small></div>
      <div class="admin-movie-actions">
        <button type="button" data-action="edit" data-movie-id="${AramacaoUtil.escaparHtml(movie.id)}">Editar</button>
        <button type="button" data-action="toggle" data-movie-id="${AramacaoUtil.escaparHtml(movie.id)}">${movie.active === false ? "Publicar" : "Retirar"}</button>
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
  const nuevoEstadoActivo = movie.active === false;
  try {
    await window.PeliculasApi.cambiarEstadoPelicula(movie.id, {
      active: nuevoEstadoActivo,
      featured: nuevoEstadoActivo ? movie.featured : false,
    });
    movie.active = nuevoEstadoActivo;
    if (!nuevoEstadoActivo) movie.featured = false;
    renderAll();
  } catch (error) {
    showMovieListStatus(error?.message || "No fue posible cambiar la publicación.");
  }
}

function openMovieEditor(movie = null) {
  clearFormErrors();
  hideMovieListStatus();
  elements.movieForm.reset();
  state.editingMovieId = movie?.id || null;
  state.posterImage = movie?.posterImage || "";
  state.bannerImage = movie?.bannerImage || "";
  state.bannerVisibility = normalizeBannerVisibility(movie?.bannerVisibility);
  elements.editorTitle.textContent = movie ? "Editar película" : "Nueva película";
  document.querySelector("#movie-id").value = movie?.id || "";
  renderCatalogSelectors(movie);
  renderPeopleSelectors(movie?.directorId || "", movie?.actorIds || []);

  if (movie) {
    fillMovieForm(movie);
  } else {
    document.querySelector("#movie-active").checked = true;
  }

  renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
  renderBannerPreview();
  syncReframeButtons();
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
}

function closeMovieEditor() {
  elements.editor.setAttribute("hidden", "");
  elements.editor.classList.remove("is-open");
  state.editingMovieId = null;
  document.querySelector("#peliculas").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveMovie(event) {
  event.preventDefault();
  clearFormErrors();
  if (!validateMovieForm()) return;

  const existingMovie = state.data.movies.find((movie) => movie.id === state.editingMovieId);
  const classificationId = normalizeCatalogId(elements.classificationSelect.value);
  const genreIds = [...state.formSelections.genreIds];
  const languageId = elements.languageSelect.value ? normalizeCatalogId(elements.languageSelect.value) : "";
  const directorId = elements.directorSelect.value ? normalizeCatalogId(elements.directorSelect.value) : "";
  const actorIds = [...state.formSelections.actorIds];
  const classification = findCatalogItem(state.data.classifications, classificationId);
  const genres = genreIds.map((id) => findCatalogItem(state.data.genres, id)).filter(Boolean);
  const language = findCatalogItem(state.data.languages, languageId);
  const director = state.data.directors.find((person) => String(person.id) === String(directorId));
  const actors = actorIds.map((id) => state.data.actors.find((person) => String(person.id) === String(id))).filter(Boolean);

  const datosPelicula = {
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
    status: existingMovie?.status || "proximamente",
    featured: document.querySelector("#movie-featured").checked,
    active: document.querySelector("#movie-active").checked,
    accent: existingMovie?.accent || DEFAULT_ACCENT,
    releaseDate: document.querySelector("#movie-release-date").value,
    trailerUrl: document.querySelector("#movie-trailer").value.trim(),
    posterImage: state.posterImage,
    bannerImage: state.bannerImage,
    bannerVisibility: state.bannerVisibility,
  };

  try {
    if (existingMovie) {
      await window.PeliculasApi.actualizarPelicula(state.editingMovieId, datosPelicula);
    } else {
      const nuevaPelicula = { id: createMovieId(datosPelicula.title), createdAt: new Date().toISOString(), ...datosPelicula };
      await window.PeliculasApi.crearPelicula(nuevaPelicula);
    }

    const { resultados } = await window.PeliculasApi.obtenerPeliculas();
    state.data.movies = resultados;
    renderAll();
    showMovieListStatus(`“${datosPelicula.title}” se guardó correctamente. Puedes editar otra película, revisar el cambio en Inicio o ir a Funciones para agregarle horarios.`);
    closeMovieEditor();
  } catch (error) {
    console.error("No fue posible guardar la película:", error);
    elements.movieFormStatus.textContent = error?.message || "No se pudo guardar la película en esta demostración.";
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

  if (!valid) {
    if (!elements.movieFormStatus.textContent) {
      elements.movieFormStatus.textContent = "Revisa los campos marcados antes de guardar.";
      elements.movieFormStatus.className = "admin-form-status error";
    }
    elements.movieForm.querySelector('[aria-invalid="true"]')?.focus();
  }
  return valid;
}

function prepareMovieCatalogs() {
  state.data.genres = normalizeMovieCatalog(state.data.genres);
  state.data.languages = normalizeMovieCatalog(state.data.languages);
  state.data.classifications = normalizeMovieCatalog(state.data.classifications);

  state.data.movies.forEach((movie) => {
    movie.genreIds = Array.isArray(movie.genreIds) && movie.genreIds.length
      ? movie.genreIds.map(normalizeCatalogId)
      : (movie.genres || []).map((name) => addExistingCatalogItem(state.data.genres, name)).filter(Boolean);
    movie.languageIds = Array.isArray(movie.languageIds) && movie.languageIds.length
      ? movie.languageIds.map(normalizeCatalogId)
      : [addExistingCatalogItem(state.data.languages, movie.language)].filter(Boolean);
    movie.languageId = movie.languageId ? normalizeCatalogId(movie.languageId) : movie.languageIds[0] || "";
    movie.classificationId = movie.classificationId
      ? normalizeCatalogId(movie.classificationId)
      : addExistingCatalogItem(state.data.classifications, movie.classification);
  });
}

function normalizeMovieCatalog(catalog) {
  return catalog.map((item, index) => {
    if (typeof item === "string") return { id: index + 1, name: item, active: true };
    return { ...item, id: item.id ?? index + 1, active: item.active !== false && item.activo !== false };
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
    .map((item) => `<option value="${AramacaoUtil.escaparHtml(item.id)}">${AramacaoUtil.escaparHtml(getCatalogName(item))}</option>`)
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
          ${AramacaoUtil.escaparHtml(getCatalogName(item))}
          <button type="button" data-remove-tag="${type}" data-item-id="${AramacaoUtil.escaparHtml(item.id)}" aria-label="Quitar ${AramacaoUtil.escaparHtml(getCatalogName(item))}">×</button>
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
  state.data.directors = state.data.directors.map(normalizePerson);
  state.data.actors = state.data.actors.map(normalizePerson);

  state.data.movies.forEach((movie) => {
    const directorId = movie.directorId || movie.directorIds?.[0] || addExistingPerson(state.data.directors, movie.director);
    movie.directorId = directorId ? normalizeCatalogId(directorId) : "";
    movie.directorIds = movie.directorId ? [movie.directorId] : [];

    if (!Array.isArray(movie.actorIds) || !movie.actorIds.length) {
      movie.actorIds = (movie.cast || []).map((name) => addExistingPerson(state.data.actors, name)).filter(Boolean);
    } else {
      movie.actorIds = movie.actorIds.map(normalizeCatalogId);
    }
  });
}

function normalizePerson(person, index) {
  return {
    ...person,
    id: person.id !== undefined && person.id !== null ? normalizeCatalogId(person.id) : index + 1,
    active: person.active !== false && person.activo !== false,
  };
}

function addExistingPerson(catalog, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName || normalizeText(cleanName) === "por confirmar") return "";
  const existing = catalog.find((person) => normalizeText(getPersonName(person)) === normalizeText(cleanName));
  if (existing) return existing.id;
  const person = { id: getNextNumericId(catalog), fullName: cleanName, active: true };
  catalog.push(person);
  return person.id;
}

function renderPeopleSelectors(selectedDirectorId = "", selectedActorIds = []) {
  const directors = [...state.data.directors].filter((person) => person.active !== false).sort(comparePeople);
  elements.directorSelect.innerHTML = `<option value="">Por confirmar</option>${directors
    .map((person) => `<option value="${AramacaoUtil.escaparHtml(person.id)}">${AramacaoUtil.escaparHtml(getPersonOptionLabel(person, directors))}</option>`)
    .join("")}`;
  elements.directorSelect.value = String(selectedDirectorId || "");

  const actors = [...state.data.actors].filter((person) => person.active !== false).sort(comparePeople);
  elements.actorSelect.innerHTML = `<option value="">Seleccionar actor</option>${actors
    .map((person) => `<option value="${AramacaoUtil.escaparHtml(person.id)}">${AramacaoUtil.escaparHtml(getPersonOptionLabel(person, actors))}</option>`)
    .join("")}`;
  state.formSelections.actorIds = (selectedActorIds || []).map(normalizeCatalogId);
  renderActorTags();
}

function addActorSelection() {
  const actorId = elements.actorSelect.value ? normalizeCatalogId(elements.actorSelect.value) : "";
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
          ${AramacaoUtil.escaparHtml(label)}
          <button type="button" data-remove-tag="actor" data-item-id="${AramacaoUtil.escaparHtml(actor.id)}" aria-label="Quitar ${AramacaoUtil.escaparHtml(label)}">×</button>
        </span>
      `;
    }).join("")
    : '<small class="selected-tag-empty">Sin actores seleccionados</small>';
}

function openPersonModal(type) {
  state.personModal.type = type;
  state.personModal.lastFocus = document.activeElement;
  state.personModal.photoImage = "";
  elements.personForm.reset();
  elements.personType.value = type;
  elements.personFormStatus.textContent = "";
  elements.personFormStatus.className = "admin-form-status";
  elements.personModalTitle.textContent = type === "director" ? "Agregar director" : "Agregar actor";
  elements.personForm.querySelectorAll(".actor-only").forEach((field) => { field.hidden = type !== "actor"; });
  renderImagePreview(elements.personPhotoPreview, "", "Sin foto");
  document.querySelector("#reframe-person-photo")?.setAttribute("hidden", "");
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

async function handlePersonPhotoSelection() {
  const file = elements.personPhotoInput.files[0];
  if (!file) return;
  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > window.RecortadorImagen.MAX_IMAGE_BYTES) {
    elements.personPhotoInput.value = "";
    elements.personFormStatus.textContent = "La foto debe ser PNG, JPG o WebP y pesar como máximo 8 MB.";
    elements.personFormStatus.className = "admin-form-status error";
    return;
  }
  try {
    const origen = await window.RecortadorImagen.leerArchivoComoDataUrl(file);
    abrirRecortador(origen, "photoImage", (dataUrl) => {
      state.personModal.photoImage = dataUrl;
      renderImagePreview(elements.personPhotoPreview, dataUrl, "Sin foto");
      document.querySelector("#reframe-person-photo")?.removeAttribute("hidden");
    });
  } catch (error) {
    console.error("No fue posible leer la foto:", error);
    elements.personPhotoInput.value = "";
  }
}

async function savePerson(event) {
  event.preventDefault();
  const type = elements.personType.value;
  const firstName = elements.personFirstName.value.trim();
  const lastName = elements.personLastName.value.trim();

  if (firstName.length < 2 || lastName.length < 2) {
    return showPersonError("Escribe el nombre y el apellido completos.");
  }

  const datosPersona = {
    firstName,
    lastName,
    biography: elements.personBiography.value.trim(),
    photoImage: state.personModal.photoImage,
  };
  if (type === "actor") datosPersona.stageName = elements.personStageName.value.trim();

  try {
    const { persona } = type === "director"
      ? await window.PeliculasApi.crearDirector(datosPersona)
      : await window.PeliculasApi.crearActor(datosPersona);

    const catalogo = type === "director" ? state.data.directors : state.data.actors;
    catalogo.push(persona);
    const selectedDirectorId = type === "director" ? persona.id : elements.directorSelect.value;
    const selectedActorIds = [...state.formSelections.actorIds];
    if (type === "actor") selectedActorIds.push(persona.id);

    renderPeopleSelectors(selectedDirectorId, selectedActorIds);
    closePersonModal();
  } catch (error) {
    showPersonError(error?.message || "No se pudo guardar en esta demostración.");
  }
}

function showPersonError(message) {
  elements.personFormStatus.textContent = message;
  elements.personFormStatus.className = "admin-form-status error";
}

function getPersonName(person) {
  return String(person?.stageName || person?.nombre_artistico || getPersonLegalName(person)).trim();
}

function getPersonLegalName(person) {
  return String(
    person?.fullName || person?.nombre_completo ||
    [person?.firstName || person?.nombre, person?.lastName || person?.apellido].filter(Boolean).join(" ")
  ).trim();
}

function getPersonOptionLabel(person, catalog) {
  const visibleName = getPersonName(person);
  const legalName = getPersonLegalName(person);
  const repeatedName = legalName && catalog
    .filter((item) => normalizeText(getPersonLegalName(item)) === normalizeText(legalName)).length > 1;
  const nameWithDetails = legalName && normalizeText(visibleName) !== normalizeText(legalName)
    ? `${visibleName} (${legalName})` : visibleName;
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
  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > window.RecortadorImagen.MAX_IMAGE_BYTES) {
    input.value = "";
    elements.movieFormStatus.textContent = "La imagen debe ser PNG, JPG o WebP y pesar como máximo 8 MB.";
    elements.movieFormStatus.className = "admin-form-status error";
    return;
  }
  try {
    const source = await window.RecortadorImagen.leerArchivoComoDataUrl(file);
    abrirRecortador(source, stateKey);
  } catch (error) {
    console.error("No fue posible leer la imagen:", error);
    input.value = "";
    elements.movieFormStatus.textContent = "No se pudo leer la imagen seleccionada.";
    elements.movieFormStatus.className = "admin-form-status error";
  }
}

function abrirRecortador(origen, stateKey, alAplicarPersonalizado = null) {
  window.RecortadorImagen.abrir(origen, CROP_PRESETS[stateKey], alAplicarPersonalizado || ((dataUrl) => {
    state[stateKey] = dataUrl;
    if (stateKey === "posterImage") renderImagePreview(elements.posterPreview, state.posterImage, "Sin póster");
    else renderBannerPreview();
    syncReframeButtons();
  }));
}

function renderImagePreview(container, imageUrl, emptyText) {
  const safeUrl = getSafeImageUrl(imageUrl);
  container.innerHTML = safeUrl ? `<img src="${AramacaoUtil.escaparHtml(safeUrl)}" alt="Vista previa">` : `<span>${emptyText}</span>`;
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
    ? `<img src="${AramacaoUtil.escaparHtml(safeUrl)}" alt="Vista previa del fondo"><span class="banner-preview-copy"><small>Así se verá en Inicio</small><strong>${AramacaoUtil.escaparHtml(title)}</strong></span>`
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

function syncReframeButtons() {
  elements.reframePoster.hidden = !getSafeImageUrl(state.posterImage);
  elements.reframeBanner.hidden = !getSafeImageUrl(state.bannerImage);
}

async function resetDemoData() {
  const confirmed = window.confirm("¿Restablecer las películas y los catálogos de demostración? Las pruebas cargadas en este navegador se reemplazarán.");
  if (!confirmed) return;

  state.data = await window.PeliculasApi.restablecerDatosDemo();
  ensureDataShape();
  state.moviePage = 1;
  closePersonModal();
  closeMovieEditor();
  renderAll();
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

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  return Number.isFinite(numericValue) ? Math.round(clamp(numericValue, 35, 85) / 5) * 5 : DEFAULT_BANNER_VISIBILITY;
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
