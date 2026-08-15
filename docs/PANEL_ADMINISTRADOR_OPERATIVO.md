# Panel del administrador operativo

## Objetivo

Permitir que un administrador autorizado cambie la información que utilizan el sitio público y Taquilla, sin entrar al panel técnico del superadministrador.

## Funciones preparadas en el frontend

- Inicio de sesión separado para administración.
- Resumen de películas en cartelera, próximos estrenos, carrusel y funciones.
- Creación y edición de películas.
- Publicación o retiro de una película sin eliminar su historial.
- Selección independiente de **Cartelera**, **Próximamente** y **Carrusel destacado**.
- Póster vertical con encuadre 2:3 y fondo horizontal nítido con encuadre 16:7 para Inicio.
- Enlace de un video específico de YouTube para reproducir el tráiler dentro del sitio.
- Fechas de estreno, duración, clasificación, géneros, idioma, dirección y reparto.
- Funciones por fecha exacta, hora visible en formato de 12 horas, formato 2D o 3D y precio.
- Sala única `Sala 1`, fija y no editable por el administrador.
- Configuración completa del 2x1: películas, periodo, lunes/martes/miércoles y todas las funciones o funciones específicas.
- Acceso al formulario de creación de vendedores.

## Comportamiento de la maqueta

La maqueta usa `IndexedDB` únicamente para comprobar en un mismo navegador que los cambios de Administración aparecen en Inicio y Taquilla. Esto no representa la base de datos final y no debe utilizarse para cuentas, contraseñas, ventas, pagos ni asientos.

La versión anterior repetía horarios por día de la semana y permitía varias salas. Al abrir esta versión se conservan las películas e imágenes locales, pero esas filas antiguas se descartan para que el administrador agregue funciones con fecha exacta. Los datos incluidos de fábrica ya usan la única Sala 1.

Al integrar Django, `Frontend/assets/js/cinema-store.js` deberá sustituirse por solicitudes a la API. El backend decidirá las tablas, campos, relaciones y almacenamiento de archivos.

## Validaciones obligatorias de backend

- Exigir sesión activa y rol de administrador operativo en todas las rutas y operaciones.
- Volver a validar todos los datos recibidos, aunque el navegador ya los haya revisado.
- Validar tipo, tamaño y seguridad de imágenes.
- Guardar la imagen recortada o la imagen original con sus coordenadas de encuadre, según la solución que elija backend.
- Validar que el enlace del tráiler corresponda a un video permitido antes de publicarlo.
- Evitar cruces de horario en la única Sala 1, considerando la duración de cada película.
- Interpretar y devolver las fechas y horas con la zona `America/Tegucigalpa`.
- Conservar historial de películas y funciones que ya tengan ventas.
- Registrar usuario, fecha y acción realizada.
- Sincronizar los cambios con web pública, Taquilla y compra en línea.
- Impedir que un administrador operativo acceda a la administración técnica del sistema.

## Regla obligatoria de la promoción 2x1

- Solo el administrador operativo puede configurar, activar o desactivar la promoción.
- El vendedor no decide si se aplica y no dispone de interruptores para modificarla.
- Taquilla y la compra en línea reciben del backend el resultado para la función seleccionada y muestran la promoción automáticamente.
- El backend valida nuevamente película, función, fecha, día y vigencia al confirmar la venta.
- Por cada dos admisiones se cobra una, pero se generan dos accesos y ambos asientos reducen el aforo.

## Estado del flujo público

El frontend visual ya incluye:

1. Cartelera y Próximamente como páginas independientes.
2. Dulcería, Servicios y Contacto.
3. Crear cuenta, iniciar sesión y recuperar contraseña.
Queda pendiente para los siguientes módulos de backend:

1. Selección y bloqueo temporal de asientos por función.
2. Confirmación de ventas y pagos en línea o en Taquilla.
3. Emisión de comprobantes, boletos individuales con QR, escaneo y reemisión.

El botón **Comprar boletos** lleva al formulario de cuenta conservando la película, fecha y horario elegidos. Cuando exista backend, si el cliente ya tiene una sesión válida podrá pasar directamente a la compra; si no, deberá crear su cuenta o iniciar sesión y luego regresar al mismo paso.
