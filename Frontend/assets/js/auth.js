"use strict";

const authForm = document.querySelector("[data-auth-form]");
const authStatus = document.querySelector("#account-form-status");
const authSubmit = authForm?.querySelector('[type="submit"]');

document.addEventListener("DOMContentLoaded", initializeAuthPage);

function initializeAuthPage() {
  preservePurchaseQuery();
  restorePurchaseContext();
  prepareTemporaryFlowFields();
  showAccessReason();

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button));
  });

  document.querySelector("[data-resend-code]")?.addEventListener("click", resendVerificationCode);
  authForm?.addEventListener("submit", handleAuthSubmit);
}

/* Conserva la compra elegida sin guardar información personal en el navegador. */
function preservePurchaseQuery() {
  const source = new URLSearchParams(window.location.search);
  const allowed = ["movie", "date", "time", "next"];

  document.querySelectorAll("[data-preserve-query]").forEach((link) => {
    const url = new URL(link.href, window.location.href);
    allowed.forEach((name) => {
      if (source.has(name)) url.searchParams.set(name, source.get(name));
    });
    link.href = url.href;
  });
}

function restorePurchaseContext() {
  const params = new URLSearchParams(window.location.search);
  const movie = params.get("movie") || "";
  const date = params.get("date") || "";
  const time = params.get("time") || "";

  setHiddenValue("selected-movie", movie);
  setHiddenValue("selected-date", date);
  setHiddenValue("selected-time", time);

  const context = document.querySelector("#purchase-context");
  if (context && movie) {
    context.textContent =
      "Conservamos la película elegida. Después de validar tu cuenta continuarás con la función y los asientos.";
  }
}

