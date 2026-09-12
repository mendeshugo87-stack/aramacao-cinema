# Estructura del frontend — AraMacao Cinema

Guía rápida para ubicarse en el código. Si vas a conectar Django, lee las tres
primeras secciones y ya sabrás dónde tocar.

El frontend es HTML, CSS y JavaScript sin compilación: se abre con cualquier
servidor estático (`python -m http.server` dentro de `Frontend/`).

---

## 1. La regla principal: la pantalla nunca llama al servidor

Cada área tiene **dos tipos de archivo** y no se mezclan:

| Tipo | Qué hace | Ejemplo |
|---|---|---|
| `*-api.js` | Habla con el backend. Es el **único** sitio con `fetch` y rutas. | `compartido/sales-api.js` |
| El resto | Interfaz: formularios, botones, pintar el DOM. | `taquilla/taquilla.js` |

Si una ruta del backend cambia, se corrige en el `*-api.js` correspondiente y
ninguna pantalla se entera.

Los nombres de los métodos siguen siempre el mismo patrón:
`obtenerX`, `crearX`, `actualizarX`, `eliminarX`.

---

## 2. Base compartida (`assets/js/compartido/`)

Estos dos archivos se cargan **primero en todas las páginas**:

| Archivo | Para qué |
|---|---|
| `utilidades.js` | `AramacaoUtil`: escapar HTML, formatear dinero y fechas, ordenar asientos, saber si es vista local. |
| `api-cliente.js` | `AramacaoApiCliente`: **el único sitio donde se arma una petición HTTP** (fetch, CSRF, lectura de JSON, formato de error). |

**Para conectar Django, empieza por `api-cliente.js`.** Ahí está el manejo de
CSRF, el formato de error que se espera del backend
(`{ mensaje, codigo, errores }`) y la ruta base `/api/v1`.

El resto de `compartido/` es el área de ventas, que atraviesa varias pantallas:

| Archivo | Para qué |
|---|---|
| `sales-api.js` | Ventas, boletos y QR. Solo rutas y la decisión "¿demo o servidor?". |
| `seat-api.js` | Aforo de la Sala 1 y bloqueo temporal de asientos. |
| `ventas-demo.js` | Datos de prueba en `localStorage`. **Se puede borrar entero cuando el backend responda.** |
| `boleto-documento.js` | Dibuja el boleto en PNG, el QR y las hojas imprimibles. No habla con el servidor. |

---

## 3. Orden de carga (importa)

Son scripts clásicos, sin módulos: se ejecutan en el orden en que aparecen.

```
utilidades.js  →  api-cliente.js  →  (el *-api.js del área)  →  (la pantalla)
```

En Administración hay una dependencia más: `administracion-funciones.js`
espera a que `administracion-peliculas.js` termine de cargar los catálogos
(usa la promesa `window.AdministracionPeliculasListo`), así que debe ir
**después** en el HTML.

Al editar un `.js`, **sube el número de `?v=` en los HTML** que lo cargan, o el
navegador seguirá usando la versión vieja de su caché. Hoy todos van en `?v=22`.

---

## 4. Carpetas por área

```
assets/js/
├── compartido/      base común + ventas (ver arriba)
├── publico/         Inicio, Cartelera, Próximamente y el almacén local
│                    cinema-store.js = caché de la cartelera en IndexedDB
├── cuenta/          cuentas de clientes (JWT)
├── empleados/       inicio de sesión del personal y protección de áreas privadas
├── administracion/  películas, funciones, personal y ventas
├── taquilla/        venta en ventanilla y recuperación de boletos
├── compra/          compra en línea
└── entrada/         lector de QR en la puerta
```

### Por qué hay dos archivos de autenticación de personal

| Archivo | Responde a |
|---|---|
| `empleados/staff-api.js` | "¿quién eres y puedes entrar?" — lo usan **todas** las áreas privadas. |
| `administracion/personal-api.js` | "crear y editar empleados" — solo Administración. |

Estaban juntos y cada página privada cargaba también el CRUD que no usaba.

### Por qué películas y funciones están separadas

`administracion/peliculas-api.js` y `administracion/funciones-api.js` son dos
recursos distintos a propósito: guardar el título de una película no debe
obligar a reenviar todos sus horarios, y activar el 2x1 no pasa por el
formulario de la película. Coincide con el contrato ya documentado en
`docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md`.

---

## 5. Vista local (sin backend)

`AramacaoUtil.esVistaLocal()` es verdadero cuando el sitio se abre en
`localhost`. Todos los `*-api.js` la consultan igual:

```js
if (Util.esVistaLocal()) return /* datos de demostración */;
return enviar(rutas.loQueSea());
```

Así se puede revisar el circuito completo (Compra → Mi cuenta → Taquilla →
Entrada) sin servidor. Nada de la demostración se usa en producción.

---

## 6. Reglas de negocio que el código respeta

Estas reglas están en el frontend para evitar errores por descuido, pero
**el backend debe volver a validarlas todas**:

- Hay **una sola sala** ("Sala 1", filas A–H, 14 butacas). Dos funciones no
  pueden cruzarse en horario (`funciones-api.js` → `validarCruceDeSala`).
- Los asientos se cuentan **por función**, no por película.
- La venta en línea **cierra 20 minutos** después de que empieza la función.
- El **2x1 solo aplica lunes, martes y miércoles**, y solo si Administración lo
  activa. Taquilla nunca lo activa: únicamente lo muestra.
- Cada **QR sirve una sola vez**. Reemitir un boleto invalida el QR anterior.
- Anular o reembolsar exige un **motivo de al menos 10 caracteres** y queda en
  el historial de la venta.
- Una venta con boletos ya usados **no** se puede anular sin revisión humana.

---

## 7. Contratos del backend

Las rutas que usa el frontend están documentadas en:

- `docs/API_ACCESO_EMPLEADOS.md` — acceso del personal
- `docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md` — películas, funciones, 2x1
- `docs/API_AFORO_ASIENTOS_BLOQUEOS.md` — asientos y bloqueos
- `docs/API_ADMINISTRACION_VENTAS_REEMISIONES.md` — ventas y reemisiones
- `docs/API_RECUPERACION_BOLETOS_TAQUILLA.md` — boletos perdidos
- `docs/json/` — los mismos contratos en JSON, listos para pruebas

En cada `*-api.js` las rutas están juntas al principio, en un objeto `rutas`,
para verlas de un golpe.
