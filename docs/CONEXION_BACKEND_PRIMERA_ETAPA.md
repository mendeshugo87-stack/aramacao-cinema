# Conexión con backend

El orden oficial de implementación está definido en `docs/json/00-orden-endpoints.json`.

## Orden de integración

Backend debe trabajar los módulos en este orden:

1. Acceso y sesión de empleados.
2. Administración de vendedores y protección de áreas privadas.
3. Cuentas, sesión, Mi cuenta e historial de clientes.
4. Películas, funciones y promoción 2x1.
5. Aforo, asientos y bloqueos por función.
6. Dulcería e inventario.
7. Carrito de compras.
8. Ventas, pagos y órdenes.
9. Boletos, historial, reemisión y QR.

Cada bloque debe probarse antes de comenzar el siguiente.

## Contratos preparados

Acceso y administración de empleados:

- `docs/json/01-acceso-empleados.json`
- `docs/json/02-administracion-empleados.json`
- `docs/json/03-proteccion-areas-privadas.json`

Cuentas de clientes:

- `docs/json/cuentas-clientes/01-autenticacion-clientes.json`
- `docs/json/cuentas-clientes/02-mi-cuenta-clientes.json`
- `docs/json/cuentas-clientes/03-historial-compras-clientes.json`
- `docs/json/cuentas-clientes/04-consulta-taquilla-clientes-futuro.json`

Películas, funciones y promoción 2x1:

- `docs/API_CARTELERA_FUNCIONES_PROMOCIONES.md`
- `docs/json/04-siguientes-endpoints.json`
- `docs/json/cartelera/`

## Reglas de integración

- Django será la fuente oficial de usuarios, permisos, películas, funciones, precios y promociones.
- El navegador nunca asigna roles ni decide permisos.
- Los datos locales del frontend sirven únicamente para demostración y deben sustituirse gradualmente por respuestas de la API.
- No deben mezclarse asientos, pagos o códigos QR con un bloque anterior que todavía no haya superado sus pruebas.
- Los contratos describen rutas, campos y respuestas; no obligan al backend a utilizar modelos o tablas específicos.

Django conserva libertad para organizar sus aplicaciones, modelos y almacenamiento interno, siempre que respete el contrato acordado con el frontend.
