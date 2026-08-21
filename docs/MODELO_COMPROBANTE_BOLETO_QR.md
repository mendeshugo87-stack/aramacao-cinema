# Modelo definitivo de comprobante y boleto QR

## Separación de documentos

Una venta genera dos tipos de documento diferentes:

1. Un **comprobante de compra no fiscal** que resume la venta completa.
2. Un **boleto de entrada individual por asiento**, cada uno con su propio QR.

El comprobante no lleva QR y no sustituye una factura fiscal. La eventual factura fiscal debe definirse como otro documento y cumplir las reglas tributarias aplicables.

## Comprobante de compra

Campos mínimos:

- Logo y nombre de Aramacao Cinema.
- Número de comprobante.
- Referencia de venta.
- Fecha y hora de venta en `America/Tegucigalpa`.
- Estado de la venta y del pago.
- Comprador.
- Película, función, sala y formato.
- Canal: compra en línea o Taquilla.
- Método de pago y vendedor cuando corresponda.
- Detalle por asiento, tarifa y promoción.
- Subtotal, descuento y total en HNL.
- Efectivo recibido y cambio cuando corresponda.

## Boleto individual

Campos mínimos:

- Logo y nombre de Aramacao Cinema.
- Título `BOLETO DE ENTRADA`.
- QR individual.
- Película, función, sala, formato y asiento destacado.
- Comprador.
- Promoción y posición dentro de la pareja 2x1, si aplica.
- Referencia de compra y número único de boleto.
- Aviso de un solo ingreso.

El número de la venta y el número del boleto no son el contenido de seguridad del QR. El QR contiene únicamente un token opaco aleatorio o una URL de validación que incluya ese token. No debe incluir identidad, correo, teléfono ni información de pago.

## Entrega digital al cliente

- En Compra en línea y `Mis compras`, el boleto individual se entrega como una imagen PNG completa, no como comprobante ni como archivo HTML.
- La imagen conserva logo, QR, película, asiento, función, comprador y números de compra y boleto.
- En teléfonos compatibles se abre la opción del sistema para guardar o compartir la imagen. En los demás navegadores se descarga un archivo `.png` que puede abrirse desde Descargas o guardarse en la galería.
- El comprobante de compra permanece como un documento imprimible separado y no lleva QR.
- Taquilla y Administración conservan la vista térmica imprimible del boleto; no usan la descarga PNG destinada al cliente.

## Impresión térmica

La vista descargada permite elegir:

- Papel de 58 mm: contenido útil de 52 mm.
- Papel de 80 mm: contenido útil de 72 mm.

El QR conserva un tamaño aproximado de 34 mm para evitar perder legibilidad. La elección del papel cambia el ancho del documento, pero no el token ni el estado del boleto.

El operador todavía debe seleccionar en el diálogo del sistema el tamaño de papel configurado en la impresora. El frontend no puede cambiar automáticamente el controlador físico.

La selección de 58 u 80 mm aplica solamente a los documentos impresos por Taquilla o Administración. No cambia el tamaño ni el contenido del PNG que recibe el cliente.

## Reglas del backend

- Django genera o entrega el documento definitivo usando datos confirmados de la venta.
- Solo un boleto `RESERVADO` puede descargarse como boleto vigente.
- Un boleto `OCUPADO`, `ANULADO` o `REEMBOLSADO` no puede volver a imprimirse como boleto válido.
- Reemitir un boleto invalida el QR anterior y registra empleado, motivo y fecha.
- El primer escaneo válido cambia el boleto a `OCUPADO`; los siguientes se rechazan.
- La generación del comprobante y de todos los boletos debe ocurrir después de confirmar el pago.

## Implementación de demostración

- Generador y descarga: `Frontend/assets/js/sales-api.js`.
- Logo: `Frontend/assets/images/AraMacao Completo Degradado (3).png`.
- Contrato de ventas, pagos y QR: `docs/json/07-09-ventas-pagos-boletos-qr.json`.
