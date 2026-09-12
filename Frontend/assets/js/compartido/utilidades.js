"use strict";

/*
 * UTILIDADES COMPARTIDAS
 * ----------------------
 * Funciones pequeñas que antes estaban copiadas en muchos archivos
 * (escapeHTML aparecía 9 veces, compareSeats 3 veces, etc.).
 * Tenerlas en un solo lugar evita que una copia se corrija y las otras no.
 *
 * Este archivo NO habla con el backend ni toca el DOM de ninguna página:
 * solo transforma valores. Por eso puede cargarse en cualquier página.
 */
(function crearUtilidades(global) {
  const SERVIDORES_LOCALES = ["localhost", "127.0.0.1", "[::1]"];
  const ZONA_HONDURAS = "America/Tegucigalpa";

  /* Vista local = el frontend abierto sin Django detrás. Cada *-api.js la usa
     para decidir si responde con datos de demostración o llama al servidor. */
  function esVistaLocal() {
    return SERVIDORES_LOCALES.includes(global.location.hostname);
  }

  /* Evita que un texto guardado (título de película, nombre de cliente…)
     se interprete como HTML al insertarlo con innerHTML. */
  function escaparHtml(valor) {
    return String(valor ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* Redondea a 2 decimales sin errores de coma flotante (0.1 + 0.2). */
  function numeroDinero(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
  }

  function formatearDinero(valor) {
    return `L ${numeroDinero(valor).toLocaleString("es-HN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /*
   * Igual que formatearDinero pero con espacio fijo: "L" nunca queda sola al
   * final de una línea. Taquilla la usa en la rejilla de precios, donde el
   * espacio es estrecho. Son dos variantes a propósito, no una copia olvidada:
   * el texto que sale en pantalla es distinto (espacio normal vs. fijo).
   */
  function formatearDineroUnido(valor) {
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
      minimumFractionDigits: 2,
    }).format(Number(valor || 0));
  }

  /*
   * El texto de respaldo cambia según la pantalla ("Nunca", "Sin registro",
   * "Fecha no disponible"), por eso se recibe como parámetro en lugar de
   * fijarlo aquí: así ninguna pantalla cambia el texto que ya mostraba.
   * zonaHoraria se pasa solo donde ya se usaba, para no mover horas en pantalla.
   */
  function formatearFechaHora(valor, { alterno = "Fecha no disponible", zonaHoraria = "" } = {}) {
    const fecha = new Date(valor || "");
    if (Number.isNaN(fecha.getTime())) return alterno;

    const opciones = { dateStyle: "medium", timeStyle: "short" };
    if (zonaHoraria) opciones.timeZone = zonaHoraria;
    return new Intl.DateTimeFormat("es-HN", opciones).format(fecha);
  }

  /* Ordena A1, A2, … A10 (no alfabéticamente, donde A10 iría antes que A2). */
  function compararAsientos(primero, segundo) {
    const unoPartes = /^([A-Z]+)(\d+)$/.exec(primero) || ["", primero, "0"];
    const dosPartes = /^([A-Z]+)(\d+)$/.exec(segundo) || ["", segundo, "0"];
    return unoPartes[1].localeCompare(dosPartes[1])
      || Number(unoPartes[2]) - Number(dosPartes[2]);
  }

  function crearId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /* Django envía el token CSRF en una cookie; las peticiones que escriben
     deben devolverlo en la cabecera X-CSRFToken. */
  function obtenerCookie(nombre) {
    const prefijo = `${encodeURIComponent(nombre)}=`;
    const cookie = global.document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefijo));
    return cookie ? decodeURIComponent(cookie.slice(prefijo.length)) : "";
  }

  function nombreArchivoSeguro(valor) {
    return String(valor || "archivo").replace(/[^a-z0-9_-]+/gi, "-");
  }

  /* Texto en minúsculas para comparar búsquedas escritas por el usuario. */
  function normalizarTexto(valor) {
    return String(valor || "").trim().toLocaleLowerCase("es-HN");
  }

  /* Como normalizarTexto, pero además quita tildes y signos: sirve para
     comparar identidades ("0801-1990-12345" = "0801199012345"). */
  function normalizarComparacion(valor) {
    return normalizarTexto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function esFechaIso(valor) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
  }

  function aFechaIso(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }

  /* Fecha de hoy en Honduras, sin depender del reloj del navegador. */
  function fechaDeHoyEnHonduras() {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HONDURAS,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
  }

  global.AramacaoUtil = Object.freeze({
    ZONA_HONDURAS,
    esVistaLocal,
    escaparHtml,
    numeroDinero,
    formatearDinero,
    formatearDineroUnido,
    formatearFechaHora,
    compararAsientos,
    crearId,
    obtenerCookie,
    nombreArchivoSeguro,
    normalizarTexto,
    normalizarComparacion,
    esFechaIso,
    aFechaIso,
    fechaDeHoyEnHonduras,
  });
})(window);
