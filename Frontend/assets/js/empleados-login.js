"use strict";

const employeeLoginForm = document.querySelector("#employee-login-form");
const employeeLoginStatus = document.querySelector("#employee-login-status");
const employeeLoginSubmit = document.querySelector("#employee-login-submit");

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => togglePassword(button));
});

showAccessReason();
employeeLoginForm.addEventListener("submit", handleEmployeeLogin);

async function handleEmployeeLogin(event) {
  event.preventDefault();
  clearLoginErrors();

  const username = document.querySelector("#employee-username");
  const password = document.querySelector("#employee-password");
  const normalizedUsername = username.value.trim().toLowerCase();
  let isValid = true;

  if (normalizedUsername.length < 4 || normalizedUsername.length > 40) {
    showLoginError(username, "username-error", "El usuario debe tener entre 4 y 40 caracteres.");
    isValid = false;
  } else if (!/^[a-z][a-z0-9]*$/.test(normalizedUsername)) {
    showLoginError(username, "username-error", "Usa solo letras y números, comenzando con una letra. Ejemplo: hugo69.");
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

  username.value = normalizedUsername;
  setSubmitting(true);
  setLoginStatus("Validando tu cuenta…", "");

  try {
    const response = await window.AramacaoStaffApi.iniciarSesion(
      normalizedUsername,
      password.value
    );

    if (!response?.ruta_siguiente && !response?.debe_cambiar_contrasena) {
      throw new Error("El backend no devolvió la ruta autorizada.");
    }

    const nextPath = response.debe_cambiar_contrasena
      ? "/pages/empleados/cambiar-contrasena.html"
      : response.ruta_siguiente;
    const destination = new URL(nextPath, window.location.origin);
    if (destination.origin !== window.location.origin) {
      throw new Error("El backend devolvió una ruta externa no permitida.");
    }

    password.value = "";
    setLoginStatus("Acceso correcto. Abriendo tu área de trabajo…", "success");
    window.location.assign(destination.href);
  } catch (error) {
    password.value = "";
    password.focus();
    setLoginStatus(getLoginErrorMessage(error), "error");
  } finally {
    setSubmitting(false);
  }
}

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
  setLoginStatus("", "");
  employeeLoginForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  employeeLoginForm.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function setSubmitting(isSubmitting) {
  employeeLoginSubmit.disabled = isSubmitting;
  employeeLoginForm.setAttribute("aria-busy", String(isSubmitting));
  employeeLoginSubmit.textContent = isSubmitting ? "Validando…" : "Ingresar a Taquilla";
}

function setLoginStatus(message, type) {
  employeeLoginStatus.textContent = message;
  employeeLoginStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function getLoginErrorMessage(error) {
  const messages = {
    CREDENCIALES_INVALIDAS: "El usuario o la contraseña son incorrectos.",
    CUENTA_INACTIVA: "Esta cuenta está inactiva. Solicita ayuda al administrador.",
    ROL_NO_PERMITIDO: "Esta cuenta no tiene permiso para ingresar a Taquilla.",
    DEMASIADOS_INTENTOS: "Se alcanzó el límite de intentos. Espera unos minutos e inténtalo nuevamente.",
    CSRF_NO_DISPONIBLE: "No fue posible preparar la conexión segura. Actualiza la página e inténtalo otra vez.",
  };

  if (error instanceof window.AramacaoStaffApi.StaffApiError) {
    return messages[error.code] || error.message;
  }

  if (error instanceof TypeError) {
    return "No fue posible conectar con el servidor. Comprueba que el backend esté funcionando.";
  }

  return "No fue posible iniciar sesión. Inténtalo nuevamente.";
}

function showAccessReason() {
  const reason = new URLSearchParams(window.location.search).get("motivo");
  const messages = {
    sesion_requerida: "Inicia sesión para entrar a Taquilla.",
    sin_permiso: "La cuenta utilizada no tiene permiso para entrar a Taquilla.",
    sesion_cerrada: "La sesión se cerró correctamente.",
  };

  if (messages[reason]) {
    setLoginStatus(messages[reason], reason === "sesion_cerrada" ? "success" : "error");
  }
}
