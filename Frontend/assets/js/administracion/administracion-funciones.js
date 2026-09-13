"use strict";

/*
 * PANEL INDEPENDIENTE DE FUNCIONES
 * ----------------------------------
 * Aparte por completo del formulario de "editar película": aquí el
 * administrador elige una película que ya está en cartelera y agrega, edita
 * o quita sus funciones, incluyendo el 2x1. Esto refleja que, cuando exista
 * Django, "guardar película" y "agregar función" son dos llamadas distintas
 * (peliculas-api.js y funciones-api.js).
 *
 * Todo queda dentro de una función que se ejecuta sola: administracion-
 * peliculas.js también usa los nombres "elements" y "state" a nivel superior,
 * y ambos archivos se cargan en la misma página.
 */
(function panelDeFunciones(global) {
  const NOMBRE_DIA = { 1: "Lunes", 2: "Martes", 3: "Miércoles" };

  const elements = {
    seleccionPelicula: document.querySelector("#functions-movie-select"),
    estadoVacio: document.querySelector("#functions-empty-status"),
    editor: document.querySelector("#functions-editor"),
    lista: document.querySelector("#showtime-editor-list"),
    agregarBoton: document.querySelector("#add-showtime"),
    guardarBoton: document.querySelector("#save-functions-button"),
    formStatus: document.querySelector("#functions-form-status"),
  };

  const state = {
    peliculasEnCartelera: [],
    peliculaSeleccionadaId: "",
    funcionesOriginales: [],
    diasPermitidos: [1, 2, 3],
  };

  /* Espera a que administracion-peliculas.js termine de cargar y migrar los
     catálogos antes de leer CinemaStore, para no repetir en paralelo esa
     misma operación (ver el comentario en administracion-peliculas.js). */
  global.AdministracionFuncionesListo = inicializar();

  async function inicializar() {
    if (!elements.seleccionPelicula) return;

    bindEvents();
    await global.AdministracionPeliculasListo;

    try {
      const { resultados: peliculas } = await global.PeliculasApi.obtenerPeliculas();
      const { promocion } = await global.FuncionesApi.obtenerPromocion();
      state.peliculasEnCartelera = peliculas.filter(
        (pelicula) => pelicula.status === "cartelera" && pelicula.active !== false
      );
      state.diasPermitidos = promocion.allowedWeekdays?.length ? promocion.allowedWeekdays : [1, 2, 3];
      renderizarSelectorPeliculas();
    } catch (error) {
      console.error("No fue posible cargar el panel de funciones:", error);
      elements.estadoVacio.textContent = "No se pudo cargar la lista de películas.";
    }
  }

  function bindEvents() {
    elements.seleccionPelicula.addEventListener("change", seleccionarPelicula);
    elements.agregarBoton.addEventListener("click", () => agregarFila());
    elements.guardarBoton.addEventListener("click", guardarFunciones);

    elements.lista.addEventListener("click", (evento) => {
      const botonQuitar = evento.target.closest("[data-remove-showtime]");
      if (botonQuitar) {
        botonQuitar.closest(".showtime-row").remove();
        mostrarMensajeSiEstaVacia();
        return;
      }
      const pastillaDia = evento.target.closest("[data-toggle-weekday]");
      if (pastillaDia) alternarDiaPermitido(Number(pastillaDia.dataset.toggleWeekday));
    });
    elements.lista.addEventListener("focusout", (evento) => {
      const campoHora = evento.target.closest('[data-showtime-field="time"]');
      if (campoHora) normalizarHoraVisible(campoHora);
    });
    elements.lista.addEventListener("change", (evento) => {
      const fila = evento.target.closest(".showtime-row");
      if (!fila) return;
      if (evento.target.matches('[data-showtime-field="date"], [data-showtime-field="promotion"]')) {
        actualizarMensajePromocion(fila);
      }
      if (evento.target.matches('[data-showtime-field="promotion"]')) {
        fila.querySelector("[data-weekday-panel]").hidden = !evento.target.checked;
      }
    });
  }

  function renderizarSelectorPeliculas() {
    elements.seleccionPelicula.innerHTML = [
      '<option value="">Selecciona una película</option>',
      ...state.peliculasEnCartelera.map((pelicula) => `<option value="${pelicula.id}">${global.AramacaoUtil.escaparHtml(pelicula.title)}</option>`),
    ].join("");
  }

  async function seleccionarPelicula() {
    state.peliculaSeleccionadaId = elements.seleccionPelicula.value;
    mostrarEstadoFormulario("", "");

    if (!state.peliculaSeleccionadaId) {
      elements.editor.hidden = true;
      elements.estadoVacio.hidden = false;
      elements.estadoVacio.textContent = "Selecciona una película para ver y editar sus funciones.";
      return;
    }

    elements.estadoVacio.hidden = false;
    elements.estadoVacio.textContent = "Cargando funciones…";
    try {
      const { resultados: funciones } = await global.FuncionesApi.obtenerFunciones(state.peliculaSeleccionadaId);
      state.funcionesOriginales = structuredClone(funciones || []);
      limpiar();
      [...state.funcionesOriginales]
        .sort(compararFunciones)
        .forEach((showtime) => agregarFila(showtime));
      mostrarMensajeSiEstaVacia();
      elements.estadoVacio.hidden = true;
      elements.editor.hidden = false;
    } catch (error) {
      elements.estadoVacio.textContent = error?.message || "No fue posible cargar las funciones de esta película.";
    }
  }

  async function guardarFunciones() {
    if (!state.peliculaSeleccionadaId) return;

    const validacion = validar();
    if (!validacion.valido) {
      mostrarEstadoFormulario(validacion.mensaje, "error");
      return;
    }

    const funcionesActuales = recolectar();
    elements.guardarBoton.disabled = true;
    mostrarEstadoFormulario("Guardando…", "");

    try {
      await sincronizarFunciones(state.peliculaSeleccionadaId, funcionesActuales);
      const { resultados: funciones } = await global.FuncionesApi.obtenerFunciones(state.peliculaSeleccionadaId);
      state.funcionesOriginales = structuredClone(funciones || []);
      /* Marcar o desmarcar "Aplicar 2x1" cambia que peliculas y funciones
         participan en la promocion. Se vuelve a guardar para que el resumen
         que recibe el backend (peliculas_ids, funciones_ids, fechas y si esta
         activa) coincida con lo que se acaba de guardar. */
      await actualizarResumenPromocion();
      mostrarEstadoFormulario("Las funciones se guardaron correctamente. Revisa el cambio en Inicio.", "success");
    } catch (error) {
      mostrarEstadoFormulario(error?.message || "No fue posible guardar las funciones.", "error");
    } finally {
      elements.guardarBoton.disabled = false;
    }
  }

  /* Compara contra las funciones que había al elegir la película y solo envía lo que cambió. */
  async function sincronizarFunciones(peliculaId, funcionesActuales) {
    const idsActuales = new Set(funcionesActuales.map((funcion) => funcion.id));

    for (const funcion of funcionesActuales) {
      const original = state.funcionesOriginales.find((item) => item.id === funcion.id);
      if (!original) {
        await global.FuncionesApi.crearFuncion(peliculaId, funcion);
      } else if (JSON.stringify(original) !== JSON.stringify(funcion)) {
        await global.FuncionesApi.actualizarFuncion(funcion.id, funcion);
      }
    }

    for (const original of state.funcionesOriginales) {
      if (!idsActuales.has(original.id)) {
        await global.FuncionesApi.eliminarFuncion(original.id);
      }
    }
  }

  /* Recalcula el alcance del 2x1 a partir de las funciones marcadas. No toca
   * los dias permitidos: esos los elige el administrador con las pastillas. */
  async function actualizarResumenPromocion() {
    const { promocion } = await global.FuncionesApi.obtenerPromocion();
    await global.FuncionesApi.guardarPromocion({
      ...promocion,
      allowedWeekdays: state.diasPermitidos,
    });
  }

  /* El administrador activa/desactiva un día directamente desde cualquier
   * función marcada con 2x1; el cambio se guarda de inmediato porque es una
   * regla compartida por toda la cartelera, no algo propio de esa función. */
  async function alternarDiaPermitido(dia) {
    const nuevosDias = state.diasPermitidos.includes(dia)
      ? state.diasPermitidos.filter((item) => item !== dia)
      : [...state.diasPermitidos, dia].sort();
    state.diasPermitidos = nuevosDias;
    renderizarPastillas();
    elements.lista.querySelectorAll(".showtime-row").forEach(actualizarMensajePromocion);

    try {
      const { promocion } = await global.FuncionesApi.obtenerPromocion();
      await global.FuncionesApi.guardarPromocion({ ...promocion, enabled: true, allowedWeekdays: nuevosDias });
    } catch (error) {
      console.error("No fue posible guardar los días permitidos del 2x1:", error);
      mostrarEstadoFormulario(error?.message || "No se pudieron guardar los días del 2x1.", "error");
    }
  }

  function renderizarPastillas() {
    elements.lista.querySelectorAll(".promotion-weekday-pills").forEach((contenedor) => {
      contenedor.innerHTML = pastillasHTML();
    });
  }

  function pastillasHTML() {
    return Object.entries(NOMBRE_DIA).map(([valor, nombre]) => {
      const activo = state.diasPermitidos.includes(Number(valor));
      return `<button type="button" class="weekday-pill${activo ? " active" : ""}" data-toggle-weekday="${valor}">${activo ? "✓ " : ""}${nombre}</button>`;
    }).join("");
  }

  function limpiar() {
    elements.lista.replaceChildren();
  }

  function agregarFila(funcion = {}) {
    elements.lista.querySelector(".no-showtimes-admin")?.remove();
    const fila = document.createElement("div");
    fila.className = "showtime-row";
    fila.dataset.functionId = funcion.id || crearIdFuncion();
    const fechaMinima = funcion.fecha ? "" : ` min="${toLocalISODate(new Date())}"`;

    fila.innerHTML = `
      <label>Fecha
        <input data-showtime-field="date" type="date"${fechaMinima} value="${global.AramacaoUtil.escaparHtml(funcion.fecha || "")}" required>
      </label>
      <label>Hora obligatoria
        <input data-showtime-field="time" type="text" inputmode="numeric" autocomplete="off" placeholder="Ej. 2:00 p. m." value="${global.AramacaoUtil.escaparHtml(formatearHora(funcion.hora || ""))}" required>
      </label>
      <label>Formato
        <select data-showtime-field="format"><option ${funcion.formato === "2D" ? "selected" : ""}>2D</option><option ${funcion.formato === "3D" ? "selected" : ""}>3D</option></select>
      </label>
      <label>Precio (L)
        <input data-showtime-field="price" type="number" min="0" step="1" value="${Number(funcion.precio) || 120}" required>
      </label>
      <span class="fixed-room"><small></small><strong>Sala 1</strong></span>
      <button class="remove-showtime" type="button" data-remove-showtime aria-label="Quitar función">×</button>
      <div class="showtime-promotion-row">
        <label class="showtime-promotion">
          <input data-showtime-field="promotion" type="checkbox" ${funcion.promotion === true ? "checked" : ""}>
          <span><strong>Aplicar 2x1</strong><small>Solo para esta función.</small></span>
        </label>
        <small class="showtime-promotion-message" data-promotion-message></small>
      </div>
      <div class="promotion-weekday-inline" data-weekday-panel ${funcion.promotion === true ? "" : "hidden"}>
        <strong>Días permitidos para 2x1</strong>
        <small>Selecciona los días en los que estará activa la promoción.</small>
        <div class="promotion-weekday-pills">${pastillasHTML()}</div>
      </div>
    `;
    elements.lista.append(fila);
    actualizarMensajePromocion(fila);
  }

  function mostrarMensajeSiEstaVacia() {
    if (elements.lista.querySelector(".showtime-row")) return;
    elements.lista.innerHTML = '<p class="no-showtimes-admin">Todavía no agregaste funciones para esta película.</p>';
  }

  function actualizarMensajePromocion(fila) {
    const fecha = fila.querySelector('[data-showtime-field="date"]').value;
    const casilla = fila.querySelector('[data-showtime-field="promotion"]');
    const mensaje = fila.querySelector("[data-promotion-message]");
    const permitido = esDiaPermitido(fecha);

    fila.classList.toggle("promotion-not-allowed", casilla.checked && Boolean(fecha) && !permitido);
    if (!casilla.checked) {
      mensaje.textContent = "";
    } else if (!fecha) {
      mensaje.textContent = "Selecciona la fecha para validar la promoción.";
    } else if (permitido) {
      mensaje.textContent = "Día permitido por la regla actual.";
    } else {
      mensaje.textContent = `No se puede publicar con 2x1. Días permitidos: ${nombresDeDias(state.diasPermitidos)}.`;
    }
  }

  function esDiaPermitido(fecha) {
    return Boolean(fecha && state.diasPermitidos.includes(obtenerDiaSemana(fecha)));
  }

  function recolectar() {
    return [...elements.lista.querySelectorAll(".showtime-row")]
      .map((fila) => ({
        id: fila.dataset.functionId || crearIdFuncion(),
        fecha: fila.querySelector('[data-showtime-field="date"]').value,
        hora: normalizarHora(fila.querySelector('[data-showtime-field="time"]').value),
        sala: "Sala 1",
        formato: fila.querySelector('[data-showtime-field="format"]').value,
        precio: Number(fila.querySelector('[data-showtime-field="price"]').value),
        promotion: fila.querySelector('[data-showtime-field="promotion"]').checked,
      }))
      .sort(compararFunciones);
  }

  /* Valida el formato de cada fila; el cruce de horario lo revisa funciones-api.js. */
  function validar() {
    const filas = [...elements.lista.querySelectorAll(".showtime-row")];
    if (!filas.length) return { valido: true, mensaje: "" };

    const filaInvalida = filas.find((fila) => {
      const campoHora = fila.querySelector('[data-showtime-field="time"]');
      const horaNormalizada = normalizarHora(campoHora.value);
      campoHora.setCustomValidity(horaNormalizada ? "" : "Escribe una hora válida con a. m. o p. m.");
      campoHora.toggleAttribute("aria-invalid", !horaNormalizada);
      if (horaNormalizada) campoHora.value = formatearHora(horaNormalizada);
      return [...fila.querySelectorAll("input[required], select[required]")].some(
        (campo) => !campo.value || !campo.checkValidity()
      );
    });
    if (filaInvalida) {
      return { valido: false, mensaje: "Cada función debe tener fecha, una hora válida, formato y precio. Ejemplo de hora: 2:00 p. m." };
    }

    const filaConPromocionNoPermitida = filas.find((fila) => {
      const casilla = fila.querySelector('[data-showtime-field="promotion"]');
      const fecha = fila.querySelector('[data-showtime-field="date"]').value;
      actualizarMensajePromocion(fila);
      return casilla.checked && !esDiaPermitido(fecha);
    });
    if (filaConPromocionNoPermitida) {
      return { valido: false, mensaje: `El 2x1 solo puede publicarse en estos días: ${nombresDeDias(state.diasPermitidos)}.` };
    }

    return { valido: true, mensaje: "" };
  }

  function nombresDeDias(dias) {
    return (dias || []).map((dia) => NOMBRE_DIA[dia]).filter(Boolean).join(", ") || "ninguno";
  }

  function mostrarEstadoFormulario(mensaje, tipo) {
    elements.formStatus.textContent = mensaje;
    elements.formStatus.className = `admin-form-status${tipo ? ` ${tipo}` : ""}`;
  }

  function normalizarHoraVisible(campo) {
    const normalizada = normalizarHora(campo.value);
    campo.setCustomValidity(normalizada ? "" : "Escribe una hora válida con a. m. o p. m.");
    campo.toggleAttribute("aria-invalid", Boolean(campo.value.trim()) && !normalizada);
    if (normalizada) campo.value = formatearHora(normalizada);
  }

  function normalizarHora(valor) {
    const texto = String(valor || "").trim().toLowerCase().replaceAll(".", "").replace(/\s+/g, "");
    if (!texto) return "";
    const coincidencia = texto.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)?$/);
    if (!coincidencia) return "";

    let hora = Number(coincidencia[1]);
    const minuto = Number(coincidencia[2] ?? 0);
    const periodo = coincidencia[3] || "";
    if (minuto > 59) return "";

    if (periodo) {
      if (hora < 1 || hora > 12) return "";
      if (periodo === "am" && hora === 12) hora = 0;
      if (periodo === "pm" && hora !== 12) hora += 12;
    } else if (hora > 23) {
      return "";
    }
    return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
  }

  function formatearHora(valor) {
    if (!/^\d{2}:\d{2}$/.test(String(valor || ""))) return String(valor || "");
    const [horaTexto, minuto] = valor.split(":");
    const hora = Number(horaTexto);
    return `${hora % 12 || 12}:${minuto} ${hora >= 12 ? "p. m." : "a. m."}`;
  }

  function compararFunciones(primera, segunda) {
    return `${primera.fecha || ""}T${primera.hora || ""}`.localeCompare(`${segunda.fecha || ""}T${segunda.hora || ""}`);
  }

  function obtenerDiaSemana(fechaISO) {
    const [anio, mes, dia] = String(fechaISO || "").split("-").map(Number);
    if (!anio || !mes || !dia) return -1;
    return new Date(anio, mes - 1, dia, 12, 0, 0).getDay();
  }

  function toLocalISODate(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }

  function crearIdFuncion() {
    return `funcion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
})(window);
