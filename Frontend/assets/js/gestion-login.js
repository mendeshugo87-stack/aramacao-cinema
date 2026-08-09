"use strict";

const adminLoginForm = document.querySelector("#admin-login-form");
const adminLoginStatus = document.querySelector("#admin-login-status");
const adminLoginSubmit = document.querySelector("#admin-login-submit");

document.querySelector("[data-password-toggle]").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
});

showAccessReason();
adminLoginForm.addEventListener("submit", handleAdminLogin);

async function handleAdminLogin(event) {
  event.preventDefault();
  clearErrors();

  const username = document.querySelector("#admin-username");
  const password = document.querySelector("#admin-password");
  const normalizedUsername = username.value.trim().toLowerCase();
  let isValid = true;

  if (!/^[a-z][a-z0-9]{3,39}$/.test(normalizedUsername)) {
    setError(username, "Usa solo letras y números, comenzando con una letra.");
    isValid = false;
  }
  if (password.value.length < 8) {
    setError(password, "Escribe una contraseña de al menos 8 caracteres.");
    isValid = false;
  }

  if (!isValid) {
    setStatus("Revisa los datos ingresados.", "error");
    adminLoginForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  username.value = normalizedUsername;
  setSubmitting(true);
  setStatus("Validando tu cuenta…", "");

  try {
    const response = await window.AramacaoStaffApi.iniciarSesion(normalizedUsername, password.value);

    if (response?.empleado?.rol !== "ADMINISTRADOR_OPERATIVO") {
      throw new window.AramacaoStaffApi.StaffApiError(
        "Esta cuenta no tiene permiso para ingresar a Gestión.",
        403,
        "ROL_NO_PERMITIDO",
        null
      );
    }

    const nextPath = response.debe_cambiar_contrasena
      ? "/pages/empleados/cambiar-contrasena.html"
      : response.ruta_siguiente || "/pages/gestion/";
    const destination = new URL(nextPath, window.location.origin);

    if (destination.origin !== window.location.origin) {
      throw new Error("El backend devolvió una ruta externa no permitida.");
    }

    password.value = "";
    setStatus("Acceso correcto. Abriendo Administración…", "success");
    window.location.assign(destination.href);
  } catch (error) {
    password.value = "";
    password.focus();
    setStatus(getLoginErrorMessage(error), "error");
  } finally {
    setSubmitting(false);
  }
}

function showAccessReason() {
  const reason = new URLSearchParams(window.location.search).get("motivo");
  const messages = {
    sesion_requerida: "Inicia sesión para entrar al panel de administración.",
    sin_permiso: "La cuenta utilizada no tiene permiso para entrar a esta área.",
    sesion_cerrada: "La sesión se cerró correctamente.",
  };
  if (messages[reason]) setStatus(messages[reason], reason === "sesion_cerrada" ? "success" : "error");
}

function getLoginErrorMessage(error) {
  const messages = {
    CREDENCIALES_INVALIDAS: "El usuario o la contraseña son incorrectos.",
    CUENTA_INACTIVA: "Esta cuenta está inactiva.",
    ROL_NO_PERMITIDO: "Esta cuenta no tiene permiso para ingresar a Gestión.",
    DEMASIADOS_INTENTOS: "Se alcanzó el límite de intentos. Espera unos minutos.",
    CSRF_NO_DISPONIBLE: "No fue posible preparar la conexión segura.",
  };

  if (error instanceof window.AramacaoStaffApi.StaffApiError) {
    return messages[error.code] || error.message;
  }
  if (error instanceof TypeError) {
    return "No fue posible conectar con Django. Comprueba que el backend esté funcionando.";
  }
  return "No fue posible iniciar sesión. Inténtalo nuevamente.";
}

function setError(input, message) {
  input.setAttribute("aria-invalid", "true");
  document.querySelector(`[data-error-for="${input.id}"]`).textContent = message;
}

function clearErrors() {
  setStatus("", "");
  adminLoginForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  adminLoginForm.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
}

function setStatus(message, type) {
  adminLoginStatus.textContent = message;
  adminLoginStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function setSubmitting(isSubmitting) {
  adminLoginSubmit.disabled = isSubmitting;
  adminLoginForm.setAttribute("aria-busy", String(isSubmitting));
  adminLoginSubmit.textContent = isSubmitting ? "Validando…" : "Ingresar a Administración";
}
