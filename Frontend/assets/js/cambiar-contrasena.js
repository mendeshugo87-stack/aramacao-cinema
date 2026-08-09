"use strict";

const passwordChangeForm = document.querySelector("#password-change-form");
const passwordChangeStatus = document.querySelector("#password-change-status");
const passwordChangeSubmit = document.querySelector("#password-change-submit");

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    button.textContent = willShow ? "Ocultar" : "Mostrar";
    button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
  });
});

passwordChangeForm.addEventListener("submit", handlePasswordChange);

async function handlePasswordChange(event) {
  event.preventDefault();
  clearErrors();

  const currentPassword = document.querySelector("#current-password");
  const newPassword = document.querySelector("#new-password");
  const confirmation = document.querySelector("#confirm-new-password");
  let isValid = true;

  if (currentPassword.value.length < 8) {
    setError(currentPassword, "Escribe la contraseña temporal completa.");
    isValid = false;
  }
  if (newPassword.value.length < 8 || !/[A-Za-z]/.test(newPassword.value) || !/\d/.test(newPassword.value)) {
    setError(newPassword, "Usa al menos 8 caracteres e incluye una letra y un número.");
    isValid = false;
  }
  if (newPassword.value === currentPassword.value) {
    setError(newPassword, "La nueva contraseña debe ser diferente de la temporal.");
    isValid = false;
  }
  if (!confirmation.value || confirmation.value !== newPassword.value) {
    setError(confirmation, "Las contraseñas nuevas no coinciden.");
    isValid = false;
  }

  if (!isValid) {
    setStatus("Revisa los campos marcados.", "error");
    passwordChangeForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  passwordChangeSubmit.disabled = true;
  passwordChangeSubmit.textContent = "Guardando…";

  try {
    const response = await window.AramacaoStaffApi.cambiarContrasenaActual(
      currentPassword.value,
      newPassword.value
    );
    passwordChangeForm.reset();
    setStatus("Contraseña actualizada. Abriendo tu área de trabajo…", "success");
    const destination = new URL(response?.ruta_siguiente || "/pages/empleados/login.html", window.location.origin);
    window.location.assign(destination.href);
  } catch (error) {
    const message = error instanceof window.AramacaoStaffApi.StaffApiError
      ? error.message
      : "No fue posible cambiar la contraseña. Comprueba que Django esté funcionando.";
    setStatus(message, "error");
    currentPassword.value = "";
    currentPassword.focus();
  } finally {
    passwordChangeSubmit.disabled = false;
    passwordChangeSubmit.textContent = "Guardar y continuar";
  }
}

function setError(input, message) {
  input.setAttribute("aria-invalid", "true");
  document.querySelector(`[data-error-for="${input.id}"]`).textContent = message;
}

function clearErrors() {
  setStatus("", "");
  passwordChangeForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  passwordChangeForm.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
}

function setStatus(message, type) {
  passwordChangeStatus.textContent = message;
  passwordChangeStatus.className = `form-status${type ? ` ${type}` : ""}`;
}
