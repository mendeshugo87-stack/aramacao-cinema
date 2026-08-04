# Aramacao Cinema — primeras páginas

Este paquete contiene la primera versión funcional de:

- Página pública de Inicio.
- Ventanilla/Taquilla para venta física.
- Cartelera de demostración compartida por ambas páginas.
- Selección de película, fecha, función y asientos.
- Promoción opcional 2x1 de lunes a miércoles.
- Cálculo de efectivo y cambio.
- Generación e impresión de un recibo de prueba.

## 1. Instalación

El contenido del ZIP está preparado para copiarse dentro de:

```text
C:\aramacao
```

No elimina las imágenes que ya existen en `C:\aramacao\Frontend\assets\images`.
El paquete incluye únicamente un archivo de instrucciones dentro de esa carpeta.

Después de copiar, la estructura principal será:

```text
C:\aramacao\Frontend\
├── index.html
├── assets\
│   ├── css\
│   │   ├── styles.css
│   │   └── taquilla.css
│   ├── data\
│   │   └── cartelera.json
│   ├── images\
│   └── js\
│       ├── main.js
│       └── taquilla.js
└── pages\
    └── taquilla\
        └── index.html
```

## 2. Ejecutar el proyecto

Abre una terminal de PowerShell en `C:\aramacao` y ejecuta:

```powershell
python -m http.server 8000 --directory .\Frontend
```

Abre estas direcciones:

```text
Inicio:   http://localhost:8000/
Taquilla: http://localhost:8000/pages/taquilla/
```

Para detener el servidor, presiona `Ctrl + C`.

## 3. Prueba recomendada

1. En Inicio, cambia entre las fechas de la cartelera.
2. Presiona **Elegir función** en una película.
3. En Taquilla, selecciona una función y varios asientos.
4. Para probar 2x1, elige una fecha que sea lunes, martes o miércoles.
5. Activa **Aplicar promoción 2x1** y selecciona dos asientos.
6. El total debe cobrar una admisión por cada dos asientos seleccionados.
7. Escribe un monto de efectivo igual o mayor al total.
8. Confirma la venta y prueba **Imprimir recibo**.
9. Cierra el recibo y vuelve a la misma función: ningún asiento debe quedar reservado u ocupado en esta maqueta, porque esos estados serán responsabilidad del backend.

## Estados de los asientos

- Seleccionar un asiento no lo reserva.
- Después de confirmar el pago, backend debe mostrarlo como reservado.
- Después de escanear el boleto en la entrada, backend debe mostrarlo como ocupado.
- Esta versión de frontend no guarda ventas ni estados de asientos en el navegador.

## 4. Información importante

- Las películas y sus horarios son contenido de demostración, no la cartelera real.
- Las ventas se guardan temporalmente en el almacenamiento del navegador.
- El cuadro parecido a un QR en el recibo es solamente una representación visual.
- Los comentarios marcados como `BACKEND` explican dónde conectará Django.
- La validación definitiva de asientos, promociones, pagos y permisos debe hacerse en backend.

Consulta también `docs/CONEXION_BACKEND_PRIMERA_ETAPA.md`.