function prepareTemporaryFlowFields() {
  const params = new URLSearchParams(window.location.search);
  setHiddenValue(
    "verification-flow-id",
    params.get("flujo") || (isLocalPreview() ? "demostracion-local" : "")
  );
  setHiddenValue(
    "recovery-flow-id",
    params.get("flujo") || (isLocalPreview() ? "demostracion-local" : "")
  );
  setHiddenValue(
    "reset-token",
    params.get("token") || (isLocalPreview() ? "demostracion-local" : "")
  );
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearErrors();

  const formType = authForm.dataset.authForm;
  if (!validateForm(formType)) {
    setStatus("Revisa los campos marcados antes de continuar.", "error");
    authForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  if (isLocalPreview()) {
    showLocalPreviewResult(formType);
    return;
  }

  setSubmitting(true);
  setStatus("Procesando de forma segura…", "");

  try {
    const response = await submitToApi(formType);
    handleSuccessfulResponse(formType, response || {});
  } catch (error) {
    applyBackendFieldErrors(error);
    setStatus(getApiErrorMessage(error), "error");
    authForm.querySelector('[aria-invalid="true"]')?.focus();
  } finally {
    setSubmitting(false);
    clearPasswordValuesAfterRequest(formType);
  }
}

function validateForm(formType) {
  const validators = {
    register: validateRegisterForm,
    login: validateLoginForm,
    recover: validateRecoveryForm,
    "verify-email": validateVerificationForm,
    "verify-recovery": validateRecoveryCodeForm,
    "reset-password": validateResetPasswordForm,
  };
  return validators[formType]?.() ?? false;
}

function validateRegisterForm() {
  const name = getField("customer-name");
  const idType = getField("customer-id-type");
  const idNumber = getField("customer-id-number");
  const email = getField("customer-email");
  const username = getField("customer-username");
  const phone = getField("customer-phone");
  const password = getField("customer-password");
  const confirmation = getField("customer-password-confirmation");
  const terms = getField("customer-terms");
  const dataConsent = getField("customer-data-consent");
  let valid = true;

  if (name.value.trim().length < 5 || name.value.trim().split(/\s+/).length < 2) {
    valid = markInvalid(name, "Escribe nombres y apellidos como aparecen en el documento.") && valid;
  }
  if (!idType.value) valid = markInvalid(idType, "Selecciona el tipo de identificación.") && valid;
  if (!validateIdentification(idType.value, idNumber.value)) {
    const message = idType.value === "IDENTIDAD_HN"
      ? "Escribe los 13 dígitos de la identidad hondureña."
      : "Escribe un número de pasaporte válido.";
    valid = markInvalid(idNumber, message) && valid;
  }
  if (!email.value.trim() || !email.checkValidity()) {
    valid = markInvalid(email, "Escribe un correo electrónico válido.") && valid;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{3,39}$/.test(username.value.trim())) {
    valid = markInvalid(username, "Usa de 4 a 40 caracteres y comienza con una letra.") && valid;
  }
  if (!/^[+\d][\d\s-]{7,19}$/.test(phone.value.trim())) {
    valid = markInvalid(phone, "Escribe un número de teléfono válido.") && valid;
  }
  if (!isStrongPassword(password.value)) {
    valid = markInvalid(password, "Usa al menos 8 caracteres, una mayúscula y un número.") && valid;
  }
  if (!confirmation.value || confirmation.value !== password.value) {
    valid = markInvalid(confirmation, "Las contraseñas deben coincidir.") && valid;
  }
  if (!terms.checked) valid = markInvalid(terms, "Debes aceptar los términos para crear la cuenta.") && valid;
  if (!dataConsent.checked) {
    valid = markInvalid(dataConsent, "Debes autorizar el tratamiento necesario de los datos.") && valid;
  }
  return valid;
}

function validateLoginForm() {
  const identity = getField("login-identity");
  const password = getField("login-password");
  let valid = true;
  if (identity.value.trim().length < 4) valid = markInvalid(identity, "Escribe tu correo o nombre de usuario.") && valid;
  if (!password.value) valid = markInvalid(password, "Escribe tu contraseña.") && valid;
  return valid;
}

function validateRecoveryForm() {
  const identity = getField("recovery-identity");
  if (identity.value.trim().length < 4) {
    markInvalid(identity, "Escribe el correo o nombre de usuario asociado a tu cuenta.");
    return false;
  }
  return true;
}

function validateVerificationForm() {
  return validateSixDigitCode("verification-code", "Escribe el código de 6 dígitos enviado a tu correo.");
}

function validateRecoveryCodeForm() {
  return validateSixDigitCode("recovery-code", "Escribe el código de recuperación de 6 dígitos.");
}

function validateResetPasswordForm() {
  const password = getField("new-password");
  const confirmation = getField("new-password-confirmation");
  let valid = true;
  if (!isStrongPassword(password.value)) {
    valid = markInvalid(password, "Usa al menos 8 caracteres, una mayúscula y un número.") && valid;
  }
  if (!confirmation.value || confirmation.value !== password.value) {
    valid = markInvalid(confirmation, "Las contraseñas deben coincidir.") && valid;
  }
  return valid;
}

function validateSixDigitCode(fieldId, message) {
  const code = getField(fieldId);
  if (!/^\d{6}$/.test(code.value.trim())) {
    markInvalid(code, message);
    return false;
  }
  return true;
}

function validateIdentification(type, value) {
  const normalized = value.replace(/[\s-]/g, "");
  if (type === "IDENTIDAD_HN") return /^\d{13}$/.test(normalized);
  if (type === "PASAPORTE") return /^[A-Za-z0-9]{6,20}$/.test(normalized);
  return false;
}

function isStrongPassword(value) {
  return value.length >= 8 && /[A-ZÁÉÍÓÚÑ]/.test(value) && /\d/.test(value);
}

async function submitToApi(formType) {
  const api = window.AramacaoCustomerApi;
  if (!api) throw new Error("El cliente de API no está disponible.");

  if (formType === "register") {
    const idType = getField("customer-id-type").value;
    return api.crearCuenta({
      nombre_completo: getField("customer-name").value.trim(),
      tipo_identificacion: idType,
      numero_identificacion: normalizeIdentification(idType, getField("customer-id-number").value),
      usuario: getField("customer-username").value.trim().toLowerCase(),
      correo: getField("customer-email").value.trim().toLowerCase(),
      telefono: getField("customer-phone").value.trim(),
      contrasena: getField("customer-password").value,
      acepta_terminos: getField("customer-terms").checked,
      acepta_tratamiento_datos: getField("customer-data-consent").checked,
    });
  }
  if (formType === "login") {
    return api.iniciarSesion(
      getField("login-identity").value.trim().toLowerCase(),
      getField("login-password").value
    );
  }
  if (formType === "recover") {
    return api.solicitarRecuperacion(getField("recovery-identity").value.trim().toLowerCase());
  }
  if (formType === "verify-email") {
    return api.verificarCorreo(getField("verification-flow-id").value, getField("verification-code").value.trim());
  }
  if (formType === "verify-recovery") {
    return api.verificarCodigoRecuperacion(getField("recovery-flow-id").value, getField("recovery-code").value.trim());
  }
  if (formType === "reset-password") {
    return api.restablecerContrasena(getField("reset-token").value, getField("new-password").value);
  }
  throw new Error("Formulario no reconocido.");
}

function handleSuccessfulResponse(formType, response) {
  const requestedNext = getRequestedNext();
  const routes = {
    register: buildFlowRoute("verificar-correo.html", "flujo", response.flujo_verificacion_id),
    login: requestedNext || response.ruta_siguiente || "mi-cuenta.html",
    "verify-email": requestedNext || response.ruta_siguiente || "mi-cuenta.html",
    recover: buildFlowRoute("verificar-codigo.html", "flujo", response.flujo_recuperacion_id),
    "verify-recovery": buildFlowRoute("nueva-contrasena.html", "token", response.token_restablecimiento),
    "reset-password": response.ruta_siguiente || "iniciar-sesion.html?motivo=contrasena_actualizada",
  };

  setStatus(response.mensaje || "Operación completada correctamente.", "success");
  window.setTimeout(() => safeNavigate(routes[formType], "iniciar-sesion.html"), 450);
}

function buildFlowRoute(page, parameter, value) {
  const url = new URL(page, window.location.href);
  if (value) url.searchParams.set(parameter, value);
  copyPurchaseParameters(url.searchParams);
  return `${url.pathname}${url.search}`;
}

function getRequestedNext() {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw) return "";
  try {
    const destination = new URL(raw, window.location.origin);
    const forbidden = ["/pages/gestion", "/pages/taquilla", "/pages/empleados"];
    if (destination.origin !== window.location.origin) return "";
    if (forbidden.some((prefix) => destination.pathname.startsWith(prefix))) return "";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "";
  }
}

