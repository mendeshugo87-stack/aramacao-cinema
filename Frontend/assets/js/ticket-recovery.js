"use strict";

/* Recuperación limitada para Taquilla: busca, verifica documento y reemplaza el QR. */
(function initializeTicketRecovery(global) {
  const api = global.AramacaoSalesApi;
  const root = document.querySelector("#ticket-recovery");
  if (!api || !root) return;

  const elements = {
    searchForm: document.querySelector("#ticket-recovery-search"),
    criteria: document.querySelector("#ticket-recovery-criteria"),
    query: document.querySelector("#ticket-recovery-query"),
    searchButton: document.querySelector("#ticket-recovery-search-button"),
    status: document.querySelector("#ticket-recovery-status"),
    results: document.querySelector("#ticket-recovery-results"),
    customers: document.querySelector("#ticket-recovery-customers"),
    purchases: document.querySelector("#ticket-recovery-purchases"),
    customerTitle: document.querySelector("#ticket-recovery-customer-title"),
    customerDetail: document.querySelector("#ticket-recovery-customer-detail"),
    changeCustomer: document.querySelector("#ticket-recovery-change-customer"),
    purchaseList: document.querySelector("#ticket-recovery-purchase-list"),
    confirmForm: document.querySelector("#ticket-recovery-confirm"),
    selectedTicket: document.querySelector("#ticket-recovery-selected-ticket"),
    ticketId: document.querySelector("#ticket-recovery-ticket-id"),
    documentChecked: document.querySelector("#ticket-recovery-document-checked"),
    reason: document.querySelector("#ticket-recovery-reason"),
    actionStatus: document.querySelector("#ticket-recovery-action-status"),
    cancel: document.querySelector("#ticket-recovery-cancel"),
    confirmButton: document.querySelector("#ticket-recovery-confirm-button"),
  };

  const state = {
    customer: null,
    purchases: [],
    pending: false,
  };

  bindEvents();
  configureSearchField();
  enableWhenAuthorized();

  async function enableWhenAuthorized() {
    try {
      const access = await global.AramacaoPrivateAccessReady;
      if (access?.permitido === false) return;
      const permissions = new Set(access?.empleado?.permisos || []);
      const allowed = Boolean(access?.vista_local)
        || (permissions.has("clientes.buscar_para_recuperacion") && permissions.has("boletos.recuperar_cliente"));
      root.hidden = !allowed;
    } catch {
      root.hidden = true;
    }
  }

  function bindEvents() {
    elements.criteria?.addEventListener("change", configureSearchField);
    elements.searchForm?.addEventListener("submit", handleSearch);
    elements.customers?.addEventListener("click", handleCustomerSelection);
    elements.purchaseList?.addEventListener("click", handleTicketSelection);
    elements.changeCustomer?.addEventListener("click", resetCustomerSelection);
    elements.cancel?.addEventListener("click", closeConfirmation);
    elements.confirmForm?.addEventListener("submit", handleRecovery);
  }

  function configureSearchField() {
    const criteria = elements.criteria?.value || "IDENTIFICACION";
    const settings = {
      IDENTIFICACION: { placeholder: "13 dígitos de identidad", inputMode: "numeric", maxLength: 13 },
      NOMBRE: { placeholder: "Nombre o apellido", inputMode: "text", maxLength: 100 },
      USUARIO: { placeholder: "Nombre de usuario", inputMode: "text", maxLength: 40 },
    }[criteria];
    if (!settings || !elements.query) return;
    elements.query.placeholder = settings.placeholder;
    elements.query.inputMode = settings.inputMode;
    elements.query.maxLength = settings.maxLength;
    elements.query.value = "";
    elements.query.focus();
    clearSearchResults();
  }

  async function handleSearch(event) {
    event.preventDefault();
    if (state.pending) return;
    clearSearchResults();
    setBusy(true);
    setStatus(elements.status, "Buscando coincidencias…");
    try {
      const response = await api.buscarClientesRecuperacion({
        criterio: elements.criteria.value,
        valor: elements.query.value,
      });
      const customers = Array.isArray(response?.resultados) ? response.resultados : [];
      renderCustomers(customers);
      setStatus(
        elements.status,
        customers.length ? `${customers.length} cliente(s) encontrado(s).` : "No se encontró ningún cliente con ese dato.",
        customers.length ? "success" : ""
      );
    } catch (error) {
      setStatus(elements.status, errorMessage(error), "error");
      elements.query.focus();
    } finally {
      setBusy(false);
    }
  }

  function renderCustomers(customers) {
    elements.customers.innerHTML = customers.map((customer) => `
      <tr>
        <td><strong>${escapeHTML(customer.nombre_completo || "Cliente")}</strong></td>
        <td>${escapeHTML(customer.usuario || "—")}</td>
        <td>${escapeHTML(customer.identificacion_enmascarada || "—")}</td>
        <td><button type="button" data-recovery-customer="${escapeHTML(customer.id)}">Ver compras</button></td>
      </tr>
    `).join("");
    elements.results.hidden = customers.length === 0;
  }

  async function handleCustomerSelection(event) {
    const button = event.target.closest("[data-recovery-customer]");
    if (!button || state.pending) return;
    setBusy(true);
    setStatus(elements.status, "Consultando compras del cliente…");
    try {
      const response = await api.listarComprasRecuperablesCliente(button.dataset.recoveryCustomer);
      state.customer = response?.cliente || null;
      state.purchases = normalizeRelevantPurchases(response?.resultados);
      renderPurchases();
      elements.results.hidden = true;
      elements.purchases.hidden = false;
      setStatus(elements.status, state.purchases.length
        ? "Mostrando compras de hoy y funciones futuras, de la más cercana a la más lejana."
        : "El cliente no tiene compras de hoy ni funciones futuras.");
      elements.purchases.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(elements.status, errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function renderPurchases() {
    const customer = state.customer || {};
    elements.customerTitle.textContent = customer.nombre_completo || "Cliente";
    elements.customerDetail.textContent = `${customer.usuario ? `@${customer.usuario} · ` : ""}${customer.identificacion_enmascarada || "Identificación no disponible"}`;
    elements.purchaseList.innerHTML = state.purchases.map((purchase) => `
      <article class="ticket-recovery-purchase">
        <div class="ticket-recovery-purchase-header">
          <div>
            <strong>${escapeHTML(purchase.numero || purchase.referencia || "Compra")}</strong>
            <span>${escapeHTML(purchase.pelicula || "Película")} · ${escapeHTML(purchase.fecha_funcion || "—")} · ${escapeHTML(purchase.hora_funcion || "—")}</span>
          </div>
          <strong>${escapeHTML(String(purchase.estado || "—").toUpperCase())}</strong>
        </div>
        <div class="ticket-recovery-ticket-list">
          ${(purchase.boletos || []).map((ticket) => ticketRow(purchase, ticket)).join("") || "<p>No hay boletos en esta compra.</p>"}
        </div>
      </article>
    `).join("") || '<p class="ticket-recovery-status">No hay compras para mostrar.</p>';
  }

  function ticketRow(purchase, ticket) {
    const recoverable = ticket.recuperable === true;
    const statusMessage = recoverable
      ? "Puede recuperarse después de verificar el documento."
      : ticket.motivo_no_recuperable || "El backend no autorizó la recuperación.";
    return `
      <div class="ticket-recovery-ticket">
        <span><strong>Asiento ${escapeHTML(ticket.asiento || "—")}</strong><small>${escapeHTML(ticket.numero || "Boleto")}</small></span>
        <span class="ticket-recovery-ticket-state${recoverable ? "" : " is-blocked"}">${escapeHTML(statusMessage)}</span>
        <button type="button"
          data-recovery-ticket="${escapeHTML(ticket.id)}"
          data-recovery-label="${escapeHTML(`${purchase.numero || "Compra"} · asiento ${ticket.asiento || "—"}`)}"
          ${recoverable ? "" : "disabled"}>Recuperar QR</button>
      </div>
    `;
  }

  function handleTicketSelection(event) {
    const button = event.target.closest("[data-recovery-ticket]");
    if (!button || button.disabled || state.pending) return;
    elements.ticketId.value = button.dataset.recoveryTicket;
    elements.selectedTicket.textContent = button.dataset.recoveryLabel;
    elements.documentChecked.checked = false;
    elements.reason.value = "";
    setStatus(elements.actionStatus, "");
    elements.confirmForm.hidden = false;
    elements.confirmForm.scrollIntoView({ behavior: "smooth", block: "center" });
    elements.documentChecked.focus();
  }

  async function handleRecovery(event) {
    event.preventDefault();
    if (state.pending) return;
    const reason = elements.reason.value.trim();
    if (!elements.documentChecked.checked) {
      setStatus(elements.actionStatus, "Debes confirmar la revisión del documento físico.", "error");
      elements.documentChecked.focus();
      return;
    }
    if (reason.length < 10) {
      setStatus(elements.actionStatus, "Escribe un motivo de al menos 10 caracteres.", "error");
      elements.reason.focus();
      return;
    }

    setBusy(true);
    elements.confirmButton.disabled = true;
    setStatus(elements.actionStatus, "Invalidando el QR anterior y generando el nuevo…");
    try {
      const ticketId = elements.ticketId.value;
      const response = await api.recuperarBoletoTaquilla(ticketId, {
        cliente_id: state.customer.id,
        motivo: reason,
        documento_verificado: true,
      });
      setStatus(elements.actionStatus, response?.mensaje || "Boleto recuperado correctamente.", "success");
      await downloadRecoveredTicket(ticketId, response?.descarga_url);
      const refreshed = await api.listarComprasRecuperablesCliente(state.customer.id);
      state.purchases = normalizeRelevantPurchases(refreshed?.resultados);
      renderPurchases();
      global.setTimeout(closeConfirmation, 900);
    } catch (error) {
      setStatus(elements.actionStatus, errorMessage(error), "error");
    } finally {
      elements.confirmButton.disabled = false;
      setBusy(false);
    }
  }

  async function downloadRecoveredTicket(ticketId, downloadUrl) {
    if (api.esVistaLocal()) {
      await api.descargarBoletoDemo(ticketId);
      return;
    }
    const destination = new URL(downloadUrl || api.rutaBoletoTaquilla(ticketId), global.location.origin);
    if (destination.origin !== global.location.origin) {
      throw new Error("El backend devolvió una descarga externa no permitida.");
    }
    global.location.assign(destination.href);
  }

  function resetCustomerSelection() {
    state.customer = null;
    state.purchases = [];
    elements.purchases.hidden = true;
    closeConfirmation();
    elements.query.focus();
    setStatus(elements.status, "Realiza una nueva búsqueda.");
  }

  function closeConfirmation() {
    elements.confirmForm.hidden = true;
    elements.confirmForm.reset();
    elements.ticketId.value = "";
    elements.selectedTicket.textContent = "—";
    setStatus(elements.actionStatus, "");
  }

  function clearSearchResults() {
    elements.customers.innerHTML = "";
    elements.results.hidden = true;
    elements.purchases.hidden = true;
    closeConfirmation();
    state.customer = null;
    state.purchases = [];
    setStatus(elements.status, "");
  }

  function setBusy(busy) {
    state.pending = busy;
    elements.searchButton.disabled = busy;
    elements.criteria.disabled = busy;
    elements.query.disabled = busy;
  }

  function setStatus(element, message, type = "") {
    if (!element) return;
    element.textContent = String(message || "");
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function errorMessage(error) {
    return error?.message || "No fue posible completar la operación.";
  }

  function normalizeRelevantPurchases(purchases) {
    const today = currentHondurasDate();
    return (Array.isArray(purchases) ? purchases : [])
      .filter((purchase) => {
        const functionDate = String(purchase?.fecha_funcion || "");
        return /^\d{4}-\d{2}-\d{2}$/.test(functionDate) && functionDate >= today;
      })
      .sort((left, right) => functionSortValue(left) - functionSortValue(right));
  }

  function currentHondurasDate() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Tegucigalpa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function functionSortValue(purchase) {
    const dateValue = String(purchase?.fecha_funcion || "");
    const rawTime = String(purchase?.hora_funcion || "").toLocaleLowerCase("es-HN");
    const match = rawTime.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !match) return Number.MAX_SAFE_INTEGER;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (/p\.?\s*m\.?/.test(rawTime) && hour < 12) hour += 12;
    if (/a\.?\s*m\.?/.test(rawTime) && hour === 12) hour = 0;
    const date = new Date(`${dateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-06:00`);
    return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})(window);
