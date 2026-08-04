# Aramacao Cinema — ajustes visuales V6

Esta versión continúa sobre `ARAMACAO_ADMIN_CARTELERA_V5`.

## Cambios incluidos

- El fondo del carrusel usa color y profundidad; se eliminó el círculo blanco decorativo.
- Administración permite arrastrar y ampliar una imagen antes de guardarla.
- El póster se recorta a proporción 2:3 y el banner a 16:7.
- Los enlaces válidos de YouTube abren un modal dentro de Inicio.
- El modal del tráiler contiene únicamente el video y **Comprar boletos**.
- Los botones públicos de compra llevan a `pages/cuenta/crear.html` y conservan la película, fecha y hora elegidas.
- El formulario de cliente valida los campos visualmente, pero no guarda datos personales.

## Prueba rápida

1. Abre `pages/gestion/` y edita o crea una película.
2. Selecciona una imagen horizontal, arrástrala, ajusta el zoom y aplica el encuadre.
3. Pega la dirección completa de un video de YouTube y guarda.
4. Actualiza Inicio y presiona **Ver tráiler**.
5. Presiona **Comprar boletos** y comprueba que abra el formulario de cuenta.

La autenticación, el almacenamiento definitivo, los permisos y la verificación por correo corresponden al backend.
