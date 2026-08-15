# API de acceso y empleados

Para evitar documentación repetida, el contrato que debe seguir backend está resumido en JSON y en español:

```text
docs/json/00-orden-endpoints.json
docs/json/01-acceso-empleados.json
docs/json/02-administracion-empleados.json
docs/json/03-proteccion-areas-privadas.json
```

Los JSON indican el orden, rutas, métodos, campos, respuestas, permisos y reglas principales. Los archivos de ejemplo dentro de `docs/json/acceso-empleados/` siguen disponibles como muestras separadas.

La seguridad real corresponde a Django: sesión por cookie segura, CSRF, contraseñas cifradas y autorización en cada solicitud. `staff-private.js` solamente prepara el comportamiento visual del frontend.
