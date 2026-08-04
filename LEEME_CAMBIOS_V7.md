# Aramacao Cinema — Flujo público P3 V7

Esta versión continúa sobre la V6 y conserva Inicio, Administración, Personal, Taquilla y el recorte de imágenes.

## Páginas públicas nuevas

- `Frontend/pages/cartelera/index.html`
- `Frontend/pages/proximamente/index.html`
- `Frontend/pages/dulceria/index.html`
- `Frontend/pages/servicios/index.html`
- `Frontend/pages/contacto/index.html`
- `Frontend/pages/cuenta/iniciar-sesion.html`
- `Frontend/pages/cuenta/recuperar.html`

El formulario existente de creación de cuenta quedó enlazado con Inicio de sesión y Recuperar contraseña.

## Flujo de compra preparado

1. El cliente selecciona **Comprar boletos**.
2. Llega a **Iniciar sesión**.
3. Si no tiene cuenta, puede ir a **Crear cuenta**.
4. Si no recuerda la contraseña, puede ir a **Recuperar contraseña**.
5. Película, fecha y horario se conservan en la dirección al pasar entre formularios.
6. Django validará la cuenta y enviará al cliente a función, asientos, pago y boleto.

## Importante

- Los formularios solamente hacen validaciones visuales.
- No guardan usuarios, contraseñas ni mensajes en el navegador.
- Cartelera y Próximamente leen la misma fuente de demostración que Inicio y Administración.
- Dulcería, Servicios y Contacto están listos visualmente; backend conectará sus datos reales.
- Taquilla continúa separada del sitio público.

## Prueba local

Desde la raíz del proyecto:

```powershell
python -m http.server 8000 --directory .\Frontend
```

Abre `http://localhost:8000/` y utiliza el menú principal.
