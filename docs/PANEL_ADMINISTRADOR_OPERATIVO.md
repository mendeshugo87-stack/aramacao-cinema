# Panel del administrador operativo

## Objetivo

Permitir que un administrador autorizado cambie la información que utilizan el sitio público y Taquilla, sin entrar al panel técnico del superadministrador.

## Funciones preparadas en el frontend

- Inicio de sesión separado para administración.
- Resumen de películas en cartelera, próximos estrenos, carrusel y funciones.
- Creación y edición de películas.
- Publicación o retiro de una película sin eliminar su historial.
- Selección independiente de **Cartelera**, **Próximamente** y **Carrusel destacado**.
- Póster vertical con encuadre 2:3 e imagen horizontal con encuadre 16:7 para el carrusel.
- Enlace de un video específico de YouTube para reproducir el tráiler dentro del sitio.
- Fechas de estreno, duración, clasificación, géneros, idioma, dirección y reparto.
- Horarios por día de la semana, sala, formato y precio.
- Activación o desactivación de la promoción 2x1.
- Acceso al formulario de creación de vendedores.

## Comportamiento de la maqueta

La maqueta usa `IndexedDB` únicamente para comprobar en un mismo navegador que los cambios de Administración aparecen en Inicio y Taquilla. Esto no representa la base de datos final y no debe utilizarse para cuentas, contraseñas, ventas, pagos ni asientos.

Al integrar Django, `Frontend/assets/js/cinema-store.js` deberá sustituirse por solicitudes a la API. El backend decidirá las tablas, campos, relaciones y almacenamiento de archivos.

## Validaciones obligatorias de backend

- Exigir sesión activa y rol de administrador operativo en todas las rutas y operaciones.
- Volver a validar todos los datos recibidos, aunque el navegador ya los haya revisado.
- Validar tipo, tamaño y seguridad de imágenes.
- Guardar la imagen recortada o la imagen original con sus coordenadas de encuadre, según la solución que elija backend.
- Validar que el enlace del tráiler corresponda a un video permitido antes de publicarlo.
- Evitar cruces inválidos de sala y horario.
- Conservar historial de películas y funciones que ya tengan ventas.
- Registrar usuario, fecha y acción realizada.
- Sincronizar los cambios con web pública, Taquilla y compra en línea.
- Impedir que un administrador operativo acceda a la administración técnica del sistema.

## Flujo público que se construirá después

1. Cartelera y Próximamente como páginas independientes.
2. Dulcería, Servicios y Contacto.
3. Crear cuenta, iniciar sesión y recuperar contraseña.
4. Compra en línea: película, fecha, función, asientos, cuenta, pago y boleto.
5. Confirmación del pago, boleto con QR e historial de compras.

El botón **Comprar boletos** lleva al formulario de cuenta conservando la película, fecha y horario elegidos. Cuando exista backend, si el cliente ya tiene una sesión válida podrá pasar directamente a la compra; si no, deberá crear su cuenta o iniciar sesión y luego regresar al mismo paso.
