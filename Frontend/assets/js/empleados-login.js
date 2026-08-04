"use strict";

const employeeLoginForm = document.querySelector("#employee-login-form");
const employeeLoginStatus = document.querySelector("#employee-login-status");

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => togglePassword(button));
});

employeeLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearLoginErrors();

  const username = document.querySelector("#employee-username");
  const password = document.querySelector("#employee-password");
  let isValid = true;

  if (!username.value.trim() || username.value.trim().length < 4) {
    showLoginError(username, "username-error", "Escribe un usuario válido de al menos 4 caracteres.");
    isValid = false;
  }

  if (password.value.length < 8) {
    showLoginError(password, "password-error", "La contraseña debe tener al menos 8 caracteres.");
    isValid = false;
  }

  if (!isValid) {
    employeeLoginStatus.textContent = "Revisa los datos marcados antes de continuar.";
    employeeLoginStatus.className = "form-status error";
    employeeLoginForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  /*
   * BACKEND:
   * Aquí se enviarán usuario y contraseña mediante HTTPS al endpoint de acceso.
   * El servidor debe validar la cuenta, crear la sesión segura y devolver la
   * ruta autorizada. Esta maqueta no guarda credenciales ni permite el acceso.
   */
  employeeLoginStatus.textContent = "Formulario listo. El backend deberá validar la cuenta y autorizar el acceso a Taquilla.";
  employeeLoginStatus.className = "form-status success";
});

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}

function showLoginError(input, errorId, message) {
  input.setAttribute("aria-invalid", "true");
  document.getElementById(errorId).textContent = message;
}

function clearLoginErrors() {
  employeeLoginStatus.textContent = "";
  employeeLoginStatus.className = "form-status";
  employeeLoginForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  employeeLoginForm.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}
