"use strict";

/*
 * RECORTADOR DE IMAGEN COMPARTIDO
 * -------------------------------
 * Un solo modal de recorte reutilizado por el póster, el fondo de Inicio y
 * la foto de reparto/dirección. Cada quien lo abre con su propio "preset"
 * (proporción y tamaño final) y recibe el resultado ya recortado mediante
 * una función de retorno — así ningún archivo de películas necesita conocer
 * cómo funciona el arrastre, el zoom ni el canvas.
 */
window.RecortadorImagen = (() => {
  const elementos = {
    modal: document.querySelector("#image-crop-modal"),
    titulo: document.querySelector("#crop-modal-title"),
    ayuda: document.querySelector("#crop-modal-help"),
    escenario: document.querySelector("#crop-stage"),
    imagen: document.querySelector("#crop-image"),
    zoom: document.querySelector("#crop-zoom"),
    estado: document.querySelector("#crop-status"),
    aplicar: document.querySelector("#apply-crop"),
  };

  const recorte = {
    preset: null,
    alAplicar: null,
    zoom: 1,
    desplazamientoX: 0,
    desplazamientoY: 0,
    arrastrando: false,
    punteroX: 0,
    punteroY: 0,
    ultimoFoco: null,
  };

  inicializar();

  function inicializar() {
    if (!elementos.modal) return;

    elementos.zoom.addEventListener("input", () => {
      recorte.zoom = Number(elementos.zoom.value);
      actualizarTransformacion();
    });
    elementos.escenario.addEventListener("pointerdown", iniciarArrastre);
    elementos.escenario.addEventListener("pointermove", moverImagen);
    elementos.escenario.addEventListener("pointerup", detenerArrastre);
    elementos.escenario.addEventListener("pointercancel", detenerArrastre);
    elementos.imagen.addEventListener("load", reiniciarPosicion);
    elementos.aplicar.addEventListener("click", aplicarRecorte);
    document.querySelectorAll("[data-cancel-crop]").forEach((boton) => {
      boton.addEventListener("click", cerrar);
    });
    window.addEventListener("resize", actualizarTransformacion);
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && elementos.modal.classList.contains("open")) cerrar();
    });
  }

  /**
   * @param {string} origen - URL o data-URL de la imagen ya seleccionada.
   * @param {{label:string, width:number, height:number, ayuda?:string, redondo?:boolean}} preset
   * @param {(dataUrl:string)=>void} alAplicar - recibe el resultado recortado.
   */
  function abrir(origen, preset, alAplicar) {
    const origenSeguro = obtenerUrlSegura(origen);
    if (!origenSeguro || !elementos.modal) return;

    recorte.preset = preset;
    recorte.alAplicar = alAplicar;
    recorte.zoom = 1;
    recorte.desplazamientoX = 0;
    recorte.desplazamientoY = 0;
    recorte.ultimoFoco = document.activeElement;

    elementos.titulo.textContent = `Encuadrar ${preset.label.toLowerCase()}`;
    elementos.ayuda.textContent = preset.ayuda || "Arrastra la imagen y ajusta el zoom para elegir la parte que se mostrará.";
    elementos.escenario.style.aspectRatio = `${preset.width} / ${preset.height}`;
    elementos.escenario.classList.toggle("poster-crop", Boolean(preset.angosto));
    elementos.escenario.classList.toggle("person-crop", Boolean(preset.redondo));
    elementos.estado.textContent = "";
    elementos.zoom.value = "1";
    elementos.imagen.src = origenSeguro;
    elementos.modal.removeAttribute("inert");
    elementos.modal.classList.add("open");
    elementos.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
    elementos.modal.querySelector(".crop-close")?.focus();
  }

  function cerrar() {
    if (!elementos.modal?.classList.contains("open")) return;
    elementos.modal.classList.remove("open");
    elementos.modal.setAttribute("aria-hidden", "true");
    elementos.modal.setAttribute("inert", "");
    document.body.classList.remove("admin-modal-open");
    recorte.arrastrando = false;
    elementos.escenario.classList.remove("dragging");
    recorte.ultimoFoco?.focus();
  }

  function reiniciarPosicion() {
    recorte.zoom = 1;
    recorte.desplazamientoX = 0;
    recorte.desplazamientoY = 0;
    elementos.zoom.value = "1";
    actualizarTransformacion();
  }

  function calcularDisposicion() {
    const anchoEscenario = elementos.escenario.clientWidth;
    const altoEscenario = elementos.escenario.clientHeight;
    const anchoImagen = elementos.imagen.naturalWidth;
    const altoImagen = elementos.imagen.naturalHeight;
    if (!anchoEscenario || !altoEscenario || !anchoImagen || !altoImagen) return null;

    const proporcionEscenario = anchoEscenario / altoEscenario;
    const proporcionImagen = anchoImagen / altoImagen;
    let anchoBase;
    let altoBase;

    if (proporcionImagen > proporcionEscenario) {
      altoBase = altoEscenario;
      anchoBase = altoBase * proporcionImagen;
    } else {
      anchoBase = anchoEscenario;
      altoBase = anchoBase / proporcionImagen;
    }

    const ancho = anchoBase * recorte.zoom;
    const alto = altoBase * recorte.zoom;
    const maxX = Math.max(0, (ancho - anchoEscenario) / 2);
    const maxY = Math.max(0, (alto - altoEscenario) / 2);
    recorte.desplazamientoX = limitar(recorte.desplazamientoX, -maxX, maxX);
    recorte.desplazamientoY = limitar(recorte.desplazamientoY, -maxY, maxY);

    return {
      anchoEscenario, altoEscenario, ancho, alto,
      izquierda: (anchoEscenario - ancho) / 2 + recorte.desplazamientoX,
      arriba: (altoEscenario - alto) / 2 + recorte.desplazamientoY,
    };
  }

  function actualizarTransformacion() {
    if (!elementos.modal.classList.contains("open")) return;
    const disposicion = calcularDisposicion();
    if (!disposicion) return;

    Object.assign(elementos.imagen.style, {
      width: `${disposicion.ancho}px`,
      height: `${disposicion.alto}px`,
      left: `${disposicion.izquierda}px`,
      top: `${disposicion.arriba}px`,
    });
  }

  function iniciarArrastre(evento) {
    if (evento.button !== 0 || !elementos.imagen.complete) return;
    recorte.arrastrando = true;
    recorte.punteroX = evento.clientX;
    recorte.punteroY = evento.clientY;
    elementos.escenario.classList.add("dragging");
    elementos.escenario.setPointerCapture(evento.pointerId);
  }

  function moverImagen(evento) {
    if (!recorte.arrastrando) return;
    recorte.desplazamientoX += evento.clientX - recorte.punteroX;
    recorte.desplazamientoY += evento.clientY - recorte.punteroY;
    recorte.punteroX = evento.clientX;
    recorte.punteroY = evento.clientY;
    actualizarTransformacion();
  }

  function detenerArrastre(evento) {
    if (!recorte.arrastrando) return;
    recorte.arrastrando = false;
    elementos.escenario.classList.remove("dragging");
    if (elementos.escenario.hasPointerCapture(evento.pointerId)) {
      elementos.escenario.releasePointerCapture(evento.pointerId);
    }
  }

  function aplicarRecorte() {
    const preset = recorte.preset;
    const disposicion = calcularDisposicion();
    if (!preset || !disposicion) return;

    const escala = elementos.imagen.naturalWidth / disposicion.ancho;
    const origenX = Math.max(0, -disposicion.izquierda * escala);
    const origenY = Math.max(0, -disposicion.arriba * escala);
    const anchoOrigen = disposicion.anchoEscenario * escala;
    const altoOrigen = disposicion.altoEscenario * escala;
    const lienzo = document.createElement("canvas");
    lienzo.width = preset.width;
    lienzo.height = preset.height;
    const contexto = lienzo.getContext("2d");

    try {
      contexto.imageSmoothingEnabled = true;
      contexto.imageSmoothingQuality = "high";
      contexto.drawImage(
        elementos.imagen,
        origenX, origenY, anchoOrigen, altoOrigen,
        0, 0, preset.width, preset.height
      );
      const dataUrl = lienzo.toDataURL("image/webp", 0.9);
      recorte.alAplicar?.(dataUrl);
      cerrar();
    } catch (error) {
      console.error("No fue posible recortar la imagen:", error);
      elementos.estado.textContent = "No se pudo aplicar el encuadre. Selecciona nuevamente el archivo desde tu equipo.";
    }
  }

  function leerArchivoComoDataUrl(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.addEventListener("load", () => resolve(lector.result));
      lector.addEventListener("error", () => reject(lector.error));
      lector.readAsDataURL(archivo);
    });
  }

  function obtenerUrlSegura(valor) {
    if (!valor) return "";
    const texto = String(valor).trim();
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(texto)) return texto;
    try {
      const url = new URL(texto, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function limitar(valor, minimo, maximo) {
    return Math.min(Math.max(valor, minimo), maximo);
  }

  return {
    abrir,
    cerrar,
    leerArchivoComoDataUrl,
    MAX_IMAGE_BYTES: 8 * 1024 * 1024,
  };
})();
