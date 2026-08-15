# Contrato API — aforo, asientos y bloqueos por función

**Versión:** 1.0
**Zona horaria:** `America/Tegucigalpa`

## 1. Distribución oficial de Sala 1

Aramacao utiliza una sola sala con la siguiente distribución:

- Sala: `Sala 1`.
- Filas: `A`, `B`, `C`, `D`, `E`, `F`, `G` y `H`.
- Asientos por fila: `14`.
- Aforo total: `112`.
- Pasillo central: después del asiento `7`, entre los asientos `7` y `8`.

La disponibilidad pertenece a una función específica. Por ejemplo, `A1` puede estar reservado para la función de las 3:00 p. m. y disponible para la función de las 7:00 p. m.

## 2. Estados de un asiento

| Estado | Significado |
| --- | --- |
| `DISPONIBLE` | Puede seleccionarse y bloquearse. |
| `BLOQUEADO_TEMPORALMENTE` | Una sesión está completando la compra. |
| `RESERVADO` | El pago fue confirmado y existe un boleto válido. |
| `OCUPADO` | El boleto ya fue escaneado para ingresar. |

`SELECCIONADO` es únicamente un estado visual del navegador. No representa una reserva en Django.

## 3. Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/funciones/{funcion_id}/asientos/` | Consultar distribución y disponibilidad. |
| `POST` | `/api/v1/funciones/{funcion_id}/bloqueos-asientos/` | Bloquear temporalmente los asientos antes del pago. |
| `DELETE` | `/api/v1/bloqueos-asientos/{bloqueo_id}/` | Liberar voluntariamente un bloqueo activo. |

Los endpoints requieren una sesión válida de cliente o una sesión de empleado con permiso de Taquilla. Django identifica la persona y el canal mediante la sesión; el navegador no asigna roles.

## 4. Consulta de disponibilidad

La respuesta incluye:

- distribución oficial de Sala 1;
- hora de inicio y límite de venta;
- duración del bloqueo temporal;
- asientos bloqueados temporalmente;
- asientos reservados;
- asientos ocupados;
- bloqueo activo perteneciente a la sesión actual, cuando exista.

Todo asiento incluido en la distribución que no aparezca en una lista de bloqueo, reservado u ocupado se considera `DISPONIBLE`.

Ejemplo: `docs/json/asientos/disponibilidad-success.json`.

## 5. Bloqueo temporal

Seleccionar un asiento en pantalla no modifica el servidor. El frontend solicita el bloqueo cuando el cliente o vendedor continúa hacia la confirmación del pago.

El bloqueo:

1. contiene la función y los asientos;
2. pertenece a la sesión que lo creó;
3. dura como máximo `600` segundos;
4. vence antes si se alcanza `venta_hasta`;
5. se libera automáticamente al expirar;
6. puede liberarse voluntariamente con `DELETE`;
7. no puede ser utilizado por otra sesión.

Ejemplos:

- Solicitud: `docs/json/asientos/bloqueo-crear-request.json`.
- Respuesta: `docs/json/asientos/bloqueo-success.json`.

## 6. Prevención de ventas dobles

Django debe volver a comprobar todos los asientos al crear el bloqueo y al confirmar la venta.

Si dos personas solicitan el mismo asiento, solamente una operación puede obtenerlo. La otra recibe `409 ASIENTO_NO_DISPONIBLE`.

La confirmación futura del pago debe ejecutarse como una operación segura: validar el bloqueo, registrar la venta, generar los boletos y cambiar los asientos a `RESERVADO`. El frontend no decide el resultado.

## 7. Cierre de venta

`venta_hasta` corresponde a 20 minutos después de `hora_inicio`.

Al llegar a ese momento, Django debe:

- rechazar nuevos bloqueos;
- rechazar confirmaciones que lleguen fuera del límite;
- liberar bloqueos temporales sin pago;
- conservar los asientos reservados y ocupados.

Se reutiliza el código `VENTA_CERRADA_20_MIN` documentado en el módulo de cartelera.

## 8. Promoción 2x1

El 2x1 no reduce la cantidad de asientos necesarios:

- se seleccionan dos asientos;
- se bloquean dos asientos;
- el pago futuro cobra una admisión por cada dos;
- se generan dos boletos individuales;
- ambos asientos reducen el aforo.

Taquilla y compra en línea utilizan exactamente la misma regla calculada por Django.

## 9. Regla futura del boleto y QR

La generación y el escaneo definitivo del QR pertenecen a un módulo posterior, pero deben conservar estos estados:

1. pago aprobado: boleto válido y asiento `RESERVADO`;
2. primer escaneo válido: boleto `UTILIZADO` y asiento `OCUPADO`;
3. segundo escaneo: respuesta `409 BOLETO_YA_UTILIZADO`;
4. Django registra fecha, hora y empleado que realizó el primer escaneo;
5. un QR no contiene datos personales visibles ni puede aceptar un asiento diferente;
6. cada asiento tiene un boleto y QR individual.

Esto impide que una captura del mismo QR permita el ingreso de más de una persona.

## 10. Errores principales

| Estado HTTP | Código | Uso |
| ---: | --- | --- |
| `400` | `ASIENTO_INVALIDO` | El código no pertenece a Sala 1. |
| `401` | `AUTENTICACION_REQUERIDA` | No existe una sesión válida. |
| `403` | `PERMISO_DENEGADO` | La sesión no puede operar en ese canal. |
| `404` | `RECURSO_NO_ENCONTRADO` | No existe la función o el bloqueo. |
| `409` | `ASIENTO_NO_DISPONIBLE` | Otro proceso obtuvo el asiento. |
| `409` | `BLOQUEO_EXPIRADO` | Terminó el tiempo del bloqueo. |
| `409` | `VENTA_CERRADA_20_MIN` | La función alcanzó el límite de venta. |

Ejemplos de error:

- `docs/json/asientos/error-asiento-no-disponible.json`.
- `docs/json/asientos/error-bloqueo-expirado.json`.

## 11. Estado actual del frontend

Taquilla ya muestra las 8 filas, 14 asientos por fila, el pasillo central y los cuatro estados visuales. Todavía no persiste disponibilidad ni confirma ventas.

La compra en línea posee una ruta protegida, pero el mapa de asientos se integrará después de conectar este contrato.

`Frontend/assets/js/cinema-store.js` no debe guardar disponibilidad real, pagos, ventas ni boletos.

## 12. Archivos del contrato

- `docs/json/05-asientos-bloqueos.json`.
- `docs/json/asientos/disponibilidad-success.json`.
- `docs/json/asientos/bloqueo-crear-request.json`.
- `docs/json/asientos/bloqueo-success.json`.
- `docs/json/asientos/error-asiento-no-disponible.json`.
- `docs/json/asientos/error-bloqueo-expirado.json`.
