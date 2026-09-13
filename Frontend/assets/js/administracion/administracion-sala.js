"use strict";

/*
 * PANEL "SALA": BUTACAS FUERA DE SERVICIO
 * ----------------------------------------
 * El administrador toca una butaca y la saca de servicio con un motivo.
 * Es una sola sala y el daño es físico, así que el cambio vale para todas
 * las funciones: no se marca por película ni por función.
 *
 * Todo va dentro de una función que se ejecuta sola porque administracion-
 * peliculas.js también usa los nombres "elements" y "state" a nivel superior
 * y las dos se cargan en la misma página.
 */
(function panelDeSala(global) {
  const elements = {
    mapa: document.querySelector("#sala-mapa"),
    lista: document.querySelector("#sala-lista"),
    status: document.querySelector("#sala-status"),
    aforoFisico: document.querySelector("#sala-aforo-fisico"),
    aforoDisponible: document.querySelector("#sala-aforo-disponible"),
    fueraDeServicio: document.querySelector("#sala-fuera-servicio"),
  };

  const state = {
    sala: null,
  };

  /* Espera a que administracion-peliculas.js termine de migrar los catálogos
     antes de leer el almacén, para no escribir los dos a la vez. */
  global.AdministracionSalaListo = inicializar();

  async function inicializar() {
    if (!elements.mapa) return;

    elements.mapa.addEventListener("click", alTocarButaca);
    /* La lista de abajo repite los mismos codigos, por eso comparte manejador. */
    elements.lista?.addEventListener("click", alTocarButaca);
    await global.AdministracionPeliculasListo;
    await cargarSala();
  }

  async function cargarSala() {
    try {
      state.sala = await global.SalaApi.obtenerSala();
      renderizar();
    } catch (error) {
      mostrarEstado(error?.message || "No fue posible cargar el estado de la sala.", "error");
    }
  }

  // -------------------------------------------------------------------
  // Pintar
  // -------------------------------------------------------------------

  function renderizar() {
    const sala = state.sala;
    if (!sala) return;

    elements.mapa.innerHTML = sala.distribucion.map(filaHTML).join("");
    setTexto(elements.aforoFisico, sala.aforo_fisico);
    setTexto(elements.aforoDisponible, sala.aforo_disponible);
    setTexto(elements.fueraDeServicio, sala.aforo_fisico - sala.aforo_disponible);
    renderizarLista();
  }

  function filaHTML(fila) {
    const butacas = fila.asientos.map((asiento) => {
      /* El pasillo va después de la butaca 7, igual que en Compra y Taquilla. */
      const pasillo = asiento.numero === sala().pasillo_despues_del_asiento
        ? '<span class="sala-pasillo" aria-hidden="true"></span>'
        : "";
      return butacaHTML(asiento) + pasillo;
    }).join("");

    return `<div class="sala-fila">
      <span class="sala-fila-letra" aria-hidden="true">${escapar(fila.fila)}</span>
      ${butacas}
    </div>`;
  }

  function butacaHTML(asiento) {
    const rota = asiento.fuera_de_servicio;
    const descripcion = rota
      ? `Butaca ${asiento.codigo}, fuera de servicio: ${asiento.motivo}. Activar de nuevo.`
      : `Butaca ${asiento.codigo}, en servicio. Marcar como fuera de servicio.`;

    return `<button
      class="sala-butaca${rota ? " out-of-service" : ""}"
      type="button"
      data-codigo="${escapar(asiento.codigo)}"
      aria-pressed="${rota}"
      title="${escapar(rota ? asiento.motivo : asiento.codigo)}"
      aria-label="${escapar(descripcion)}"
    >${asiento.numero}</button>`;
  }

  function renderizarLista() {
    const rotas = state.sala.distribucion
      .flatMap((fila) => fila.asientos)
      .filter((asiento) => asiento.fuera_de_servicio);

    if (!rotas.length) {
      elements.lista.innerHTML = "";
      return;
    }

    elements.lista.innerHTML = rotas.map((asiento) => `
      <li>
        <strong>${escapar(asiento.codigo)}</strong>
        <span>${escapar(asiento.motivo)}</span>
        <button class="sala-reactivar" type="button" data-codigo="${escapar(asiento.codigo)}">
          Volver a habilitar
        </button>
      </li>
    `).join("");
  }

  // -------------------------------------------------------------------
  // Cambios
  // -------------------------------------------------------------------

  async function alTocarButaca(evento) {
    const boton = evento.target.closest("[data-codigo]");
    if (!boton) return;

    const codigo = boton.dataset.codigo;
    const asiento = buscarAsiento(codigo);
    if (!asiento) return;

    if (asiento.fuera_de_servicio) await reactivar(codigo);
    else await sacarDeServicio(codigo);
  }

  async function sacarDeServicio(codigo) {
    const motivo = global.prompt(
      `¿Por qué sale de servicio la butaca ${codigo}?\n\nEjemplo: respaldo quebrado.`,
      ""
    );
    /* prompt devuelve null si el administrador cancela. Se limpia el aviso
       anterior para que no parezca que la cancelacion dio error. */
    if (motivo === null) {
      mostrarEstado("", "");
      return;
    }

    try {
      const respuesta = await global.SalaApi.marcarFueraDeServicio(codigo, motivo);
      await cargarSala();
      mostrarEstado(mensajeDeAviso(codigo, respuesta?.funciones_afectadas), "success");
    } catch (error) {
      mostrarEstado(error?.message || "No fue posible marcar la butaca.", "error");
    }
  }

  async function reactivar(codigo) {
    try {
      await global.SalaApi.reactivarAsiento(codigo);
      await cargarSala();
      mostrarEstado(`La butaca ${codigo} vuelve a estar disponible para la venta.`, "success");
    } catch (error) {
      mostrarEstado(error?.message || "No fue posible habilitar la butaca.", "error");
    }
  }

  /*
   * Marcar una butaca rota no invalida los boletos ya vendidos: deja de
   * venderse, pero quien ya pagó conserva el suyo. Si hay funciones futuras
   * con ese asiento vendido, hay que avisarlo para que alguien reubique a esa
   * gente antes de la función.
   */
  function mensajeDeAviso(codigo, funcionesAfectadas) {
    const base = `La butaca ${codigo} quedó fuera de servicio y ya no se ofrece en Compra ni en Taquilla.`;
    const afectadas = Number(funcionesAfectadas) || 0;
    if (!afectadas) return base;

    return `${base} Atención: ya está vendida en ${afectadas} función(es) futura(s); esos boletos siguen siendo válidos y hay que reubicar a esos clientes.`;
  }

  // -------------------------------------------------------------------
  // Apoyos
  // -------------------------------------------------------------------

  function sala() {
    return state.sala;
  }

  function buscarAsiento(codigo) {
    return state.sala?.distribucion
      .flatMap((fila) => fila.asientos)
      .find((asiento) => asiento.codigo === codigo);
  }

  function mostrarEstado(mensaje, tipo) {
    if (!elements.status) return;
    elements.status.textContent = mensaje;
    elements.status.className = `form-status${tipo ? ` ${tipo}` : ""}`;
  }

  function setTexto(elemento, valor) {
    if (elemento) elemento.textContent = String(valor);
  }

  function escapar(valor) {
    return global.AramacaoUtil.escaparHtml(valor);
  }
})(window);
