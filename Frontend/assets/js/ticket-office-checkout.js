"use strict";

/* Presenta comprobante y boletos; la validación pertenece a Control de entrada. */
(function exposeTicketOfficeCheckout(global) {
  function renderSale(purchase) {
    const panel = document.querySelector("#ticket-office-sale-result");
    const reference = document.querySelector("#ticket-office-sale-reference");
    const actions = document.querySelector("#ticket-office-sale-actions");
    const status = document.querySelector("#ticket-office-sale-status");
    if (!panel || !reference || !actions || !status || !purchase) return;

    reference.textContent = purchase.numero || purchase.referencia || "Venta";
    setStatus(status, `${purchase.boletos?.length || 0} boleto(s) generado(s). Los asientos quedaron reservados.`, "success");
    actions.replaceChildren();

    const receiptButton = createActionButton("Descargar comprobante", "button button-ghost");
    bindDownload(receiptButton, status, async () => {
      if (global.AramacaoSalesApi.esVistaLocal()) {
        await global.AramacaoSalesApi.descargarComprobanteDemo(purchase.id);
        return;
      }
      global.location.assign(global.AramacaoSalesApi.rutaComprobanteTaquilla(purchase.id));
    }, "Comprobante preparado para descargar.");
    actions.append(receiptButton);

    (purchase.boletos || []).forEach((ticket) => {
      const ticketButton = createActionButton(`Descargar boleto con QR ${ticket.asiento}`, "button button-primary");
      bindDownload(ticketButton, status, async () => {
        if (global.AramacaoSalesApi.esVistaLocal()) {
          await global.AramacaoSalesApi.descargarBoletoDemo(ticket.id);
          return;
        }
        global.location.assign(global.AramacaoSalesApi.rutaBoletoTaquilla(ticket.id));
      }, `Boleto ${ticket.asiento} con QR preparado para descargar.`);
      actions.append(ticketButton);
    });

    const newSaleButton = createActionButton("Iniciar otra venta", "button button-ghost");
    newSaleButton.addEventListener("click", () => global.location.reload());
    actions.append(newSaleButton);

    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindDownload(button, status, download, successMessage) {
    button.addEventListener("click", async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando…";
      setStatus(status, "Preparando el archivo…", "working");
      try {
        await download();
        setStatus(status, successMessage, "success");
      } catch (error) {
        console.error("No fue posible preparar la descarga de Taquilla:", error);
        setStatus(status, error?.message || "No fue posible preparar el archivo.", "error");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  }

  function setStatus(element, message, state) {
    element.textContent = message;
    element.dataset.state = state;
  }

  function createActionButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    return button;
  }

  global.AramacaoTicketOfficeCheckout = Object.freeze({ renderSale });
})(window);
