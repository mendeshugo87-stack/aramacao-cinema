"use strict";

/*
 * Comprobación visual compartida para Gestión y Taquilla.
 *
 * IMPORTANTE: este archivo mejora el flujo del navegador, pero la seguridad
 * real siempre debe aplicarla Django antes de devolver datos o aceptar cambios.
 */
(function protectPrivateArea(global) {
  const body = document.body;
  const requiredRoles = (body.dataset.rolesPermitidos || "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const requiredPermission = body.dataset.permisoRequerido || "";
  const loginUrl = body.dataset.loginUrl || "/pages/empleados/login.html";
  const isPasswordChangePage = body.dataset.cambioContrasena === "true";

  global.AramacaoPrivateAccessReady = initializeProtection();

  async function initializeProtection() {
    if (!global.AramacaoStaffApi) {
      return handleProtectionFailure(new Error("No se cargó el cliente de autenticación."));
    }

    try {
      const response = await global.AramacaoStaffApi.obtenerSesionActual();
      const employee = response?.empleado;
      const permissions = Array.isArray(employee?.permisos) ? employee.permisos : [];
      const hasRole = !requiredRoles.length || requiredRoles.includes(employee?.rol);
      const hasPermission = !requiredPermission || permissions.includes(requiredPermission);

      if (!response?.autenticado || !employee) {
        return redirectToLogin("sesion_requerida");
      }

      if (!hasRole || !hasPermission) {
        return redirectToLogin("sin_permiso");
      }

      if (response.debe_cambiar_contrasena && !isPasswordChangePage) {
        window.location.replace("/pages/empleados/cambiar-contrasena.html");
        return { permitido: false, redirigiendo: true };
      }

      paintSession(employee);
      enableLogout();
      return { permitido: true, vista_local: false, empleado: employee };
    } catch (error) {
      return handleProtectionFailure(error);
    }
  }

  function handleProtectionFailure(error) {
    if (global.AramacaoStaffApi?.esVistaLocal()) {
      showLocalPreviewNotice();
      const localArea = requiredRoles.includes("ADMINISTRADOR_OPERATIVO")
        ? "administración"
        : requiredRoles.includes("CONTROL_ACCESO")
          ? "Control de entrada"
          : "Taquilla";
      paintSession({
        nombre_completo: `Vista local de ${localArea}`,
        nombre_rol: "Backend pendiente",
      });
      enableLogout(true);
      return { permitido: true, vista_local: true, error };
    }

    return redirectToLogin("sesion_requerida");
  }

  function paintSession(employee) {
    document.querySelectorAll("[data-session-name]").forEach((element) => {
      element.textContent = employee.nombre_completo || employee.usuario || "Empleado";
    });
    document.querySelectorAll("[data-session-role]").forEach((element) => {
      element.textContent = employee.nombre_rol || employee.rol || "Sesión activa";
    });
  }

  function enableLogout(localPreview = false) {
    document.querySelectorAll("[data-logout-button]").forEach((button) => {
      button.disabled = false;
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Cerrando…";

        try {
          if (!localPreview) await global.AramacaoStaffApi.cerrarSesion();
        } catch (error) {
          // Aunque falle la respuesta, el usuario vuelve a la pantalla de acceso.
        }

        window.location.assign(loginUrl);
      }, { once: true });
    });
  }

  function showLocalPreviewNotice() {
    if (document.querySelector("#private-access-preview")) return;

    const notice = document.createElement("div");
    notice.id = "private-access-preview";
    notice.className = "private-access-banner";
    notice.setAttribute("role", "status");
    notice.innerHTML = "<strong>Vista local:</strong> la pantalla puede revisarse, pero Django aplicará la sesión y los permisos reales.";

    const target = document.querySelector("main");
    if (target) target.prepend(notice);
  }

  function redirectToLogin(reason) {
    const destination = new URL(loginUrl, window.location.origin);
    destination.searchParams.set("motivo", reason);
    destination.searchParams.set("continuar", window.location.pathname);
    window.location.replace(destination.href);
    return { permitido: false, redirigiendo: true };
  }
})(window);
