"use strict";

const authForm = document.querySelector("[data-auth-form]");
const authStatus = document.querySelector("#account-form-status");

document.addEventListener("DOMContentLoaded", initializeAuthPage);

function initializeAuthPage() {
  preservePurchaseQuery();
  restorePurchaseContext();

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button));
  });

  authForm?.addEventListener("submit", validateAuthForm);
}

/* Conserva película, fecha y horario al pasar entre registro e inicio de sesión. */
function preservePurchaseQuery() {
  const query = window.location.search;
  document.querySelectorAll("[data-preserve-query]").forEach((link) => {
    if (!query) return;
    const url = new URL(link.href, window.location.href);
    url.search = query;
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

function validateAuthForm(event) {
  event.preventDefault();
  clearErrors();

  const formType = authForm.dataset.authForm;
  let valid = true;

  if (formType === "register") valid = validateRegisterForm();
  if (formType === "login") valid = validateLoginForm();
  if (formType === "recover") valid = validateRecoveryForm();

  if (!valid) {
    setStatus("Revisa los campos marcados antes de continuar.", "error");
    authForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  /*
   * BACKEND: sustituir este resultado visual por una petición HTTPS a Django.
   * El servidor debe validar los datos, aplicar límites de intentos y devolver
   * una respuesta segura. El navegador no guarda credenciales ni crea cuentas.
   */
  const messages = {
    register: "Formulario listo. El backend verificará el correo y creará la cuenta antes de continuar la compra.",
    login: "Datos listos. El backend validará tu cuenta y abrirá el siguiente paso de compra.",
    recover: "Solicitud lista. El backend comprobará la cuenta y enviará un código de recuperación al correo registrado.",
  };
  setStatus(messages[formType], "success");
}

function validateRegisterForm() {
  const name = getField("customer-name");
  const email = getField("customer-email");
  const username = getField("customer-username");
  const phone = getField("customer-phone");
  const password = getField("customer-password");
  const confirmation = getField("customer-password-confirmation");
  const terms = getField("customer-terms");
  let valid = true;

  if (name.value.trim().length < 3) valid = markInvalid(name, "Escribe tu nombre completo.") && valid;
  if (!email.value.trim() || !email.checkValidity()) valid = markInvalid(email, "Escribe un correo electrónico válido.") && valid;
  if (!/^[a-zA-Z0-9._-]{4,40}$/.test(username.value.trim())) {
    valid = markInvalid(username, "Usa de 4 a 40 caracteres: letras, números, punto, guion o guion bajo.") && valid;
  }
  if (phone.value.trim() && !/^[+\d][\d\s-]{7,19}$/.test(phone.value.trim())) {
    valid = markInvalid(phone, "Escribe un número de teléfono válido.") && valid;
  }
  if (password.value.length < 8 || !/[A-ZÁÉÍÓÚÑ]/.test(password.value) || !/\d/.test(password.value)) {
    valid = markInvalid(password, "Usa al menos 8 caracteres, una mayúscula y un número.") && valid;
  }
  if (!confirmation.value || confirmation.value !== password.value) {
    valid = markInvalid(confirmation, "Las contraseñas deben coincidir.") && valid;
  }
  if (!terms.checked) valid = markInvalid(terms, "Debes aceptar esta condición para crear la cuenta.") && valid;
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

function togglePassword(button) {
  const input = getField(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}

function markInvalid(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = authForm.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
  return false;
}

function clearErrors() {
  setStatus("", "");
  authForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  authForm.querySelectorAll(".account-field-error").forEach((error) => {
    error.textContent = "";
  });
}

function setStatus(message, type) {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.className = `account-form-status${type ? ` ${type}` : ""}`;
}

function setHiddenValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value;
}

function getField(id) {
  return document.getElementById(id);
}
