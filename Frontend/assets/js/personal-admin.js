"use strict";

const personalForm = document.querySelector("#personal-form");
const personalFormStatus = document.querySelector("#personal-form-status");
const clearPersonalFormButton = document.querySelector("#clear-personal-form");

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => togglePassword(button));
});

clearPersonalFormButton.addEventListener("click", resetPersonalForm);
personalForm.addEventListener("submit", validatePersonalForm);

function validatePersonalForm(event) {
  event.preventDefault();
  clearFieldErrors();

  const fullName = document.querySelector("#staff-full-name");
  const username = document.querySelector("#staff-username");
  const email = document.querySelector("#staff-email");
  const phone = document.querySelector("#staff-phone");
  const password = document.querySelector("#staff-password");
  const passwordConfirmation = document.querySelector("#staff-password-confirmation");
  let isValid = true;

  if (fullName.value.trim().length < 3) {
    setFieldError(fullName, "Escribe el nombre completo del empleado.");
    isValid = false;
  }

  if (!/^[A-Za-z0-9._-]{4,40}$/.test(username.value.trim())) {
    setFieldError(username, "Usa de 4 a 40 caracteres permitidos.");
    isValid = false;
  }

  if (!email.validity.valid || !email.value.trim()) {
    setFieldError(email, "Escribe un correo electrónico válido.");
    isValid = false;
  }

  if (phone.value.trim() && !/^[+0-9()\s-]{8,20}$/.test(phone.value.trim())) {
    setFieldError(phone, "Escribe un teléfono válido o deja el campo vacío.");
    isValid = false;
  }

  if (password.value.length < 8 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
    setFieldError(password, "Usa al menos 8 caracteres e incluye una letra y un número.");
    isValid = false;
  }

  if (passwordConfirmation.value !== password.value || !passwordConfirmation.value) {
    setFieldError(passwordConfirmation, "Las contraseñas no coinciden.");
    isValid = false;
  }

  if (!isValid) {
    personalFormStatus.textContent = "Revisa los campos marcados. La cuenta todavía no fue enviada.";
    personalFormStatus.className = "form-status error";
    personalForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  /*
   * BACKEND:
   * Reemplazar este mensaje por una solicitud POST autenticada y con CSRF.
   * El servidor debe repetir las validaciones, comprobar duplicados, asignar
   * el rol vendedor y cifrar la contraseña antes de guardar la cuenta.
   * No se usa localStorage y esta demostración no conserva ningún dato.
   */
  personalFormStatus.textContent = "Datos válidos en el frontend. El backend deberá verificar y crear la cuenta del vendedor.";
  personalFormStatus.className = "form-status success";

  // Evita conservar contraseñas en pantalla mientras todavía no existe backend.
  password.value = "";
  passwordConfirmation.value = "";
}

function setFieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = personalForm.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
}

function clearFieldErrors() {
  personalFormStatus.textContent = "";
  personalFormStatus.className = "form-status";
  personalForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  personalForm.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function resetPersonalForm() {
  personalForm.reset();
  document.querySelector("#staff-active").checked = true;
  document.querySelector("#staff-force-change").checked = true;
  clearFieldErrors();
  document.querySelector("#staff-full-name").focus();
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}
