"use strict";

const personalState = {
  empleados: [],
  modoDemostracion: false,
  editandoId: null,
};

const personalElements = {
  editor: document.querySelector("#personal-editor"),
  form: document.querySelector("#personal-form"),
  formTitle: document.querySelector("#personal-form-title"),
  formHelp: document.querySelector("#personal-form-help"),
  formStatus: document.querySelector("#personal-form-status"),
  globalStatus: document.querySelector("#personal-global-status"),
  saveButton: document.querySelector("#save-personal-button"),
  newButton: document.querySelector("#new-personal-button"),
  cancelButton: document.querySelector("#cancel-personal-form"),
  list: document.querySelector("#employee-list"),
  search: document.querySelector("#employee-search"),
  statusFilter: document.querySelector("#employee-status-filter"),
  newPasswords: document.querySelector("#new-account-passwords"),
  temporaryForm: document.querySelector("#temporary-password-form"),
  temporaryStatus: document.querySelector("#temporary-password-status"),
};

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => togglePassword(button));
});

personalElements.newButton.addEventListener("click", openCreateForm);
personalElements.cancelButton.addEventListener("click", closePersonalEditor);
personalElements.form.addEventListener("submit", saveEmployee);
personalElements.temporaryForm.addEventListener("submit", saveTemporaryPassword);
personalElements.search.addEventListener("input", renderEmployees);
personalElements.statusFilter.addEventListener("change", renderEmployees);
personalElements.list.addEventListener("click", handleListAction);

initializePersonalManagement();

async function initializePersonalManagement() {
  const access = await (window.AramacaoPrivateAccessReady || Promise.resolve({ permitido: true }));
  if (!access?.permitido) return;

  if (access.vista_local) {
    personalState.modoDemostracion = true;
    personalState.empleados = getDemoEmployees();
    setGlobalStatus(
      "Vista de prueba: puedes revisar crear, editar, activar y desactivar. Los cambios se borran al actualizar y ninguna contraseña se guarda.",
      "info"
    );
    renderEmployees();
    return;
  }

  await loadEmployees();
}

async function loadEmployees() {
  setGlobalStatus("Cargando cuentas…", "info");
  try {
    const response = await window.AramacaoStaffApi.listarEmpleados();
    personalState.empleados = Array.isArray(response?.resultados) ? response.resultados : [];
    setGlobalStatus("", "");
    renderEmployees();
  } catch (error) {
    setGlobalStatus(getApiMessage(error, "No fue posible cargar las cuentas de empleados."), "error");
    personalState.empleados = [];
    renderEmployees();
  }
}

function renderEmployees() {
  const term = personalElements.search.value.trim().toLocaleLowerCase("es");
  const status = personalElements.statusFilter.value;
  const filtered = personalState.empleados.filter((employee) => {
    const haystack = [
      employee.nombre_completo,
      employee.usuario,
      employee.correo,
      employee.codigo_empleado,
    ].join(" ").toLocaleLowerCase("es");
    const matchesTerm = !term || haystack.includes(term);
    const matchesStatus = status === "TODOS" || (status === "ACTIVO" ? employee.activo : !employee.activo);
    return matchesTerm && matchesStatus;
  });

  updateMetrics();

  if (!filtered.length) {
    personalElements.list.innerHTML = `
      <div class="employee-empty">
        <strong>No hay cuentas para mostrar</strong>
        <span>${personalState.empleados.length ? "Cambia los filtros de búsqueda." : "Crea la primera cuenta de vendedor."}</span>
      </div>
    `;
    return;
  }

  personalElements.list.innerHTML = filtered.map((employee) => `
    <article class="employee-row ${employee.activo ? "is-active" : "is-inactive"}">
      <div class="employee-avatar" aria-hidden="true">${escapeHtml(getInitials(employee.nombre_completo))}</div>
      <div class="employee-identity">
        <strong>${escapeHtml(employee.nombre_completo)}</strong>
        <span>@${escapeHtml(employee.usuario)} · ${escapeHtml(employee.codigo_empleado || "Sin código")}</span>
      </div>
      <div class="employee-detail">
        <span>Correo</span>
        <strong>${escapeHtml(employee.correo)}</strong>
      </div>
      <div class="employee-detail">
        <span>Último acceso</span>
        <strong>${escapeHtml(formatDateTime(employee.ultimo_acceso))}</strong>
      </div>
      <span class="employee-state ${employee.activo ? "active" : "inactive"}">${employee.activo ? "Activa" : "Inactiva"}</span>
      <div class="employee-actions">
        <button type="button" data-action="edit" data-employee-id="${escapeHtml(employee.id)}">Editar</button>
        <button type="button" data-action="toggle" data-employee-id="${escapeHtml(employee.id)}" class="${employee.activo ? "danger" : "success"}">
          ${employee.activo ? "Desactivar" : "Activar"}
        </button>
      </div>
    </article>
  `).join("");
}

