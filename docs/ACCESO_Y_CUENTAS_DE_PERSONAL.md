# Acceso y cuentas de personal

Estado del frontend:

- Acceso separado para vendedor, Control de entrada y administrador operativo.
- Comprobación de sesión preparada en Gestión, Personal, Taquilla y Control de entrada.
- Listado, creación, edición, activación y desactivación de personal operativo.
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

## Separación operativa

- `VENDEDOR_TAQUILLA` usa `/pages/taquilla/` para vender e imprimir. Con `clientes.buscar_para_recuperacion` y `boletos.recuperar_cliente` también puede reemplazar el QR perdido después de verificar el documento físico; no accede al historial administrativo global.
- `CONTROL_ACCESO` usa `/pages/control-entrada/` con `boletos.escanear`.
- `ADMINISTRADOR_OPERATIVO` usa `/pages/gestion/ventas.html` con permisos separados para consultar, reimprimir, reemitir, anular y reembolsar.
- Taquilla no escanea y Control de entrada no vende ni cobra.
- Django debe compartir boletos y estados en la misma base de datos para sincronizar computadoras, teléfonos y tabletas.
