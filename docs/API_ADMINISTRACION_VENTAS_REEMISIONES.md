# Administración de ventas y reemisión de boletos

## Objetivo

La página privada `Frontend/pages/gestion/ventas.html` permite al administrador operativo consultar ventas en línea y de Taquilla, revisar sus boletos, reimprimir documentos y ejecutar acciones sensibles con motivo y auditoría.

El contrato técnico completo está en:

```text
docs/json/10-administracion-ventas-reemisiones.json
```

## Diferencia entre reimpresión y reemisión

- **Reimprimir comprobante:** descarga otra copia; no modifica la venta.
- **Reimprimir boleto:** descarga otra copia del boleto con el QR vigente, únicamente mientras siga `RESERVADO`.
- **Reemitir QR:** invalida el QR anterior y genera uno nuevo para el mismo boleto, función y asiento.
- Un boleto `OCUPADO`, `ANULADO` o `REEMBOLSADO` no se puede reimprimir como boleto válido ni reemitir.

## Endpoints preparados

```text
GET  /api/v1/administracion/ventas/
GET  /api/v1/administracion/ventas/{venta_id}/
GET  /api/v1/administracion/ventas/{venta_id}/comprobante/descargar/
GET  /api/v1/administracion/boletos/{boleto_id}/descargar/
POST /api/v1/administracion/boletos/{boleto_id}/reemision/
POST /api/v1/administracion/ventas/{venta_id}/anulacion/
POST /api/v1/administracion/ventas/{venta_id}/reembolso/
```

## Permisos separados

```text
ventas.consultar
ventas.reimprimir_comprobante
boletos.reimprimir
boletos.reemitir
ventas.anular
pagos.reembolsar
```

El permiso `ventas.consultar` abre la página, pero no debe autorizar las demás acciones. Django comprueba el permiso específico en cada endpoint.

## Reglas de seguridad

- No devolver `token_qr`, `contenido_qr`, hashes ni secretos de pago en los listados o detalles.
- Exigir un motivo de 10 a 300 caracteres para reemitir, anular o reembolsar.
- Aceptar `Idempotency-Key` en todas las acciones mutables.
- Bloquear anulación y reembolso si algún boleto ya registra ingreso; ese caso requiere revisión manual autorizada.
- Registrar empleado, fecha, IP, agente de usuario, motivo, estado anterior y estado posterior.
- El frontend local sirve para QA en un navegador. Django será la fuente compartida para computadoras, teléfonos y tabletas.

## Integración esperada

`Frontend/assets/js/sales-api.js` ya contiene las rutas y cambia automáticamente entre la demostración local y `/api/v1`. El backend debe respetar los nombres de propiedades del contrato o acordar una adaptación antes de cambiar las respuestas.
