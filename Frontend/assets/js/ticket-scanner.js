"use strict";

/* Escáner privado de boletos. Django volverá a validar permisos y token. */
const scannerElements = {
  input: document.querySelector("#qr-token-input"),
  validate: document.querySelector("#validate-qr-button"),
  startCamera: document.querySelector("#start-qr-camera"),
  stopCamera: document.querySelector("#stop-qr-camera"),
  video: document.querySelector("#qr-camera-preview"),
  status: document.querySelector("#qr-scan-status"),
  result: document.querySelector("#qr-scan-result"),
};

let scannerStream = null;
let scannerFrame = null;
let barcodeDetector = null;

document.addEventListener("DOMContentLoaded", initializeTicketScanner);

function initializeTicketScanner() {
  if (!scannerElements.validate || !window.AramacaoSalesApi) return;
  scannerElements.validate.addEventListener("click", () => validateTicketQr(scannerElements.input.value));
  scannerElements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") validateTicketQr(scannerElements.input.value);
  });
  scannerElements.startCamera?.addEventListener("click", startQrCamera);
  scannerElements.stopCamera?.addEventListener("click", stopQrCamera);
}

async function validateTicketQr(value) {
  setScannerStatus("Validando boleto…", "");
  scannerElements.result.hidden = true;
  try {
    const response = await window.AramacaoSalesApi.escanearBoleto(value);
    renderScannerResult(response);
    setScannerStatus(response.mensaje || "Ingreso registrado.", "success");
    scannerElements.input.value = "";

    const ticket = response.boleto;
    if (typeof state !== "undefined" && String(state.selectedShowtime?.id || "") === String(ticket?.funcion_id || "")) {
      if (ticket?.asiento) {
        state.seatStatuses.set(ticket.asiento, "occupied");
        if (typeof renderSeatMap === "function") renderSeatMap();
      }
    }
  } catch (error) {
    const detail = error?.details?.escaneado_en
      ? ` Primer escaneo: ${formatScannerDate(error.details.escaneado_en)}.`
      : "";
    setScannerStatus(`${error?.message || "No fue posible validar el boleto."}${detail}`, "error");
  }
}

function renderScannerResult(response) {
  const ticket = response?.boleto;
  if (!ticket) return;
  scannerElements.result.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = "Boleto válido · ingreso registrado";
  const list = document.createElement("dl");
  [
    ["Comprador", ticket.comprador],
    ["Película", ticket.pelicula],
    ["Función", `${ticket.fecha_funcion} · ${ticket.hora_funcion}`],
    ["Sala y formato", `${ticket.sala} · ${ticket.formato}`],
    ["Asiento", ticket.asiento],
    ["Boleto", ticket.numero],
    ["Promoción", ticket.promocion_2x1 ? `2x1 · boleto ${ticket.posicion_2x1} de 2` : "Normal"],
    ["Estado", ticket.estado],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value || "—";
    row.append(term, detail);
    list.append(row);
  });

  const pair = response.pareja_2x1;
  const pairMessage = document.createElement("p");
  if (pair) {
    pairMessage.className = pair.falta_escanear ? "pair-pending" : "pair-complete";
    pairMessage.textContent = pair.falta_escanear
      ? `2x1: falta escanear el boleto del asiento ${pair.asiento}.`
      : `2x1 completo: el asiento ${pair.asiento} ya ingresó.`;
  }

  scannerElements.result.append(title, list);
  if (pair) scannerElements.result.append(pairMessage);
  scannerElements.result.hidden = false;
}

async function startQrCamera() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    setScannerStatus("Este navegador no permite el escaneo por cámara. Escribe o pega el código para hacer la prueba.", "error");
    return;
  }
  try {
    barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    scannerElements.video.srcObject = scannerStream;
    scannerElements.video.hidden = false;
    scannerElements.stopCamera.hidden = false;
    scannerElements.startCamera.hidden = true;
    await scannerElements.video.play();
    scanCameraFrame();
  } catch {
    setScannerStatus("No fue posible abrir la cámara. Revisa el permiso del navegador.", "error");
    stopQrCamera();
  }
}

async function scanCameraFrame() {
  if (!scannerStream || !barcodeDetector) return;
  try {
    const codes = await barcodeDetector.detect(scannerElements.video);
    const value = codes[0]?.rawValue;
    if (value) {
      stopQrCamera();
      await validateTicketQr(value);
      return;
    }
  } catch {
    // Un fotograma ilegible es normal; se intenta el siguiente.
  }
  scannerFrame = requestAnimationFrame(scanCameraFrame);
}

function stopQrCamera() {
  if (scannerFrame) cancelAnimationFrame(scannerFrame);
  scannerFrame = null;
  scannerStream?.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  if (scannerElements.video) {
    scannerElements.video.srcObject = null;
    scannerElements.video.hidden = true;
  }
  if (scannerElements.stopCamera) scannerElements.stopCamera.hidden = true;
  if (scannerElements.startCamera) scannerElements.startCamera.hidden = false;
}

function setScannerStatus(message, type) {
  scannerElements.status.textContent = message || "";
  scannerElements.status.className = `qr-scan-status${type ? ` ${type}` : ""}`;
}

function formatScannerDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "desconocido" : new Intl.DateTimeFormat("es-HN", {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}
