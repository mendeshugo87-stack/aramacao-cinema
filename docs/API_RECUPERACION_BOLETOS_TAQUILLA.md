# Recuperación de boletos en Taquilla

## Objetivo

Permitir que un vendedor ayude a un cliente que perdió el teléfono o la copia del boleto sin darle acceso al panel administrativo completo.

La pantalla reutiliza `/pages/taquilla/`, pero el backend exige dos permisos adicionales:

```text
clientes.buscar_para_recuperacion
boletos.recuperar_cliente
```

## Flujo operativo

1. El vendedor busca por identidad exacta, nombre o usuario.
2. El sistema devuelve pocos resultados con identidad enmascarada.
3. El cliente presenta físicamente su documento y el vendedor compara los datos.
4. El sistema muestra únicamente las compras cuya función es hoy o una fecha futura, ordenadas desde la función más cercana.
5. El vendedor selecciona un boleto recuperable, confirma la verificación y escribe el motivo.
6. Django invalida el QR anterior, crea uno nuevo y registra la auditoría en una transacción.
7. Taquilla descarga el boleto actualizado para entregarlo al cliente.

## Endpoints

```text
POST /api/v1/taquilla/clientes/buscar/
GET  /api/v1/taquilla/clientes/{cliente_id}/compras-recuperables/
POST /api/v1/taquilla/boletos/{boleto_id}/recuperacion/
GET  /api/v1/taquilla/boletos/{boleto_id}/descargar/
```

El contrato de propiedades, respuestas y errores está en:

```text
docs/json/cuentas-clientes/04-consulta-taquilla-clientes-futuro.json
```

## Reglas que no se negocian

- La búsqueda no lista automáticamente toda la base de clientes.
- La identidad nunca viaja en la URL ni se devuelve completa.
- Las compras se relacionan por el `cliente_id` inmutable, no por el nombre o la identidad.
- La consulta de Taquilla no devuelve el historial completo: solo funciones de hoy y futuras, ordenadas por fecha y hora ascendente. El historial permanece en `Mis compras` y en Administración.
- Solo se recupera un boleto `RESERVADO` de una venta `PAGADA`.
- Después de 20 minutos del inicio de la función ya no se permite la recuperación ordinaria.
- El vencimiento de esos 20 minutos no libera ni revende automáticamente un asiento ya pagado. Los bloqueos temporales sin pago sí vencen según su propia expiración.
- Un boleto `OCUPADO` no se reimprime como boleto válido y no se reemite.
- El número del boleto, la función y el asiento permanecen iguales; solamente cambia el QR.
- Solo puede existir un QR activo por boleto.
- El motivo, vendedor, fecha, comprobación del documento, estados e información técnica se auditan.

## Demostración local

Para QA en `localhost`, la identidad ficticia es `0801199012345` y corresponde a `Hugo Méndez`. Solo aparecen compras en línea creadas en el mismo origen del navegador cuya función sea hoy o futura. Estos datos no representan una verificación real ni sustituyen a Django.
