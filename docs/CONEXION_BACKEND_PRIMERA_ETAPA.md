# Conexión con backend — primera etapa

Este documento explica los puntos de integración sin definir tablas ni campos. La arquitectura final queda a criterio del ingeniero backend.

## Fuente compartida de cartelera

Actualmente, `Frontend/index.html` y `Frontend/pages/taquilla/index.html` consumen:

```text
Frontend/assets/data/cartelera.json
```

En producción, ambas interfaces deben consumir la misma API de cartelera. Los cambios de películas, fechas, horarios, salas, precios y promociones realizados desde administración deben reflejarse en las dos páginas.

Los archivos donde se cambia la dirección temporal de los datos son:

```text
Frontend/assets/js/main.js
Frontend/assets/js/taquilla.js
```

Busca la constante `DATA_URL` al principio de cada archivo.

## Seguridad de Taquilla

- La ruta de taquilla debe requerir autenticación.
- Solo empleados con permiso de venta física pueden utilizarla.
- El backend debe identificar al vendedor en cada operación.
- No basta con ocultar enlaces o botones en el frontend.

## Confirmación de una venta

Seleccionar un asiento en el frontend no lo reserva. Es únicamente una selección temporal en la pantalla del comprador o del vendedor.

Antes de confirmar el pago, backend debe volver a comprobar que los asientos continúan disponibles. La comprobación, el pago, la creación de la venta, los boletos y la actualización del estado deben completarse como una sola operación segura.

Si dos vendedores intentan confirmar el mismo asiento, solamente una venta debe completarse; la otra debe recibir una respuesta que indique cuáles asientos dejaron de estar disponibles.

El ciclo de estados solicitado es:

1. **Disponible:** puede seleccionarse.
2. **Seleccionado:** estado temporal del frontend; todavía no bloquea ni reserva.
3. **Reservado:** el pago fue confirmado y el boleto ya fue emitido.
4. **Ocupado:** el boleto o QR fue escaneado correctamente antes de entrar a la sala.

La estrategia técnica para confirmar pagos, resolver concurrencia y actualizar estados queda a criterio del ingeniero backend. El frontend no utiliza `localStorage` ni genera ocupación aleatoria.

## Regla 2x1

- Solo puede aplicarse si la promoción está habilitada y la fecha de la función cumple sus condiciones.
- El vendedor decide si la aplica.
- Por cada dos admisiones, una se cobra y la otra se bonifica.
- Ambos asientos reducen el aforo.
- Cada persona debe recibir su boleto o acceso individual.
- La venta y el recibo deben conservar el precio normal, el descuento y el total pagado.
- El backend debe validar esta regla incluso si el frontend ya la validó.

## Recibo y boletos

El frontend no diseña ni imprime un recibo. Backend definirá el comprobante, proporcionará el número permanente de venta y utilizará únicamente datos confirmados. Los códigos QR reales deben ser únicos, verificables y generados a partir de boletos guardados.

## Elementos todavía simulados

- Sesión e identidad del empleado.
- Consulta de estados de los asientos por función.
- Confirmación del pago y cambio a estado reservado.
- Escaneo del boleto y cambio a estado ocupado.
- Pago con tarjeta o transferencia.
- Número permanente de venta.
- QR y boletos individuales.
- Registro de reimpresiones.
