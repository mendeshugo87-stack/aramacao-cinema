# Acceso y cuentas de personal

Estado del frontend:

- Acceso separado para vendedor y administrador operativo.
- Comprobación de sesión preparada en Gestión, Personal y Taquilla.
- Listado, creación, edición, activación y desactivación de vendedores.
- Asignación de contraseña temporal.
- Cambio obligatorio de contraseña en el primer ingreso.
- Cierre de sesión preparado.

Contrato simple para backend:

```text
docs/json/00-orden-endpoints.json
docs/json/01-acceso-empleados.json
docs/json/02-administracion-empleados.json
docs/json/03-proteccion-areas-privadas.json
```

La prueba local no crea cuentas reales ni guarda contraseñas. Django debe validar, autorizar, cifrar y registrar todas las operaciones.
