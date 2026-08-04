"use strict";

const adminLoginForm = document.querySelector("#admin-login-form");
const adminLoginStatus = document.querySelector("#admin-login-status");

document.querySelector("[data-password-toggle]").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
});

adminLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  const username = document.querySelector("#admin-username");
  const password = document.querySelector("#admin-password");
  let isValid = true;

  if (!/^[A-Za-z0-9._-]{4,40}$/.test(username.value.trim())) {
    setError(username, "Escribe un usuario válido.");
    isValid = false;
  }
  if (password.value.length < 8) {
    setError(password, "Escribe una contraseña de al menos 8 caracteres.");
    isValid = false;
  }

  if (!isValid) {
    adminLoginStatus.textContent = "Revisa los datos ingresados.";
    adminLoginStatus.className = "form-status error";
    adminLoginForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  /* BACKEND: reemplazar por autenticación real y redirección según el rol. */
  adminLoginStatus.textContent = "Formulario listo. El backend deberá validar la cuenta antes de permitir el acceso.";
  adminLoginStatus.className = "form-status success";
  password.value = "";
});

function setError(input, message) {
  input.setAttribute("aria-invalid", "true");
  document.querySelector(`[data-error-for="${input.id}"]`).textContent = message;
}

function clearErrors() {
  adminLoginStatus.textContent = "";
  adminLoginStatus.className = "form-status";
  adminLoginForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  adminLoginForm.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
}
