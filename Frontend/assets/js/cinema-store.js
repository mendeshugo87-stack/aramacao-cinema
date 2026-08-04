"use strict";

/*
 * FUENTE DE DATOS DE LA MAQUETA
 * -----------------------------
 * Este archivo permite probar que una película cargada desde Administración
 * aparezca también en Inicio, sin crear todavía una base de datos real.
 *
 * IndexedDB se usa únicamente para datos de demostración en el navegador.
 * El backend deberá reemplazar getData(), saveData() y resetData() por llamadas
 * autenticadas a la API de Django. Nunca se deben guardar aquí cuentas,
 * contraseñas, pagos, ventas ni disponibilidad real de asientos.
 */
window.CinemaStore = (() => {
  const DATABASE_NAME = "aramacao-cinema-demo";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "content";
  const CATALOG_KEY = "catalog";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async function readCatalog() {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CATALOG_KEY);

      request.addEventListener("success", () => resolve(request.result || null));
      request.addEventListener("error", () => reject(request.error));
      transaction.addEventListener("complete", () => database.close());
    });
  }

  async function saveData(data) {
    const database = await openDatabase();
    const safeCopy = structuredClone(data);

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(safeCopy, CATALOG_KEY);
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(safeCopy);
      });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error);
      });
    });
  }

  async function fetchDefaultData(dataUrl) {
    const response = await fetch(dataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`La fuente de datos respondió con estado ${response.status}`);
    }
    return response.json();
  }

  async function getData(dataUrl) {
    const savedCatalog = await readCatalog();
    if (savedCatalog) return savedCatalog;

    const defaultData = await fetchDefaultData(dataUrl);
    await saveData(defaultData);
    return structuredClone(defaultData);
  }

  async function resetData(dataUrl) {
    const defaultData = await fetchDefaultData(dataUrl);
    await saveData(defaultData);
    return structuredClone(defaultData);
  }

  return { getData, saveData, resetData };
})();
