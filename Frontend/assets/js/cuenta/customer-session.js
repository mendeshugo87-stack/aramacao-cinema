"use strict";

const customerPage = document.querySelector("[data-customer-protected]");

document.addEventListener("DOMContentLoaded", initializeCustomerArea);

const localPreviewCustomer = Object.freeze({
  id: "vista-local",
  nombre_corto: "Hugo",
  nombre_completo: "Hugo Méndez",
  usuario: "hugomendez",
  correo: "hugo@example.com",
  telefono: "+504 9999-9999",
  tipo_identificacion: "IDENTIDAD_HN",
  identificacion_enmascarada: "0801-••••-•2345",
  correo_verificado: true,
  activo: true,
});

let currentCustomer = null;

async function initializeCustomerArea() {
  if (!customerPage) return;
  bindPasswordToggles();
  bindLogoutButtons();

  try {
    currentCustomer = await loadCurrentCustomer();
    renderCommonCustomerData(currentCustomer);
    await initializeCurrentView(customerPage.dataset.accountView);
  } catch (error) {
    if (isAuthenticationError(error)) {
      redirectToLogin();
      return;
    }
    setPageStatus(getCustomerErrorMessage(error), "error");
  }
}

async function loadCurrentCustomer() {
  if (isLocalPreview()) {
    document.querySelectorAll("[data-local-preview]").forEach((element) => {
      element.hidden = false;
    });
    return {
      ...localPreviewCustomer,
      ...(readPublicDemoCustomer() || {}),
    };
  }

  const response = await window.AramacaoCustomerApi.obtenerSesionActual();
  if (!response?.autenticado || !response?.cliente) {
    throw new window.AramacaoCustomerApi.CustomerApiError(
      "Debes iniciar sesión.",
      401,
      "AUTENTICACION_REQUERIDA",
      null
    );
  }
  return response.cliente;
}

async function initializeCurrentView(view) {
  if (view === "profile") await initializeProfileView();
  if (view === "security") initializeSecurityView();
  if (view === "purchases") await initializePurchasesView();
  if (view === "purchase-detail") await initializePurchaseDetailView();
}

function renderCommonCustomerData(customer) {
  document.querySelectorAll("[data-customer-name]").forEach((element) => {
    element.textContent = customer.nombre_corto || firstName(customer.nombre_completo) || customer.usuario;
  });
  document.querySelectorAll("[data-customer-email]").forEach((element) => {
    element.textContent = customer.correo || "Correo no disponible";
  });
  document.querySelectorAll("[data-customer-avatar]").forEach((element) => {
    element.textContent = initials(customer.nombre_completo || customer.usuario);
  });
}

async function initializeProfileView() {
  let customer = currentCustomer;
  if (!isLocalPreview()) {
    const response = await window.AramacaoCustomerApi.obtenerMiCuenta();
    customer = response?.cliente || currentCustomer;
    currentCustomer = customer;
  }
  renderProfile(customer);
  document.querySelector("[data-customer-form='profile']")?.addEventListener("submit", updateProfile);
}

function renderProfile(customer) {
  setText("profile-name", customer.nombre_completo);
  setText("profile-email", customer.correo);
  setText("profile-identification", customer.identificacion_enmascarada);
  setText("profile-identification-type", identificationTypeName(customer.tipo_identificacion));
  setText("profile-email-status", customer.correo_verificado ? "Correo verificado" : "Correo pendiente de verificación");

  const username = document.querySelector("#profile-username");
  const phone = document.querySelector("#profile-phone");
  if (username) {
    username.value = customer.usuario || "";
    username.dataset.currentValue = customer.usuario || "";
  }
  if (phone) phone.value = customer.telefono || "";
}

