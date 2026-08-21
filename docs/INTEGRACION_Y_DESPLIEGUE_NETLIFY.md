# Integración del frontend, Django y despliegue en Netlify

## Qué se despliega en cada lugar

- **Netlify:** el contenido estático de `Frontend/`.
- **Django:** autenticación, permisos, catálogos, funciones, promociones, asientos, bloqueos, órdenes, ventas, pagos, comprobantes, boletos y validación QR.
- **Base de datos:** usuarios, roles, catálogo, inventario, funciones, ventas y auditoría.
- **Proveedor de pago:** se conecta al final; su webhook confirmado es quien autoriza la emisión de boletos en compras en línea.

`netlify.toml` deja preparado `Frontend/` como directorio de publicación. No se agrega todavía un proxy `/api/` porque falta conocer la URL HTTPS definitiva del backend.

## Carrito de boletos

No hace falta crear otra página de carrito para la primera versión. La pantalla `Frontend/pages/comprar/index.html` ya reúne:

- película y función;
- asientos seleccionados;
- promoción;
- subtotal, descuento y total;
- continuación al pago.

En el navegador esto es un **resumen de compra**. Django sigue siendo la fuente de verdad y debe:

1. crear y expirar el bloqueo temporal de asientos;
2. comprobar disponibilidad;
3. recalcular precios, promociones y total;
4. crear la orden pendiente de pago;
5. confirmar el pago por webhook;
6. emitir venta, comprobante y un boleto por asiento en una transacción.

Cuando Dulcería tenga venta en línea, el carrito podrá ampliarse para admitir productos e inventario. Eso no debe bloquear la integración actual de boletos.

## Orden recomendado de integración

1. Inicio de sesión, sesión y permisos de empleados.
2. Cuentas de clientes.
3. Películas, géneros, actores y directores.
4. Funciones, salas, formatos y promociones.
5. Disponibilidad y bloqueos de asientos.
6. Compra en línea y venta de Taquilla sin proveedor de pago real.
7. Comprobantes, boletos QR, historial y control de entrada.
8. Administración de ventas, reemisiones y recuperación en Taquilla.
9. Proveedor de pago y webhook.
10. Dulcería e inventario, si se incluye en la compra en línea.

## Preparación del despliegue

1. Conectar el repositorio de GitHub en Netlify.
2. Usar `develop` para una vista de revisión y `main` para producción cuando se apruebe.
3. Netlify leerá `netlify.toml` y publicará `Frontend/`.
4. Desplegar Django en un servicio HTTPS con su base de datos.
5. Definir la URL pública del backend.
6. Elegir una de estas estrategias:
   - proxy de `/api/*` desde Netlify hacia Django; o
   - URL absoluta de API con CORS, CSRF y cookies configurados para ambos dominios.
7. Probar cuentas, administración, compra, Taquilla y Control de entrada con permisos reales.

No deben publicarse claves privadas ni secretos del proveedor de pago dentro de `Frontend/` ni de `netlify.toml`. Las variables públicas de construcción no reemplazan el almacenamiento seguro de secretos en Django.

## Criterio para activar el pago real

El pago se conecta únicamente cuando estén terminados y probados:

- autenticación del cliente;
- disponibilidad y bloqueo de asientos;
- cálculo definitivo del backend;
- creación de orden;
- idempotencia;
- webhook verificado;
- emisión transaccional de comprobante y boletos;
- manejo de cancelación y reembolso.