function safeNavigate(path, fallback) {
  try {
    const destination = new URL(path || fallback, window.location.href);
    if (destination.origin !== window.location.origin) throw new Error("Ruta externa no permitida.");
    window.location.assign(destination.href);
  } catch {
    window.location.assign(new URL(fallback, window.location.href).href);
  }
}

async function resendVerificationCode() {
  const button = document.querySelector("[data-resend-code]");
  const flowId = getField("verification-flow-id")?.value || "";
  if (!flowId) {
    setStatus("El enlace de verificación no es válido. Vuelve a crear la cuenta.", "error");
    return;
  }
  if (isLocalPreview()) {
    setStatus("Demostración local: Django controlará el reenvío y el tiempo de espera.", "success");
    return;
  }
  button.disabled = true;
  try {
    const response = await window.AramacaoCustomerApi.reenviarCodigo(flowId);
    setStatus(response?.mensaje || "Código reenviado.", "success");
  } catch (error) {
    setStatus(getApiErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

function showLocalPreviewResult(formType) {
  saveLocalPreviewCustomer(formType);
  const messages = {
    register: "Demostración local: la cuenta está preparada y el nombre ya puede mostrarse en la navegación. No se guardó ninguna contraseña ni identificación.",
    login: "Demostración local: la sesión visual está preparada. Django validará la cuenta real.",
    recover: "Demostración local: Django devolverá siempre un mensaje genérico y enviará el código si la cuenta existe.",
    "verify-email": "Demostración local: el código tiene el formato correcto. Django comprobará si es válido y no ha vencido.",
    "verify-recovery": "Demostración local: Django validará este código antes de permitir una contraseña nueva.",
    "reset-password": "Demostración local: Django actualizará la contraseña e invalidará el código temporal.",
  };
  setStatus(messages[formType], "success");
  clearPasswordValuesAfterRequest(formType);
}

function saveLocalPreviewCustomer(formType) {
  const session = window.AramacaoPublicCustomerSession;
  if (!session?.guardarVistaLocal) return;

  if (formType === "register") {
    const fullName = getField("customer-name").value.trim();
    session.guardarVistaLocal({
      id: "vista-local",
      nombre_completo: fullName,
      nombre_corto: fullName.split(/\s+/)[0],
      usuario: getField("customer-username").value.trim().toLowerCase(),
      autenticado: true,
    });
    return;
  }

  if (formType === "login") {
    const current = session.obtenerVistaLocal();
    if (current) {
      session.guardarVistaLocal({ ...current, autenticado: true });
      return;
    }
    const identity = getField("login-identity").value.trim().split("@")[0];
    session.guardarVistaLocal({
      id: "vista-local",
      nombre_completo: identity,
      nombre_corto: identity,
      usuario: identity,
      autenticado: true,
    });
  }
}

function normalizeIdentification(type, value) {
  const compact = value.replace(/[\s-]/g, "");
  return type === "PASAPORTE" ? compact.toUpperCase() : compact;
}

function togglePassword(button) {
  const input = getField(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}

function markInvalid(input, message) {
  if (!input) return false;
  input.setAttribute("aria-invalid", "true");
  const error = authForm.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
  return false;
}

function applyBackendFieldErrors(error) {
  if (!(error instanceof window.AramacaoCustomerApi.CustomerApiError)) return;
  if (!error.details || typeof error.details !== "object") return;

  const fields = {
    nombre_completo: "customer-name",
    tipo_identificacion: "customer-id-type",
    numero_identificacion: "customer-id-number",
    usuario: "customer-username",
    correo: "customer-email",
    telefono: "customer-phone",
    contrasena: "customer-password",
    identidad: authForm.dataset.authForm === "login" ? "login-identity" : "recovery-identity",
    codigo: authForm.dataset.authForm === "verify-email" ? "verification-code" : "recovery-code",
    contrasena_nueva: "new-password",
  };

  Object.entries(error.details).forEach(([name, detail]) => {
    const input = getField(fields[name]);
    const message = Array.isArray(detail) ? detail[0] : detail;
    if (input && message) markInvalid(input, String(message));
  });
}

function getApiErrorMessage(error) {
  const messages = {
    CREDENCIALES_INVALIDAS: "El correo, usuario o contraseña son incorrectos.",
    CUENTA_INACTIVA: "Esta cuenta está inactiva. Solicita ayuda a Aramacao Cinema.",
    CORREO_NO_VERIFICADO: "Debes verificar tu correo antes de ingresar.",
    USUARIO_OCUPADO: "Ese nombre de usuario ya está en uso.",
    CORREO_OCUPADO: "Ese correo ya está registrado.",
    IDENTIFICACION_OCUPADA: "Ya existe una cuenta con esa identificación.",
    CODIGO_INVALIDO: "El código no es válido.",
    CODIGO_VENCIDO: "El código venció. Solicita uno nuevo.",
    DEMASIADOS_INTENTOS: "Se alcanzó el límite de intentos. Espera unos minutos.",
    CSRF_NO_DISPONIBLE: "No fue posible preparar la conexión segura. Actualiza la página.",
  };
  if (error instanceof window.AramacaoCustomerApi.CustomerApiError) {
    return messages[error.code] || error.message;
  }
  if (error instanceof TypeError) {
    return "No fue posible conectar con Django. Comprueba que el backend esté funcionando.";
  }
  return "No fue posible completar la operación. Inténtalo nuevamente.";
}

function clearErrors() {
  setStatus("", "");
  authForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  authForm.querySelectorAll(".account-field-error").forEach((error) => { error.textContent = ""; });
}

function clearPasswordValuesAfterRequest(formType) {
  if (formType === "register" || formType === "login" || formType === "reset-password") {
    authForm.querySelectorAll('input[type="password"], input[data-password-field]').forEach((input) => { input.value = ""; });
  }
}

function setSubmitting(isSubmitting) {
  if (!authSubmit) return;
  authSubmit.disabled = isSubmitting;
  authForm.setAttribute("aria-busy", String(isSubmitting));
  if (!authSubmit.dataset.originalText) authSubmit.dataset.originalText = authSubmit.textContent;
  authSubmit.textContent = isSubmitting ? "Procesando…" : authSubmit.dataset.originalText;
}

function setStatus(message, type) {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.className = `account-form-status${type ? ` ${type}` : ""}`;
}

function showAccessReason() {
  const reason = new URLSearchParams(window.location.search).get("motivo");
  const messages = {
    sesion_requerida: "Inicia sesión para entrar a Mi cuenta.",
    sesion_cerrada: "Tu sesión se cerró correctamente.",
    contrasena_actualizada: "Tu contraseña fue actualizada. Ya puedes iniciar sesión.",
  };
  if (messages[reason]) setStatus(messages[reason], reason === "sesion_requerida" ? "error" : "success");
}

function copyPurchaseParameters(target) {
  const source = new URLSearchParams(window.location.search);
  ["movie", "date", "time", "next"].forEach((name) => {
    if (source.has(name)) target.set(name, source.get(name));
  });
}

function setHiddenValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value;
}

function getField(id) {
  return id ? document.getElementById(id) : null;
}

function isLocalPreview() {
  return window.AramacaoCustomerApi?.esVistaLocal() ?? false;
}
