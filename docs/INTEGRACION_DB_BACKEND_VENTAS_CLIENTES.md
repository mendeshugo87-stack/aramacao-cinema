# Integración con la base del backend: clientes, ventas y QR

## Fuente revisada

Se revisó la estructura —sin copiar registros personales— del respaldo `aramacao_backup_202608182328.sql` recibido el 20 de agosto de 2026.

El respaldo ya contiene las piezas principales:

```text
cliente_cliente
venta_venta
venta_pago
venta_boleto
venta_reimpresion
cartelera_funcion
aforo_asiento
```

Por eso no se debe crear un segundo sistema de clientes o ventas. Los endpoints nuevos deben usar estas tablas mediante modelos y migraciones de Django.

## Correspondencia actual

| Contrato del frontend | Campo existente | Decisión de integración |
|---|---|---|
| `cliente_id` | `venta_venta.cliente_id` | Es la relación del dueño y la única forma válida de asociar compras. |
| Identidad | `cliente_cliente.dni` `UNIQUE` | Reutilizar como número normalizado; nunca devolverlo completo en Taquilla. |
| Usuario | `cliente_cliente.usuario_id` → `auth_user` | Reutilizar el usuario autenticado; no duplicar credenciales. |
| Número de venta | `venta_venta.numero` | Reutilizar, pero ampliar longitud para referencias `ARA-...` y `TAQ-...`. |
| Pago | `venta_pago` | Reutilizar para método, monto, estado y referencia. |
| Número y estado del boleto | `venta_boleto.numero`, `estado` | Reutilizar y definir los valores de estado en Django. |
| Función y asiento | `venta_boleto.funcion_id`, `asiento_id` | La restricción única existente evita vender dos veces el mismo asiento de una función. |
| Reimpresión | `venta_reimpresion` | Ampliar para distinguir boleto, comprobante, reimpresión y reemisión. |
| Ventana visible en Taquilla | `cartelera_funcion.fecha`, `hora_inicio` | Filtrar desde la fecha actual de `America/Tegucigalpa` y ordenar por inicio ascendente. |
| Límite de recuperación | `cartelera_funcion.fecha`, `hora_inicio` | Calcular en servidor: inicio de función más 20 minutos. El vencimiento no libera automáticamente un asiento pagado. |

## Migraciones necesarias antes de conectar producción

### Cliente

- Mantener `dni` único y normalizado.
- Si se conservará el soporte actual para pasaporte, agregar `tipo_identificacion` y una restricción única coherente con tipo + número. Si el backend acepta únicamente identidad hondureña, el frontend debe retirar la opción pasaporte de forma explícita.
- Definir unicidad de correo normalizado si el correo será credencial de acceso.

### Venta

- Ampliar `venta_venta.numero` de `varchar(20)` a por lo menos `varchar(40)`. La referencia actual `TAQ-YYYYMMDDHHMMSS-NNN` no cabe en 20 caracteres.
- Agregar `canal` (`ONLINE` o `TAQUILLA`).
- Agregar vendedor/empleado para ventas de Taquilla.
- Permitir `cliente_id` nulo en una venta anónima de Taquilla o definir de forma documentada un comprador de ventanilla. No crear clientes falsos repetidos.
- Persistir una clave de idempotencia única por operación de venta.

### Pago

- Agregar identificador idempotente del intento o movimiento del proveedor.
- Para efectivo, guardar `efectivo_recibido` y `cambio` como decimales, no dentro de texto libre.
- Separar estado de venta y estado de pago.

### Boleto y QR

- Ampliar `venta_boleto.numero` si el formato definitivo puede superar 30 caracteres.
- No usar `codigo` como dato personal o código predecible. Guardar un token opaco seguro o su hash según la estrategia de validación.
- Agregar `escaneado_en` y el empleado de Control de entrada que registró el ingreso.
- Agregar `numero_reemisiones`, `reemitido_en` y versión del QR.
- Conservar historial de tokens: token/hash, versión, activo, creado e invalidado. Una restricción debe garantizar un solo QR activo por boleto.
- Escaneo y reemisión deben usar transacción y bloqueo de fila para impedir dos ingresos o dos reemisiones simultáneas.

### Auditoría

La tabla actual `venta_reimpresion` solo enlaza `venta_id`. Debe evolucionar o complementarse con una auditoría que incluya:

```text
venta_id
boleto_id opcional
empleado_id
accion
motivo
documento_verificado
fecha
estado_anterior
estado_posterior
ip
agente_usuario
metadatos seguros
```

Las acciones mínimas son `COMPROBANTE_REIMPRESO`, `BOLETO_REIMPRESO`, `BOLETO_REEMITIDO`, `BOLETO_RECUPERADO_TAQUILLA`, `INGRESO_REGISTRADO`, `VENTA_ANULADA` y `VENTA_REEMBOLSADA`.

## Unión con los endpoints

El frontend ya centraliza las llamadas en `Frontend/assets/js/sales-api.js`. Django puede conservar sus nombres internos; solamente debe exponer las rutas y objetos acordados en:

```text
docs/json/07-09-ventas-pagos-boletos-qr.json
docs/json/10-administracion-ventas-reemisiones.json
docs/json/cuentas-clientes/04-consulta-taquilla-clientes-futuro.json
```

No fue posible comparar los nombres exactos de la colección de Postman porque el enlace compartido redirige a inicio de sesión y verificación de seguridad. El backend debe exportar la colección como JSON y adjuntarla al proyecto. Con ese archivo se preparará una tabla final `ruta Postman → ruta frontend → vista Django` sin adivinar nombres.

Mientras llega esa exportación, `docs/postman/Aramacao-Contratos-Ventas-Recuperacion.postman_collection.json` puede importarse en Postman para probar las rutas que ya espera el frontend.

## Orden recomendado para el backend

1. Crear las migraciones de cliente, venta, pago, boleto, token y auditoría.
2. Implementar permisos y sesiones de empleado.
3. Implementar búsqueda limitada y compras recuperables solo para funciones de hoy y futuras, ordenadas desde la más cercana.
4. Implementar reemisión transaccional e invalidación del QR anterior.
5. Implementar descarga únicamente para boletos `RESERVADO`.
6. Ejecutar pruebas de concurrencia, reutilización de QR, tiempo límite y autorización.

Los bloqueos temporales sin pago pueden liberarse al expirar. Un boleto pagado debe conservar su asiento aunque termine la ventana ordinaria de recuperación; cualquier política de `NO_SHOW` y reventa necesita condiciones informadas, un estado propio, invalidación del QR y auditoría antes de implementarse.