function updateMetrics() {
  const active = personalState.empleados.filter((employee) => employee.activo).length;
  document.querySelector("#employee-total").textContent = String(personalState.empleados.length);
  document.querySelector("#employee-active").textContent = String(active);
  document.querySelector("#employee-inactive").textContent = String(personalState.empleados.length - active);
}

function handleListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const employee = personalState.empleados.find((item) => item.id === button.dataset.employeeId);
  if (!employee) return;

  if (button.dataset.action === "edit") openEditForm(employee);
  if (button.dataset.action === "toggle") toggleEmployeeStatus(employee, button);
}

function openCreateForm() {
  personalState.editandoId = null;
  personalElements.form.reset();
  clearFormErrors();
  document.querySelector("#staff-id").value = "";
  document.querySelector("#staff-active").checked = true;
  document.querySelector("#staff-force-change").checked = true;
  personalElements.newPasswords.hidden = false;
  personalElements.temporaryForm.hidden = true;
  personalElements.formTitle.textContent = "Nueva cuenta de vendedor";
  personalElements.formHelp.textContent = "La contraseña temporal se usa una sola vez y no se muestra en el listado.";
  personalElements.saveButton.textContent = "Crear cuenta";
  showPersonalEditor();
}

function openEditForm(employee) {
  personalState.editandoId = employee.id;
  personalElements.form.reset();
  clearFormErrors();

  document.querySelector("#staff-id").value = employee.id;
  document.querySelector("#staff-full-name").value = employee.nombre_completo || "";
  document.querySelector("#staff-username").value = employee.usuario || "";
  document.querySelector("#staff-email").value = employee.correo || "";
  document.querySelector("#staff-phone").value = employee.telefono || "";
  document.querySelector("#staff-active").checked = Boolean(employee.activo);
  document.querySelector("#staff-force-change").checked = Boolean(employee.debe_cambiar_contrasena);
  document.querySelector("#staff-password").value = "";
  document.querySelector("#staff-password-confirmation").value = "";

  personalElements.newPasswords.hidden = true;
  personalElements.temporaryForm.hidden = false;
  personalElements.temporaryForm.reset();
  personalElements.temporaryStatus.textContent = "";
  personalElements.temporaryStatus.className = "form-status";
  personalElements.formTitle.textContent = `Editar ${employee.nombre_completo}`;
  personalElements.formHelp.textContent = "Los cambios conservarán el historial y el código del empleado.";
  personalElements.saveButton.textContent = "Guardar cambios";
  showPersonalEditor();
}

function showPersonalEditor() {
  personalElements.editor.hidden = false;
  personalElements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => document.querySelector("#staff-full-name").focus(), 250);
}

