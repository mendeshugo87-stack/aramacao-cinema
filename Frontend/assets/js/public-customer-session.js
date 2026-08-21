"use strict";

/*
 * Actualiza el acceso de la navegación pública cuando existe una sesión de
 * cliente. En producción consulta el adaptador de la API; en localhost lee
 * únicamente un perfil demostrativo sin contraseñas, identificación ni JWT.
 */
(function createPublicCustomerSession(global) {
  const DEMO_SESSION_KEY = "aramacao-demo-cliente-publico-v1";

  document.addEventListener("DOMContentLoaded", refreshNavigation);
  global.addEventListener("storage", (event) => {
    if (event.key === DEMO_SESSION_KEY) refreshNavigation();
  });

  async function refreshNavigation() {
    const links = [...document.querySelectorAll(".nav-account")];
    if (!links.length) return;

    const customer = await loadCustomer();
    if (!customer) return;

    const displayName = customer.nombre_corto || firstName(customer.nombre_completo) || customer.usuario;
    if (!displayName) return;

    links.forEach((link) => {
      link.textContent = `Hola, ${displayName}`;
      link.setAttribute("aria-label", `Abrir la cuenta de ${displayName}`);
      link.href = accountUrl(link.href);
    });
  }

  async function loadCustomer() {
    if (isLocalPreview()) return readDemoCustomer();
    if (!global.AramacaoCustomerApi?.obtenerSesionActual) return null;

    try {
      const response = await global.AramacaoCustomerApi.obtenerSesionActual();
      if (!response?.autenticado) return null;
      return response.cliente || response.usuario || response.user || null;
    } catch {
      return null;
    }
  }

  function saveDemoCustomer(customer) {
    if (!isLocalPreview() || !customer) return;
    const safeProfile = {
      id: String(customer.id || "vista-local"),
      nombre_corto: String(customer.nombre_corto || firstName(customer.nombre_completo) || ""),
      nombre_completo: String(customer.nombre_completo || ""),
      usuario: String(customer.usuario || ""),
      autenticado: customer.autenticado !== false,
    };
    global.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(safeProfile));
  }

  function readDemoCustomer() {
    try {
      const customer = JSON.parse(global.localStorage.getItem(DEMO_SESSION_KEY) || "null");
      return customer?.autenticado ? customer : null;
    } catch {
      return null;
    }
  }

  function clearDemoCustomer() {
    global.localStorage.removeItem(DEMO_SESSION_KEY);
  }

  function accountUrl(currentHref) {
    const url = new URL(currentHref, global.location.href);
    url.pathname = url.pathname.replace(/\/iniciar-sesion\.html$/, "/mi-cuenta.html");
    return url.href;
  }

  function firstName(value) {
    return String(value || "").trim().split(/\s+/)[0] || "";
  }

  function isLocalPreview() {
    return ["localhost", "127.0.0.1", "[::1]"].includes(global.location.hostname);
  }

  global.AramacaoPublicCustomerSession = Object.freeze({
    actualizarNavegacion: refreshNavigation,
    guardarVistaLocal: saveDemoCustomer,
    obtenerVistaLocal: readDemoCustomer,
    cerrarVistaLocal: clearDemoCustomer,
  });
})(window);
