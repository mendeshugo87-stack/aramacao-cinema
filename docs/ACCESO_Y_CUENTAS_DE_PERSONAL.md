# Acceso y creación de cuentas de personal

## Separación de usuarios

- El sitio público no muestra enlaces hacia Taquilla ni Administración.
- El cliente continúa su compra por la ruta pública de compra en línea.
- El vendedor entra desde una dirección privada de acceso para empleados.
- La cuenta del vendedor la crea un administrador autorizado; el empleado no puede registrarse por sí mismo.

## Validaciones que debe realizar backend al crear una cuenta

1. Confirmar que quien realiza la operación tiene permiso para gestionar personal.
2. Validar nuevamente nombre, usuario, correo, teléfono y contraseña.
3. Comprobar que el nombre de usuario y el correo no estén registrados.
4. Cifrar la contraseña; nunca guardarla ni devolverla en texto visible.
5. Asignar el rol de vendedor desde el servidor, sin confiar en valores enviados por el navegador.
6. Guardar si la cuenta está activa y si debe cambiar contraseña en su primer acceso.
7. Registrar qué administrador creó, activó, desactivó o modificó la cuenta.

## Validaciones al iniciar sesión

1. Comprobar usuario y contraseña.
2. Rechazar cuentas inactivas.
3. Comprobar el rol y los permisos en cada solicitud protegida.
4. Permitir al vendedor entrar únicamente a Taquilla.
5. Crear una sesión segura y permitir cerrar sesión.
6. No depender de que la ruta esté oculta: el backend debe rechazar cualquier acceso no autorizado.

## Archivos preparados

- `Frontend/pages/empleados/login.html`: inicio de sesión del vendedor.
- `Frontend/pages/gestion/personal.html`: creación de cuentas desde administración.
- `Frontend/pages/taquilla/index.html`: pantalla privada de venta física.
- `Frontend/pages/comprar/index.html`: ruta pública separada para el futuro flujo de compra en línea.
- `Frontend/assets/js/empleados-login.js`: validación visual del acceso, sin autenticar ni guardar credenciales.
- `Frontend/assets/js/personal-admin.js`: validación visual del formulario, sin crear usuarios ni almacenar datos.

Los comentarios `BACKEND` dentro del código indican los puntos de conexión. La elección de modelos, tablas, endpoints y librerías queda a criterio del ingeniero backend.