function closePersonalEditor() {
  personalState.editandoId = null;
  personalElements.form.reset();
  personalElements.temporaryForm.reset();
  clearFormErrors();
  personalElements.editor.hidden = true;
  document.querySelector("#personal-list-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveEmployee(event) {
  event.preventDefault();
  clearFormErrors();

  const data = validateEmployeeForm();
  if (!data) {
    setFormStatus("Revisa los campos marcados.", "error");
    personalElements.form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const wasEditing = Boolean(personalState.editandoId);
  setFormBusy(true);
  setFormStatus(wasEditing ? "Guardando cambios…" : "Creando cuenta…", "");

  try {
    let savedEmployee;
    if (personalState.modoDemostracion) {
      savedEmployee = saveDemoEmployee(data);
    } else if (personalState.editandoId) {
      const response = await window.AramacaoStaffApi.actualizarEmpleado(personalState.editandoId, data);
      savedEmployee = response.empleado;
    } else {
      const response = await window.AramacaoStaffApi.crearEmpleado(data);
      savedEmployee = response.empleado;
    }

    upsertEmployee(savedEmployee);
    renderEmployees();
    closePersonalEditor();
    setGlobalStatus(
      wasEditing ? "La cuenta se actualizó correctamente." : "La cuenta de vendedor se creó correctamente.",
      "success"
    );
  } catch (error) {
    applyApiFieldErrors(error);
    setFormStatus(getApiMessage(error, "No fue posible guardar la cuenta."), "error");
  } finally {
    setFormBusy(false);
  }
}

function validateEmployeeForm() {
  const fullName = document.querySelector("#staff-full-name");
  const username = document.querySelector("#staff-username");
  const email = document.querySelector("#staff-email");
  const phone = document.querySelector("#staff-phone");
  const password = document.querySelector("#staff-password");
  const passwordConfirmation = document.querySelector("#staff-password-confirmation");
  const normalizedUsername = username.value.trim().toLowerCase();
  let isValid = true;

  if (fullName.value.trim().length < 3) {
    setFieldError(fullName, "Escribe el nombre completo del empleado.");
    isValid = false;
  }
  if (!/^[a-z][a-z0-9]{3,39}$/.test(normalizedUsername)) {
    setFieldError(username, "Usa de 4 a 40 caracteres: letras y números, comenzando con una letra.");
    isValid = false;
  }
  if (!email.value.trim() || !email.validity.valid) {
    setFieldError(email, "Escribe un correo electrónico válido.");
    isValid = false;
  }
  if (phone.value.trim() && !/^[+0-9()\s-]{8,20}$/.test(phone.value.trim())) {
    setFieldError(phone, "Escribe un teléfono válido o deja el campo vacío.");
    isValid = false;
  }

  if (!personalState.editandoId) {
    if (!isStrongPassword(password.value)) {
      setFieldError(password, "Usa al menos 8 caracteres e incluye una letra y un número.");
      isValid = false;
    }
    if (!passwordConfirmation.value || passwordConfirmation.value !== password.value) {
      setFieldError(passwordConfirmation, "Las contraseñas no coinciden.");
      isValid = false;
    }
  }

  if (!isValid) return null;

  const duplicate = personalState.empleados.find((employee) =>
    employee.usuario.toLowerCase() === normalizedUsername && employee.id !== personalState.editandoId
  );
  if (personalState.modoDemostracion && duplicate) {
    setFieldError(username, "Este nombre de usuario ya está registrado en la prueba.");
    return null;
  }

  username.value = normalizedUsername;

  const data = {
    nombre_completo: fullName.value.trim(),
    usuario: normalizedUsername,
    correo: email.value.trim().toLowerCase(),
    telefono: phone.value.trim() || null,
    activo: document.querySelector("#staff-active").checked,
  };

  if (!personalState.editandoId) {
    data.contrasena_temporal = password.value;
    data.cambio_contrasena_obligatorio = true;
  }
  return data;
}

async function toggleEmployeeStatus(employee, button) {
  const action = employee.activo ? "desactivar" : "activar";
  const confirmed = window.confirm(`¿Deseas ${action} la cuenta de ${employee.nombre_completo}?`);
  if (!confirmed) return;

  button.disabled = true;
  try {
    let updated;
    if (personalState.modoDemostracion) {
      updated = { ...employee, activo: !employee.activo };
    } else {
      const response = await window.AramacaoStaffApi.actualizarEmpleado(employee.id, { activo: !employee.activo });
      updated = response.empleado;
    }
    upsertEmployee(updated);
    renderEmployees();
    setGlobalStatus(`La cuenta quedó ${updated.activo ? "activa" : "inactiva"}.`, "success");
  } catch (error) {
    button.disabled = false;
    setGlobalStatus(getApiMessage(error, "No fue posible cambiar el estado de la cuenta."), "error");
  }
}

async function saveTemporaryPassword(event) {
  event.preventDefault();
  clearTemporaryPasswordErrors();

  const password = document.querySelector("#temporary-password");
  const confirmation = document.querySelector("#temporary-password-confirmation");
  let isValid = true;

  if (!isStrongPassword(password.value)) {
    setFieldError(password, "Usa al menos 8 caracteres e incluye una letra y un número.");
    isValid = false;
  }
  if (!confirmation.value || confirmation.value !== password.value) {
    setFieldError(confirmation, "Las contraseñas no coinciden.");
    isValid = false;
  }
  if (!isValid) return;

  const button = document.querySelector("#save-temporary-password");
  button.disabled = true;
  personalElements.temporaryStatus.textContent = "Guardando…";

  try {
    if (!personalState.modoDemostracion) {
      await window.AramacaoStaffApi.asignarContrasenaTemporal(personalState.editandoId, password.value);
    }

    const employee = personalState.empleados.find((item) => item.id === personalState.editandoId);
    if (employee) {
      employee.debe_cambiar_contrasena = true;
      upsertEmployee(employee);
    }
    personalElements.temporaryForm.reset();
    personalElements.temporaryStatus.textContent = "Contraseña temporal asignada. El empleado deberá cambiarla al ingresar.";
    personalElements.temporaryStatus.className = "form-status success";
  } catch (error) {
    personalElements.temporaryStatus.textContent = getApiMessage(error, "No fue posible asignar la contraseña temporal.");
    personalElements.temporaryStatus.className = "form-status error";
  } finally {
    button.disabled = false;
  }
}

function saveDemoEmployee(data) {
  if (personalState.editandoId) {
    const current = personalState.empleados.find((item) => item.id === personalState.editandoId);
    return { ...current, ...data };
  }

  const nextNumber = personalState.empleados.length + 1;
  return {
    id: `demo-${Date.now()}`,
    codigo_empleado: `TAQ-${String(nextNumber).padStart(3, "0")}`,
    nombre_completo: data.nombre_completo,
    usuario: data.usuario,
    correo: data.correo,
    telefono: data.telefono,
    rol: "VENDEDOR_TAQUILLA",
    nombre_rol: "Vendedor de taquilla",
    activo: data.activo,
    debe_cambiar_contrasena: true,
    ultimo_acceso: null,
  };
}

function upsertEmployee(employee) {
  const index = personalState.empleados.findIndex((item) => item.id === employee.id);
  if (index >= 0) personalState.empleados[index] = employee;
  else personalState.empleados.unshift(employee);
}

function getDemoEmployees() {
  return [
    {
      id: "demo-hugo69",
      codigo_empleado: "TAQ-001",
      nombre_completo: "Hugo Méndez",
      usuario: "hugo69",
      correo: "hugo@example.com",
      telefono: "+504 9999-9999",
      rol: "VENDEDOR_TAQUILLA",
      nombre_rol: "Vendedor de taquilla",
      activo: true,
      debe_cambiar_contrasena: false,
      ultimo_acceso: "2026-08-07T19:30:00-06:00",
    },
    {
      id: "demo-prueba1",
      codigo_empleado: "TAQ-002",
      nombre_completo: "Cuenta de Prueba",
      usuario: "prueba1",
      correo: "prueba@example.com",
      telefono: null,
      rol: "VENDEDOR_TAQUILLA",
      nombre_rol: "Vendedor de taquilla",
      activo: false,
      debe_cambiar_contrasena: true,
      ultimo_acceso: null,
    },
  ];
}

function applyApiFieldErrors(error) {
  if (!(error instanceof window.AramacaoStaffApi.StaffApiError) || !error.details) return;
  const fieldMap = {
    nombre_completo: "staff-full-name",
    usuario: "staff-username",
    correo: "staff-email",
    telefono: "staff-phone",
    contrasena_temporal: "staff-password",
  };

  Object.entries(error.details).forEach(([field, messages]) => {
    const input = document.getElementById(fieldMap[field]);
    if (input) setFieldError(input, Array.isArray(messages) ? messages[0] : String(messages));
  });
}

function setFieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = document.querySelector(`[data-error-for="${input.id}"]`);
  if (error) error.textContent = message;
}

function clearFormErrors() {
  setFormStatus("", "");
  personalElements.form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  personalElements.form.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
  clearTemporaryPasswordErrors();
}

function clearTemporaryPasswordErrors() {
  personalElements.temporaryForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  personalElements.temporaryForm.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
}

function setFormStatus(message, type) {
  personalElements.formStatus.textContent = message;
  personalElements.formStatus.className = `form-status${type ? ` ${type}` : ""}`;
}

function setGlobalStatus(message, type) {
  personalElements.globalStatus.textContent = message;
  personalElements.globalStatus.className = `form-status management-global-status${type ? ` ${type}` : ""}`;
}

function setFormBusy(isBusy) {
  personalElements.saveButton.disabled = isBusy;
  personalElements.form.setAttribute("aria-busy", String(isBusy));
  personalElements.saveButton.textContent = isBusy
    ? "Guardando…"
    : personalState.editandoId ? "Guardar cambios" : "Crear cuenta";
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.passwordToggle);
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  button.textContent = willShow ? "Ocultar" : "Mostrar";
  button.setAttribute("aria-label", `${willShow ? "Ocultar" : "Mostrar"} contraseña`);
}

function isStrongPassword(value) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function getInitials(name) {
  return String(name || "E")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatDateTime(value) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return new Intl.DateTimeFormat("es-HN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Tegucigalpa",
  }).format(date);
}

function getApiMessage(error, fallback) {
  if (error instanceof window.AramacaoStaffApi.StaffApiError) return error.message || fallback;
  return fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
