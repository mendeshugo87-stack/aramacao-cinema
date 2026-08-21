"use strict";

/* Completa la demostración local después del bloqueo creado por compra.js. */
const finalElements = {
  paymentPanel: document.querySelector("#demo-payment-panel"),
  paymentButton: document.querySelector("#approve-demo-payment"),
  paymentMessage: document.querySelector("#demo-payment-message"),
  ticketPanel: document.querySelector("#purchase-ticket-panel"),
  ticketReference: document.querySelector("#purchase-reference"),
  ticketList: document.querySelector("#purchase-ticket-list"),
  receiptButton: document.querySelector("#download-demo-receipt"),
  stepPayment: document.querySelector("#checkout-step-payment"),
  stepTicket: document.querySelector("#checkout-step-ticket"),
};

document.addEventListener("DOMContentLoaded", initializeFinalCheckout);

function initializeFinalCheckout() {
  if (!finalElements.paymentPanel || !window.AramacaoSalesApi) return;
  finalElements.paymentButton?.addEventListener("click", approveDemoPayment);
  finalElements.receiptButton?.addEventListener("click", () => {
    if (state.completedPurchase?.id) {
      window.AramacaoSalesApi.descargarComprobanteDemo(state.completedPurchase.id);
    }
  });

  const observer = new MutationObserver(syncFinalCheckout);
  observer.observe(elements.blockStatus, { attributes: true, attributeFilter: ["hidden"] });
  syncFinalCheckout();
  updateCheckoutCopy();
}

function syncFinalCheckout() {
  const hasBlock = Boolean(state.currentBlock?.id);
  const completed = Boolean(state.completedPurchase?.id);
  finalElements.paymentPanel.hidden = !hasBlock || completed;
  finalElements.ticketPanel.hidden = !completed;

  if (hasBlock && !completed) {
    finalElements.stepPayment?.classList.add("active");
    finalElements.paymentButton.hidden = !window.AramacaoSalesApi.esVistaLocal();
    finalElements.paymentMessage.textContent = window.AramacaoSalesApi.esVistaLocal()
      ? "No ingreses datos de tarjeta. Este botón simula una aprobación únicamente para probar el flujo completo."
      : "El proveedor de pagos se habilitará cuando Django entregue una sesión de pago válida.";
  }
}

async function approveDemoPayment() {
  if (!state.currentBlock?.id || !state.selectedShowtime || !state.selectedMovie) {
    showError("El bloqueo ya no está activo. Vuelve a seleccionar los asientos.");
    return;
  }

  const totals = calculateTotals();
  finalElements.paymentButton.disabled = true;
  finalElements.paymentButton.textContent = "Registrando pago de prueba…";
  showError("");
  showStatus("");

  try {
    const purchase = await window.AramacaoSalesApi.crearOrden({
      bloqueo_id: state.currentBlock.id,
      funcion_id: state.selectedShowtime.id,
      pelicula_id: state.selectedMovie.id,
      pelicula: getMovieTitle(state.selectedMovie),
      fecha_funcion: state.selectedDate,
      hora_funcion: state.selectedShowtime.time,
      sala: state.selectedShowtime.room || "Sala 1",
      formato: state.selectedShowtime.format,
      precio_unitario: state.selectedShowtime.price,
      asientos: [...state.selectedSeats].sort(compareSeats),
      promocion_2x1: isPromotionAvailable(),
      subtotal: totals.subtotal,
      descuento: totals.discount,
      total: totals.total,
      cliente_id: "vista-local",
      cliente_nombre: "Hugo Méndez",
      cliente_usuario: "hugomendez",
      cliente_identificacion_enmascarada: "0801-••••-•2345",
    });

    const paidSeats = [...state.selectedSeats];
    const blockId = state.currentBlock.id;
    stopBlockCountdown();
    await window.AramacaoSeatApi.liberarBloqueo(blockId);
    state.currentBlock = null;
    state.completedPurchase = purchase;
    state.selectedSeats.clear();
    state.seatPairs.clear();
    paidSeats.forEach((seat) => state.statuses.set(seat, "reserved"));
    renderSeatMap();
    elements.seatCount.textContent = "Compra pagada";
    elements.seatInstruction.textContent = "Los asientos pagados quedaron reservados.";
    elements.seatMap.querySelectorAll(".purchase-seat").forEach((button) => {
      button.disabled = true;
    });
    updateBlockUI();
    await renderIssuedTickets(purchase);
    finalElements.stepPayment?.classList.add("completed");
    finalElements.stepTicket?.classList.add("active", "completed");
    showStatus("Pago de prueba aprobado. Se generó un boleto individual por cada asiento.");
  } catch (error) {
    showError(error?.message || "No fue posible completar el pago de prueba.");
  } finally {
    finalElements.paymentButton.disabled = false;
    finalElements.paymentButton.textContent = "Aprobar pago de prueba";
  }
}

async function renderIssuedTickets(purchase) {
  finalElements.ticketReference.textContent = purchase.numero;
  finalElements.ticketList.replaceChildren();

  for (const ticket of purchase.boletos || []) {
    const article = document.createElement("article");
    article.className = "issued-ticket-card";
    const qrImage = document.createElement("img");
    qrImage.className = "issued-ticket-qr";
    qrImage.alt = `QR del asiento ${ticket.asiento}`;
    qrImage.src = await window.AramacaoSalesApi.generarQrDataUrl(ticket.contenido_qr);

    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `Asiento ${ticket.asiento}`;
    const detail = document.createElement("p");
    detail.textContent = `${purchase.pelicula} · ${purchase.hora_funcion} · ${purchase.formato}`;
    const promotion = document.createElement("p");
    promotion.className = "ticket-promotion";
    promotion.textContent = ticket.promocion_2x1
      ? `Promoción 2x1 · boleto ${ticket.posicion_2x1} de 2`
      : "Admisión individual";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-ghost account-small-button";
    button.textContent = "Descargar boleto";
    button.addEventListener("click", () => window.AramacaoSalesApi.descargarBoletoDemo(ticket.id));
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button button-ghost account-small-button copy-demo-code";
    copyButton.textContent = "Copiar código para probar escáner";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ticket.contenido_qr);
        showStatus(`Código del asiento ${ticket.asiento} copiado. Pégalo en el escáner de Taquilla.`);
      } catch {
        showError("El navegador no permitió copiar el código. Puedes probar el QR con la cámara.");
      }
    });
    content.append(title, detail, promotion, button, copyButton);
    article.append(qrImage, content);
    finalElements.ticketList.append(article);
  }

  finalElements.paymentPanel.hidden = true;
  finalElements.ticketPanel.hidden = false;
  elements.continueButton.hidden = true;
  elements.releaseButton.hidden = true;
}

function updateCheckoutCopy() {
  const intro = document.querySelector(".checkout-intro p:not(.eyebrow):not(.local-preview-notice)");
  if (intro) {
    intro.textContent = "Elige la función, aparta tus asientos durante 10 minutos y continúa al pago protegido.";
  }
  const help = document.querySelector(".summary-help");
  if (help) help.textContent = "En producción, Django emitirá los boletos solamente después de confirmar el pago.";
}
