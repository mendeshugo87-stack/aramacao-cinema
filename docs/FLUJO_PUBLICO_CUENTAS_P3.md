# Flujo público de cuentas — guía para backend

## Rutas de frontend

- Registro: `/pages/cuenta/crear.html`
- Inicio de sesión: `/pages/cuenta/iniciar-sesion.html`
- Recuperación: `/pages/cuenta/recuperar.html`
- Paso protegido de compra: `/pages/comprar/`

## Parámetros conservados

Los enlaces de compra pueden incluir:

- `movie`: identificador de la película.
- `date`: fecha local en formato `YYYY-MM-DD`.
- `time`: horario seleccionado, cuando corresponda.

Estos parámetros orientan el regreso al flujo. El servidor siempre debe comprobar nuevamente que la película, función y asiento continúen disponibles.

## Responsabilidades del backend

- Validar correo y nombre de usuario duplicados.
- Almacenar contraseñas mediante el sistema seguro de Django.
- Verificar el correo mediante código con vencimiento.
- Crear sesiones seguras y proteger las rutas de compra.
- Aplicar límite de intentos a inicio de sesión y recuperación.
- Devolver una respuesta neutra en recuperación para no revelar si una cuenta existe.
- No confiar en validaciones, roles ni parámetros enviados únicamente por JavaScript.
- Después de autenticar, continuar con función, asientos, pago y boleto digital.

## Separación de acceso

Las cuentas de clientes no permiten abrir Taquilla ni Administración. Los empleados y administradores usan autenticación y permisos independientes.
