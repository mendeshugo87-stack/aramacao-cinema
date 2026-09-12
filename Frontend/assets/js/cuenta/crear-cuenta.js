"use strict";

const accountForm = document.querySelector("#customer-account-form");
const accountStatus = document.querySelector("#account-form-status");

document.addEventListener("DOMContentLoaded", initializeAccountPage);

function initializeAccountPage() {
  restorePurchaseContext();

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button));
  });

  accountForm.addEventListener("submit", validateAccountForm);
}

function restorePurchaseContext() {
  const params = new URLSearchParams(window.location.search);
  const movie = params.get("movie") || "";
  const date = params.get("date") || "";
  const time = params.get("time") || "";
  document.querySelector("#selected-movie").value = movie;
  document.querySelector("#selected-date").value = date;
  document.querySelector("#selected-time").value = time;

  if (movie) {
    document.querySelector("#purchase-context").textContent =
      "Conservamos la película elegida. Después del registro continuarás con la selección de función y asientos.";
  }
}

function validateAccountForm(event) {
  event.preventDefault();
  clearAccountErrors();

  const name = document.querySelector("#customer-name");
  const email = document.querySelector("#customer-email");
  const username = document.querySelector("#customer-username");
  const phone = document.querySelector("#customer-phone");
  const password = document.querySelector("#customer-password");
  const confirmation = document.querySelector("#customer-password-confirmation");
  const terms = document.querySelector("#customer-terms");
  let valid = true;

  if (name.value.trim().length < 3) {
    setAccountError(name, "Escribe tu nombre completo.");
    valid = false;
  }

  if (!email.value.trim() || !email.checkValidity()) {
    setAccountError(email, "Escribe un correo electrónico válido.");
    valid = false;
  }

  if (!/^[a-zA-Z0-9._-]{4,40}$/.test(username.value.trim())) {
    setAccountError(username, "Usa de 4 a 40 caracteres: letras, números, punto, guion o guion bajo.");
    valid = false;
  }

  if (phone.value.trim() && !/^[+\d][\d\s-]{7,19}$/.test(phone.value.trim())) {
    setAccountError(phone, "Escribe un número de teléfono válido.");
    valid = false;
  }

  if (password.value.length < 8 || !/[A-ZÁÉÍÓÚÑ]/.test(password.value) || !/\d/.test(password.value)) {
    setAccountError(password, "Usa al menos 8 caracteres, una mayúscula y un número.");
    valid = false;
  }

  if (!confirmation.value || confirmation.value !== password.value) {
    setAccountError(confirmation, "Las contraseñas deben coincidir.");
    valid = false;
  }

  if (!terms.checked) {
    setAccountError(terms, "Debes aceptar esta condición para crear la cuenta.");
    valid = false;
  }

  if (!valid) {
    accountStatus.textContent = "Revisa los campos marcados antes de continuar.";
    accountStatus.className = "account-form-status error";
    accountForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  /*
   * BACKEND: enviar este formulario mediante HTTPS. El servidor validará
   * duplicados, cifrará la contraseña, enviará el código de correo y decidirá
   * a qué paso de compra regresar. Esta maqueta no guarda datos personales.
   */
  accountStatus.textContent = "Formulario listo. El backend verificará el correo y continuará la compra seleccionada.";
  accountStatus.className = "account-form-status success";
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}

function setAccountError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = accountForm.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
}

function clearAccountErrors() {
  accountStatus.textContent = "";
  accountStatus.className = "account-form-status";
  accountForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  accountForm.querySelectorAll(".account-field-error").forEach((error) => {
    error.textContent = "";
  });
}