async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormErrors(form);

  const username = document.querySelector("#profile-username");
  const phone = document.querySelector("#profile-phone");
  const password = document.querySelector("#profile-current-password");
  const usernameChanged = username.value.trim().toLowerCase() !== username.dataset.currentValue.toLowerCase();
  let valid = true;

  if (!/^[a-zA-Z][a-zA-Z0-9._-]{3,39}$/.test(username.value.trim())) {
    valid = setFieldError(form, username, "Usa de 4 a 40 caracteres y comienza con una letra.") && valid;
  }
  if (!/^[+\d][\d\s-]{7,19}$/.test(phone.value.trim())) {
    valid = setFieldError(form, phone, "Escribe un teléfono válido.") && valid;
  }
  if (usernameChanged && !password.value) {
    valid = setFieldError(form, password, "Escribe tu contraseña actual para cambiar el usuario.") && valid;
  }
  if (!valid) {
    setFormStatus(form, "Revisa los campos marcados.", "error");
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  if (isLocalPreview()) {
    password.value = "";
    setFormStatus(form, "Demostración local: Django guardará estos cambios después de comprobar la contraseña.", "success");
    return;
  }

  setFormBusy(form, true);
  try {
    const changes = {
      telefono: phone.value.trim(),
      usuario: username.value.trim().toLowerCase(),
    };
    if (usernameChanged) changes.contrasena_actual = password.value;
    const response = await window.AramacaoCustomerApi.actualizarMiCuenta(changes);
    currentCustomer = response?.cliente || { ...currentCustomer, ...changes };
    password.value = "";
    renderCommonCustomerData(currentCustomer);
    renderProfile(currentCustomer);
    setFormStatus(form, response?.mensaje || "Datos actualizados.", "success");
  } catch (error) {
    password.value = "";
    setFormStatus(form, getCustomerErrorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

function initializeSecurityView() {
  setText("security-current-email", currentCustomer.correo);
  document.querySelector("[data-customer-form='password']")?.addEventListener("submit", changePassword);
  document.querySelector("[data-customer-form='email']")?.addEventListener("submit", requestEmailChange);
  document.querySelector("[data-customer-form='verify-new-email']")?.addEventListener("submit", verifyNewEmail);
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormErrors(form);
  const current = form.querySelector("#security-current-password");
  const next = form.querySelector("#security-new-password");
  const confirmation = form.querySelector("#security-confirm-password");
  let valid = true;

  if (!current.value) valid = setFieldError(form, current, "Escribe tu contraseña actual.") && valid;
  if (!isStrongPassword(next.value)) {
    valid = setFieldError(form, next, "Usa al menos 8 caracteres, una mayúscula y un número.") && valid;
  }
  if (!confirmation.value || confirmation.value !== next.value) {
    valid = setFieldError(form, confirmation, "Las contraseñas nuevas no coinciden.") && valid;
  }
  if (current.value && current.value === next.value) {
    valid = setFieldError(form, next, "La contraseña nueva debe ser diferente.") && valid;
  }
  if (!valid) {
    setFormStatus(form, "Revisa los campos marcados.", "error");
    return;
  }

  if (isLocalPreview()) {
    form.reset();
    setFormStatus(form, "Demostración local: Django verificará la contraseña actual y cerrará las otras sesiones.", "success");
    return;
  }

  setFormBusy(form, true);
  try {
    const response = await window.AramacaoCustomerApi.cambiarContrasena(current.value, next.value);
    form.reset();
    setFormStatus(form, response?.mensaje || "Contraseña actualizada.", "success");
  } catch (error) {
    form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ""; });
    setFormStatus(form, getCustomerErrorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function requestEmailChange(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormErrors(form);
  const email = form.querySelector("#security-new-email");
  const password = form.querySelector("#security-email-password");
  let valid = true;
  if (!email.value.trim() || !email.checkValidity()) {
    valid = setFieldError(form, email, "Escribe un correo válido.") && valid;
  }
  if (email.value.trim().toLowerCase() === currentCustomer.correo.toLowerCase()) {
    valid = setFieldError(form, email, "El correo nuevo debe ser diferente al actual.") && valid;
  }
  if (!password.value) valid = setFieldError(form, password, "Escribe tu contraseña actual.") && valid;
  if (!valid) {
    setFormStatus(form, "Revisa los campos marcados.", "error");
    return;
  }

  if (isLocalPreview()) {
    password.value = "";
    showEmailVerificationForm("demostracion-local");
    setFormStatus(form, "Demostración local: el correo actual seguirá activo hasta verificar el nuevo.", "success");
    return;
  }

  setFormBusy(form, true);
  try {
    const response = await window.AramacaoCustomerApi.solicitarCambioCorreo(email.value.trim().toLowerCase(), password.value);
    password.value = "";
    showEmailVerificationForm(response?.flujo_verificacion_id || "");
    setFormStatus(form, response?.mensaje || "Revisa el correo nuevo.", "success");
  } catch (error) {
    password.value = "";
    setFormStatus(form, getCustomerErrorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

function showEmailVerificationForm(flowId) {
  const panel = document.querySelector("#new-email-verification-panel");
  const field = document.querySelector("#new-email-flow-id");
  if (field) field.value = flowId;
  if (panel) {
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function verifyNewEmail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormErrors(form);
  const flowId = form.querySelector("#new-email-flow-id").value;
  const code = form.querySelector("#new-email-code");
  if (!flowId || !/^\d{6}$/.test(code.value.trim())) {
    setFieldError(form, code, "Escribe el código de 6 dígitos.");
    setFormStatus(form, "Revisa el código.", "error");
    return;
  }

  if (isLocalPreview()) {
    code.value = "";
    setFormStatus(form, "Demostración local: Django cambiará el correo solo después de validar el código.", "success");
    return;
  }

  setFormBusy(form, true);
  try {
    const response = await window.AramacaoCustomerApi.verificarCambioCorreo(flowId, code.value.trim());
    currentCustomer = response?.cliente || currentCustomer;
    renderCommonCustomerData(currentCustomer);
    setText("security-current-email", currentCustomer.correo);
    form.reset();
    document.querySelector("#new-email-verification-panel").hidden = true;
    setPageStatus(response?.mensaje || "Correo actualizado.", "success");
  } catch (error) {
    setFormStatus(form, getCustomerErrorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

async function initializePurchasesView() {
  const filter = document.querySelector("#purchase-status-filter");
  filter?.addEventListener("change", () => loadPurchases(filter.value));
  await loadPurchases(filter?.value || "");
}

async function loadPurchases(status) {
  const list = document.querySelector("#purchase-history-list");
  const empty = document.querySelector("#purchase-history-empty");
  if (!list || !empty) return;
  list.replaceChildren();
  empty.hidden = true;
  setPageStatus("Cargando tus compras…", "");

  try {
    const response = isLocalPreview() && window.AramacaoSalesApi
      ? window.AramacaoSalesApi.listarComprasDemo({ estado: status })
      : await window.AramacaoCustomerApi.listarCompras({ estado: status });
    const purchases = Array.isArray(response?.resultados) ? response.resultados : [];
    setText("purchase-total", String(response?.total ?? purchases.length));
    if (!purchases.length) {
      empty.hidden = false;
      setPageStatus("", "");
      return;
    }
    purchases.forEach((purchase) => list.append(createPurchaseCard(purchase)));
    setPageStatus("", "");
  } catch (error) {
    setPageStatus(getCustomerErrorMessage(error), "error");
  }
}
function createPurchaseCard(purchase) {
  const article = document.createElement("article");
  article.className = "account-purchase-card";

  const summary = document.createElement("div");
  const reference = document.createElement("strong");
  reference.textContent = purchase.numero || purchase.referencia || "Compra";
  const date = document.createElement("span");
  date.textContent = formatDate(purchase.fecha || purchase.creada_en);
  summary.append(reference, date);

  const movie = document.createElement("div");
  movie.className = "account-purchase-main";
  const title = document.createElement("strong");
  title.textContent = purchase.pelicula || purchase.resumen || "Compra en Aramacao Cinema";
  const detail = document.createElement("span");
  detail.textContent = purchase.detalle || `${purchase.cantidad_boletos || 0} boleto(s)`;
  movie.append(title, detail);

  const state = document.createElement("span");
  state.className = "account-status-pill";
  state.textContent = purchase.estado || "PENDIENTE";

  const link = document.createElement("a");
  link.className = "button button-ghost account-small-button";
  link.href = `detalle-compra.html?id=${encodeURIComponent(purchase.id)}`;
  link.textContent = "Ver detalle";

  article.append(summary, movie, state, link);
  return article;
}

async function initializePurchaseDetailView() {
  const purchaseId = new URLSearchParams(window.location.search).get("id") || "";
  if (!purchaseId || purchaseId.length > 100) {
    setPageStatus("La compra solicitada no es válida.", "error");
    return;
  }
  try {
    const response = isLocalPreview() && window.AramacaoSalesApi
      ? window.AramacaoSalesApi.obtenerCompraDemo(purchaseId)
      : await window.AramacaoCustomerApi.obtenerCompra(purchaseId);
    renderPurchaseDetail(response?.compra);
  } catch (error) {
    document.querySelector("#purchase-detail-loading")?.setAttribute("hidden", "");
    document.querySelector("#purchase-detail-unavailable")?.removeAttribute("hidden");
    setPageStatus(getCustomerErrorMessage(error), "error");
  }
}
function renderPurchaseDetail(purchase) {
  if (!purchase) {
    setPageStatus("No fue posible cargar la compra.", "error");
    return;
  }
  document.querySelector("#purchase-detail-loading")?.setAttribute("hidden", "");
  document.querySelector("#purchase-detail-unavailable")?.setAttribute("hidden", "");
  const content = document.querySelector("#purchase-detail-content");
  content.hidden = false;
  setText("detail-reference", purchase.numero || purchase.referencia || "Compra");
  setText("detail-date", formatDate(purchase.fecha || purchase.creada_en));
  setText("detail-status", purchase.estado || "PENDIENTE");
  setText("detail-total", formatCurrency(purchase.total));

  const items = document.querySelector("#purchase-detail-items");
  items.replaceChildren();
  (purchase.items || purchase.boletos || []).forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item.descripcion || item.pelicula || item.nombre || "Artículo de la compra";
    items.append(row);
  });

  const tickets = document.querySelector("#purchase-detail-tickets");
  tickets.replaceChildren();
  if (isLocalPreview() && window.AramacaoSalesApi) {
    const receipt = document.createElement("button");
    receipt.type = "button";
    receipt.className = "button button-ghost account-small-button";
    receipt.textContent = "Descargar comprobante";
    receipt.addEventListener("click", () => window.AramacaoSalesApi.descargarComprobanteDemo(purchase.id));
    tickets.append(receipt);
  }
  (purchase.boletos || []).forEach((ticket) => {
    if (isLocalPreview() && window.AramacaoSalesApi) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-primary account-small-button";
      button.textContent = `Guardar boleto ${ticket.asiento || ""} como imagen`.trim();
      button.addEventListener("click", () => window.AramacaoSalesApi.descargarBoletoDemo(ticket.id));
      tickets.append(button);
      return;
    }
    const link = document.createElement("a");
    link.className = "button button-primary account-small-button";
    link.href = window.AramacaoCustomerApi.rutaDescargaBoleto(ticket.id);
    link.textContent = `Guardar boleto ${ticket.asiento || ""} como imagen`.trim();
    tickets.append(link);
  });
}
function bindLogoutButtons() {
  document.querySelectorAll("[data-customer-logout]").forEach((button) => {
    button.addEventListener("click", logoutCustomer);
  });
}

async function logoutCustomer() {
  if (isLocalPreview()) {
    window.localStorage.removeItem("aramacao-demo-cliente-publico-v1");
    window.location.assign("iniciar-sesion.html?motivo=sesion_cerrada");
    return;
  }
  try {
    await window.AramacaoCustomerApi.cerrarSesion();
  } finally {
    window.location.assign("iniciar-sesion.html?motivo=sesion_cerrada");
  }
}

function readPublicDemoCustomer() {
  try {
    const customer = JSON.parse(window.localStorage.getItem("aramacao-demo-cliente-publico-v1") || "null");
    return customer?.autenticado ? customer : null;
  } catch {
    return null;
  }
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  const url = new URL("iniciar-sesion.html", window.location.href);
  url.searchParams.set("motivo", "sesion_requerida");
  url.searchParams.set("next", next);
  window.location.replace(url.href);
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      button.textContent = willShow ? "Ocultar" : "Mostrar";
    });
  });
}

function setFieldError(form, input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = form.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
  return false;
}

function clearFormErrors(form) {
  setFormStatus(form, "", "");
  form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  form.querySelectorAll(".account-field-error").forEach((error) => { error.textContent = ""; });
}

function setFormBusy(form, busy) {
  const button = form.querySelector('[type="submit"]');
  form.setAttribute("aria-busy", String(busy));
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? "Guardando…" : button.dataset.originalText;
}

function setFormStatus(form, message, type) {
  const status = form.querySelector("[data-form-status]");
  if (!status) return;
  status.textContent = message;
  status.className = `account-form-status${type ? ` ${type}` : ""}`;
}

function setPageStatus(message, type) {
  const status = document.querySelector("#customer-page-status");
  if (!status) return;
  status.textContent = message;
  status.className = `account-form-status account-page-status${type ? ` ${type}` : ""}`;
}

function getCustomerErrorMessage(error) {
  const messages = {
    AUTENTICACION_REQUERIDA: "Debes iniciar sesión para continuar.",
    CONTRASENA_INCORRECTA: "La contraseña actual no es correcta.",
    USUARIO_OCUPADO: "Ese nombre de usuario ya está en uso.",
    CORREO_OCUPADO: "Ese correo ya está registrado.",
    CODIGO_INVALIDO: "El código no es válido.",
    CODIGO_VENCIDO: "El código venció. Solicita uno nuevo.",
    SIN_PERMISO: "No tienes permiso para consultar esta información.",
  };
  if (error instanceof window.AramacaoCustomerApi.CustomerApiError) {
    return messages[error.code] || error.message;
  }
  if (error instanceof TypeError) return "No fue posible conectar con Django.";
  return "No fue posible completar la operación.";
}

function isAuthenticationError(error) {
  return error?.status === 401 || error?.code === "AUTENTICACION_REQUERIDA";
}

function identificationTypeName(type) {
  return type === "PASAPORTE" ? "Pasaporte" : "Identidad hondureña";
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function initials(name) {
  return String(name || "A")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}

function isStrongPassword(value) {
  return value.length >= 8 && /[A-ZÁÉÍÓÚÑ]/.test(value) && /\d/.test(value);
}

function isLocalPreview() {
  return window.AramacaoCustomerApi?.esVistaLocal() ?? false;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "—";
}

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "L 0.00";
  return new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(number);
}
