"use strict";

(function initializeAdminSales(global) {
  const api = global.AramacaoSalesApi;
  if (!api) return;

  const elements = {
    sidebar: document.querySelector(".admin-sidebar"),
    menuButton: document.querySelector("#admin-menu-button"),
    modeBadge: document.querySelector("[data-admin-sales-mode]"),
    localNotice: document.querySelector("[data-local-preview]"),
    filterForm: document.querySelector("#sales-filter-form"),
    clearFilters: document.querySelector("#sales-clear-filters"),
    refreshButton: document.querySelector("#sales-refresh-button"),
    listStatus: document.querySelector("#sales-list-status"),
    tableWrap: document.querySelector("#sales-table-wrap"),
    tableBody: document.querySelector("#sales-table-body"),
    empty: document.querySelector("#sales-empty"),
    detailPanel: document.querySelector("#sale-detail-panel"),
    detailTitle: document.querySelector("#sale-detail-title"),
    detailStatus: document.querySelector("#sale-detail-status"),
    detailContent: document.querySelector("#sale-detail-content"),
    closeDetail: document.querySelector("#close-sale-detail"),
    metricTotal: document.querySelector("#sales-metric-total"),
    metricOnline: document.querySelector("#sales-metric-online"),
    metricOffice: document.querySelector("#sales-metric-office"),
    metricAmount: document.querySelector("#sales-metric-amount"),
    dialog: document.querySelector("#sales-action-dialog"),
    actionForm: document.querySelector("#sales-action-form"),
    actionType: document.querySelector("#sales-action-type"),
    actionResourceId: document.querySelector("#sales-action-resource-id"),
    actionEyebrow: document.querySelector("#sales-action-eyebrow"),
    actionTitle: document.querySelector("#sales-action-title"),
    actionDescription: document.querySelector("#sales-action-description"),
    actionReason: document.querySelector("#sales-action-reason"),
    actionStatus: document.querySelector("#sales-action-status"),
    confirmAction: document.querySelector("#confirm-sales-action"),
  };

  const state = {
    sales: [],
    selectedSaleId: "",
    loading: false,
    actionPending: false,
    localAccess: api.esVistaLocal(),
    permissions: new Set(),
  };

  const actionContent = Object.freeze({
    REISSUE: {
      eyebrow: "Seguridad del QR",
      title: "Reemitir boleto",
      description: "El QR anterior dejará de funcionar y se generará uno nuevo. El número del boleto y el asiento se conservan.",
      confirm: "Reemitir QR",
    },
    ANNUL: {
      eyebrow: "Anulación controlada",
      title: "Anular venta",
      description: "La venta y todos sus boletos quedarán anulados. No se permite si algún boleto ya registró un ingreso.",
      confirm: "Anular venta",
    },
    REFUND: {
      eyebrow: "Reembolso controlado",
      title: "Registrar reembolso",
      description: "El backend deberá confirmar el movimiento del pago antes de invalidar todos los boletos de la venta.",
      confirm: "Registrar reembolso",
    },
  });

  bindEvents();
  configureMode();
  initializePage();

  async function initializePage() {
    try {
      const access = await global.AramacaoPrivateAccessReady;
      if (access?.permitido === false) return;
      state.localAccess = Boolean(access?.vista_local);
      state.permissions = new Set(access?.empleado?.permisos || []);
      await loadSales();
    } catch (error) {
      setStatus(elements.listStatus, errorMessage(error), "error");
    }
  }

  function bindEvents() {
    elements.filterForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadSales();
    });
    elements.clearFilters?.addEventListener("click", () => {
      elements.filterForm?.reset();
      loadSales();
    });
    elements.refreshButton?.addEventListener("click", () => loadSales());
    elements.tableBody?.addEventListener("click", handleTableClick);
    elements.detailContent?.addEventListener("click", handleDetailClick);
    elements.closeDetail?.addEventListener("click", closeDetail);
    elements.actionForm?.addEventListener("submit", handleActionSubmit);
    document.querySelectorAll("[data-close-sales-dialog]").forEach((button) => {
      button.addEventListener("click", closeActionDialog);
    });
    elements.menuButton?.addEventListener("click", () => {
      const opened = elements.sidebar?.classList.toggle("open") || false;
      elements.menuButton.setAttribute("aria-expanded", String(opened));
    });
    elements.sidebar?.addEventListener("click", (event) => {
      if (event.target.closest("a") && global.matchMedia("(max-width: 820px)").matches) {
        elements.sidebar.classList.remove("open");
        elements.menuButton?.setAttribute("aria-expanded", "false");
      }
    });
  }

  function configureMode() {
    const local = api.esVistaLocal();
    if (elements.localNotice) elements.localNotice.hidden = !local;
    if (elements.modeBadge) {
      elements.modeBadge.lastChild.textContent = local
        ? " Demostración local"
        : " Conectado al backend";
    }
  }

  async function loadSales() {
    if (state.loading) return;
    state.loading = true;
    setStatus(elements.listStatus, "Consultando ventas…");
    elements.refreshButton && (elements.refreshButton.disabled = true);
    try {
      const response = await api.listarVentasAdministracion(readFilters());
      state.sales = Array.isArray(response?.resultados) ? response.resultados : [];
      renderMetrics(response?.resumen || {});
      renderSales();
      setStatus(elements.listStatus, state.sales.length
        ? `${state.sales.length} venta(s) encontrada(s).`
        : "No se encontraron ventas con estos filtros.");
      if (state.selectedSaleId) {
        const stillVisible = state.sales.some((sale) => sale.id === state.selectedSaleId);
        if (stillVisible) await openDetail(state.selectedSaleId, false);
        else closeDetail();
      }
    } catch (error) {
      state.sales = [];
      renderSales();
      renderMetrics({});
      setStatus(elements.listStatus, errorMessage(error), "error");
    } finally {
      state.loading = false;
      elements.refreshButton && (elements.refreshButton.disabled = false);
    }
  }

  function readFilters() {
    return Object.fromEntries(new FormData(elements.filterForm).entries());
  }

  function renderMetrics(summary) {
    setText(elements.metricTotal, summary.total_ventas ?? state.sales.length);
    setText(elements.metricOnline, summary.ventas_online ?? 0);
    setText(elements.metricOffice, summary.ventas_taquilla ?? 0);
    setText(elements.metricAmount, formatMoney(summary.monto_total));
  }

  function renderSales() {
    if (!elements.tableBody || !elements.tableWrap || !elements.empty) return;
    elements.tableBody.innerHTML = state.sales.map((sale) => `
      <tr>
        <td><span class="sales-primary"><strong>${escapeHTML(sale.numero || sale.referencia || "—")}</strong><small>${escapeHTML(formatDateTime(sale.fecha || sale.creada_en))}</small></span></td>
        <td><span class="sales-primary"><strong>${escapeHTML(sale.cliente_nombre || "Cliente")}</strong><small>${escapeHTML(sale.pelicula || "Película")}</small></span></td>
        <td><span class="sales-primary"><strong>${escapeHTML(channelLabel(sale.canal))}</strong><small>${escapeHTML(paymentLabel(sale.metodo_pago))}</small></span></td>
        <td><span class="sales-primary"><strong>${Number(sale.cantidad_boletos || sale.boletos?.length || 0)}</strong><small>${escapeHTML((sale.asientos || []).join(", ") || "—")}</small></span></td>
        <td><span class="sales-total">${escapeHTML(formatMoney(sale.total))}</span></td>
        <td>${stateBadge(sale.estado)}</td>
        <td><button class="sales-view-button" type="button" data-view-sale="${escapeHTML(sale.id)}">Ver detalle</button></td>
      </tr>
    `).join("");
    elements.tableWrap.hidden = state.sales.length === 0;
    elements.empty.hidden = state.sales.length !== 0;
  }

  function handleTableClick(event) {
    const button = event.target.closest("[data-view-sale]");
    if (button && !button.disabled) openDetail(button.dataset.viewSale);
  }

  async function openDetail(saleId, scroll = true) {
    state.selectedSaleId = saleId;
    elements.detailPanel.hidden = false;
    elements.detailContent.innerHTML = "";
    setStatus(elements.detailStatus, "Cargando detalle…");
    try {
      const response = await api.obtenerVentaAdministracion(saleId);
      const sale = response?.compra || (response?.venta ? {
        ...response.venta,
        boletos: response.boletos || response.venta.boletos || [],
        auditoria: response.auditoria || response.venta.auditoria || [],
      } : response);
      renderDetail(sale);
      setStatus(elements.detailStatus, "");
      if (scroll) elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(elements.detailStatus, errorMessage(error), "error");
    }
  }

  function renderDetail(sale) {
    if (!sale?.id) return;
    elements.detailTitle.textContent = `Venta ${sale.numero || sale.referencia || ""}`;
    const paid = String(sale.estado).toUpperCase() === "PAGADA";
    const usedTickets = (sale.boletos || []).some((ticket) => ticket.estado === "OCUPADO");
    const audit = Array.isArray(sale.auditoria) ? [...sale.auditoria].reverse() : [];
    elements.detailContent.innerHTML = `
      <div class="sale-detail-summary">
        ${summaryField("Estado", stateBadge(sale.estado), true)}
        ${summaryField("Fecha", formatDateTime(sale.fecha || sale.creada_en))}
        ${summaryField("Cliente", sale.cliente_nombre || "Cliente")}
        ${summaryField("Total", formatMoney(sale.total))}
        ${summaryField("Película", sale.pelicula || "—")}
        ${summaryField("Función", `${sale.fecha_funcion || "—"} · ${sale.hora_funcion || "—"}`)}
        ${summaryField("Sala y formato", `${sale.sala || "—"} · ${sale.formato || "—"}`)}
        ${summaryField("Canal y método", `${channelLabel(sale.canal)} · ${paymentLabel(sale.metodo_pago)}`)}
        ${summaryField("Vendedor", sale.vendedor_nombre || "No aplica")}
        ${summaryField("Subtotal", formatMoney(sale.subtotal))}
        ${summaryField("Descuento", `−${formatMoney(sale.descuento)}`)}
        ${summaryField("Boletos", String(sale.boletos?.length || 0))}
      </div>

      <div class="sale-detail-heading">
        <h3>Comprobante y estado de la venta</h3>
        <div class="sale-actions">
          <button class="button button-ghost" type="button" data-download-receipt="${escapeHTML(sale.id)}" ${hasPermission("ventas.reimprimir_comprobante") ? "" : "disabled"}>Reimprimir comprobante</button>
          <button class="button button-ghost sale-danger-button" type="button" data-sale-action="ANNUL" data-resource-id="${escapeHTML(sale.id)}" ${!paid || usedTickets || !hasPermission("ventas.anular") ? "disabled" : ""}>Anular</button>
          <button class="button button-ghost sale-warning-button" type="button" data-sale-action="REFUND" data-resource-id="${escapeHTML(sale.id)}" ${!paid || usedTickets || !hasPermission("pagos.reembolsar") ? "disabled" : ""}>Reembolsar</button>
        </div>
      </div>
      ${usedTickets ? '<p class="sales-status-message is-error">Esta venta tiene al menos un ingreso registrado. Anulación y reembolso requieren revisión del encargado y del backend.</p>' : ""}

      <div class="sale-detail-heading"><h3>Boletos individuales</h3></div>
      <div class="ticket-admin-list">
        ${(sale.boletos || []).map(ticketCard).join("") || "<p>No hay boletos asociados.</p>"}
      </div>

      <div class="sale-detail-heading"><h3>Auditoría de acciones</h3></div>
      ${audit.length ? `<ul class="audit-list">${audit.map((item) => `
        <li><time>${escapeHTML(formatDateTime(item.fecha))}</time><span><strong>${escapeHTML(auditLabel(item.accion))}:</strong> ${escapeHTML(item.motivo || "Sin detalle")} · ${escapeHTML(item.empleado || "Sistema")}</span></li>
      `).join("")}</ul>` : '<p class="sales-status-message">Todavía no hay reemisiones, anulaciones ni reembolsos registrados.</p>'}
    `;
  }

  function ticketCard(ticket) {
    const ticketStatus = String(ticket.estado || "").toUpperCase();
    const canReissue = ticketStatus === "RESERVADO" && hasPermission("boletos.reemitir");
    const canPrint = ticketStatus === "RESERVADO" && hasPermission("boletos.reimprimir");
    const blockedMessage = ticketStatus === "OCUPADO"
      ? `Ingreso registrado${ticket.escaneado_en ? ` el ${formatDateTime(ticket.escaneado_en)}` : ""}; no se entrega otra copia válida.`
      : ticketStatus === "RESERVADO" ? "" : "El boleto ya no está vigente.";
    return `
      <article class="ticket-admin-card">
        <span class="ticket-admin-main"><strong>${escapeHTML(ticket.numero || "Boleto")}</strong><small>Asiento ${escapeHTML(ticket.asiento || "—")} · ${escapeHTML(ticket.formato || "—")}</small></span>
        <span>${stateBadge(ticket.estado)}</span>
        <span class="ticket-admin-main"><strong>${Number(ticket.numero_reemisiones || 0)}</strong><small>${escapeHTML(blockedMessage || "reemisión(es)")}</small></span>
        <div class="ticket-admin-actions">
          <button type="button" data-download-ticket="${escapeHTML(ticket.id)}" ${canPrint ? "" : "disabled"}>Reimprimir</button>
          <button class="reissue-ticket" type="button" data-sale-action="REISSUE" data-resource-id="${escapeHTML(ticket.id)}" ${canReissue ? "" : "disabled"}>Reemitir QR</button>
        </div>
      </article>
    `;
  }

  async function handleDetailClick(event) {
    const receipt = event.target.closest("[data-download-receipt]");
    const ticket = event.target.closest("[data-download-ticket]");
    const action = event.target.closest("[data-sale-action]");
    try {
      if (receipt) await api.descargarComprobanteAdministracion(receipt.dataset.downloadReceipt);
      if (ticket) await api.descargarBoletoAdministracion(ticket.dataset.downloadTicket);
      if (action && !action.disabled) openActionDialog(action.dataset.saleAction, action.dataset.resourceId);
    } catch (error) {
      setStatus(elements.detailStatus, errorMessage(error), "error");
    }
  }

  function openActionDialog(type, resourceId) {
    const content = actionContent[type];
    if (!content || !elements.dialog) return;
    elements.actionType.value = type;
    elements.actionResourceId.value = resourceId;
    elements.actionEyebrow.textContent = content.eyebrow;
    elements.actionTitle.textContent = content.title;
    elements.actionDescription.textContent = content.description;
    elements.confirmAction.textContent = content.confirm;
    elements.actionReason.value = "";
    setStatus(elements.actionStatus, "");
    elements.dialog.showModal();
    global.setTimeout(() => elements.actionReason.focus(), 50);
  }

  async function handleActionSubmit(event) {
    event.preventDefault();
    if (state.actionPending) return;
    const reason = elements.actionReason.value.trim();
    if (reason.length < 10) {
      setStatus(elements.actionStatus, "Escribe un motivo de al menos 10 caracteres.", "error");
      elements.actionReason.focus();
      return;
    }
    state.actionPending = true;
    elements.confirmAction.disabled = true;
    setStatus(elements.actionStatus, "Procesando acción…");
    try {
      const type = elements.actionType.value;
      const resourceId = elements.actionResourceId.value;
      let response;
      if (type === "REISSUE") response = await api.reemitirBoletoAdministracion(resourceId, reason);
      if (type === "ANNUL") response = await api.anularVentaAdministracion(resourceId, reason);
      if (type === "REFUND") response = await api.reembolsarVentaAdministracion(resourceId, reason);
      setStatus(elements.actionStatus, response?.mensaje || "Acción registrada correctamente.", "success");
      if (type === "REISSUE") await api.descargarBoletoAdministracion(resourceId);
      await loadSales();
      global.setTimeout(() => elements.dialog.close(), 650);
    } catch (error) {
      setStatus(elements.actionStatus, errorMessage(error), "error");
    } finally {
      state.actionPending = false;
      elements.confirmAction.disabled = false;
    }
  }

  function closeActionDialog() {
    if (state.actionPending || !elements.dialog?.open) return;
    elements.dialog.close();
    elements.actionForm?.reset();
    setStatus(elements.actionStatus, "");
  }

  function closeDetail() {
    state.selectedSaleId = "";
    elements.detailPanel.hidden = true;
    elements.detailContent.innerHTML = "";
    setStatus(elements.detailStatus, "");
  }

  function summaryField(label, value, raw = false) {
    return `<div><span>${escapeHTML(label)}</span><strong>${raw ? value : escapeHTML(value)}</strong></div>`;
  }

  function stateBadge(value) {
    const status = String(value || "PENDIENTE").toUpperCase();
    const className = status === "ANULADA" || status === "ANULADO"
      ? "is-anulada"
      : status === "REEMBOLSADA" || status === "REEMBOLSADO" ? "is-reembolsada" : "";
    return `<span class="sales-state ${className}">${escapeHTML(status)}</span>`;
  }

  function channelLabel(value) {
    return String(value || "ONLINE").toUpperCase() === "TAQUILLA" ? "Taquilla" : "En línea";
  }

  function hasPermission(permission) {
    return state.localAccess || state.permissions.has(permission);
  }

  function paymentLabel(value) {
    const labels = { ONLINE: "En línea", EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia" };
    return labels[String(value || "").toUpperCase()] || String(value || "No indicado");
  }

  function auditLabel(value) {
    const labels = {
      BOLETO_REEMITIDO: "Boleto reemitido",
      BOLETO_RECUPERADO_TAQUILLA: "Boleto recuperado en Taquilla",
      VENTA_ANULADA: "Venta anulada",
      VENTA_REEMBOLSADA: "Venta reembolsada",
    };
    return labels[value] || String(value || "Acción").replaceAll("_", " ");
  }

  function formatMoney(value) {
    return `L ${(Number(value) || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDateTime(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-HN", {
      dateStyle: "medium", timeStyle: "short",
    }).format(date);
  }

  function setStatus(element, message, type = "") {
    if (!element) return;
    element.textContent = String(message || "");
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function setText(element, value) {
    if (element) element.textContent = String(value ?? "");
  }

  function errorMessage(error) {
    return error?.message || "No fue posible completar la operación.";
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
