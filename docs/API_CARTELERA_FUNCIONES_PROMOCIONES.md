# Contrato API — cartelera, funciones y promoción 2x1

**Versión:** 2.0
**Zona horaria:** `America/Tegucigalpa`
**Sala disponible:** `Sala 1`

Este contrato define el intercambio entre Administración, el sitio público y Taquilla. Los nombres propios de Aramacao se escriben en español y sin tildes dentro de JSON. Las palabras de protocolo como `GET`, `POST`, `PATCH`, `DELETE`, `HTTP` y `JSON` conservan su forma estándar.

## 1. Reglas generales

- El backend es la fuente oficial de películas, funciones, precios, promociones y disponibilidad de venta.
- Géneros, actores y directores son catálogos administrables. El frontend envía sus identificadores al guardar una película y no crea registros duplicados como texto libre.
- El administrador operativo puede crear y modificar contenido; el vendedor de Taquilla solo consulta la cartelera y registra ventas.
- Aramacao tiene una sola sala. El frontend no envía una sala elegida por el administrador: el backend asigna `Sala 1`.
- Una función pertenece a una película y tiene fecha exacta, hora, formato `2D` o `3D` y precio.
- Fechas: `YYYY-MM-DD`.
- Administración escribe manualmente una hora obligatoria en formato de 12 horas, por ejemplo `2:00 p. m.`. El frontend la normaliza y el API recibe `HH:MM` en formato de 24 horas, por ejemplo `14:00`.
- Fechas y horas completas devueltas por backend incluyen el desplazamiento `-06:00`.
- El backend impide cruces en la Sala 1 tomando en cuenta la duración de la película. Administración decide la hora de la siguiente función y deja el margen operativo necesario para limpieza y preparación.
- Las imágenes se guardan en almacenamiento de archivos; no se guardan como texto base64 en la base de datos final.
- La credencial de TMDB nunca se expone en HTML, JavaScript, JSON público ni GitHub.

## 2. Endpoints públicos

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/v1/cartelera/peliculas/` | Películas publicadas en cartelera y próximos estrenos. |
| `GET` | `/api/v1/cartelera/peliculas/{id}/` | Ficha pública de una película. |
| `GET` | `/api/v1/cartelera/funciones/?fecha=2026-08-10` | Funciones publicadas para una fecha. |
| `GET` | `/api/v1/cartelera/peliculas/{id}/funciones/?fecha=2026-08-10` | Funciones de una película para una fecha. |
| `GET` | `/api/v1/cartelera/promociones/activas/?fecha=2026-08-10` | Promociones visibles y funciones participantes. |

## 3. Endpoints de Administración

Todos requieren sesión con rol `ADMINISTRADOR_OPERATIVO` y permiso específico.

### 3.1 Catálogos

Los tres catálogos usan la misma forma de trabajo: listar, crear, consultar, editar y activar/desactivar. Un cambio de estado se mantiene separado de la edición para que el backend pueda asignar permisos y auditoría específicos.

| Recurso | Listar y crear | Consultar y editar | Cambiar estado |
|---|---|---|---|
| Géneros | `/api/v1/administracion/generos/` | `/api/v1/administracion/generos/{id}/` | `/api/v1/administracion/generos/{id}/estado/` |
| Actores | `/api/v1/administracion/actores/` | `/api/v1/administracion/actores/{id}/` | `/api/v1/administracion/actores/{id}/estado/` |
| Directores | `/api/v1/administracion/directores/` | `/api/v1/administracion/directores/{id}/` | `/api/v1/administracion/directores/{id}/estado/` |

- `GET` lista y permite `?buscar=texto&activo=true|false`.
- `POST` crea un registro.
- `GET /{id}/` consulta un registro.
- `PATCH /{id}/` modifica sus datos.
- `PATCH /{id}/estado/` recibe `{ "activo": false }` o `{ "activo": true }`.
- El backend debe impedir nombres duplicados sin distinguir mayúsculas, minúsculas ni espacios laterales.

Ejemplo mínimo de catálogo:

```json
{
  "id": "genero-id-1",
  "nombre": "Aventura",
  "activo": true
}
```

Actores y directores pueden agregar `biografia_breve` y `foto_url` como campos opcionales. No son obligatorios para la primera conexión del frontend.

### 3.2 Películas, imágenes, funciones y promoción

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/v1/administracion/peliculas/` | Listar películas activas y retiradas. |
| `POST` | `/api/v1/administracion/peliculas/` | Crear una película. |
| `GET` | `/api/v1/administracion/peliculas/{id}/` | Consultar una película. |
| `PATCH` | `/api/v1/administracion/peliculas/{id}/` | Actualizar datos o publicación. |
| `PATCH` | `/api/v1/administracion/peliculas/{id}/estado/` | Activar, retirar o cambiar publicación. |
| `POST` | `/api/v1/administracion/peliculas/{id}/imagenes/` | Subir o reemplazar póster y fondo. |
| `POST` | `/api/v1/administracion/peliculas/{id}/funciones/` | Crear una función. |
| `GET` | `/api/v1/administracion/funciones/{id}/` | Consultar una función. |
| `PATCH` | `/api/v1/administracion/funciones/{id}/` | Actualizar una función. |
| `DELETE` | `/api/v1/administracion/funciones/{id}/` | Retirar una función sin ventas. |
| `GET` | `/api/v1/administracion/promociones/2x1/` | Consultar la configuración actual. |
| `PUT` | `/api/v1/administracion/promociones/2x1/` | Guardar la configuración completa. |

Si una película o función ya tiene ventas, no se elimina físicamente. El backend la retira de publicación y conserva el historial.

## 4. Película

La petición usa identificadores de catálogos:

```json
{
  "titulo": "Horizonte Perdido",
  "descripcion_breve": "Una expedición cruza los límites de lo conocido.",
  "sinopsis": "Descripción completa de la película.",
  "duracion_minutos": 118,
  "clasificacion": "B",
  "generos_ids": ["genero-id-1"],
  "idioma": "Doblada al español",
  "director_id": "director-id-1",
  "actores_ids": ["actor-id-1", "actor-id-2"],
  "seccion": "CARTELERA",
  "publicada": true,
  "destacada_inicio": true,
  "fecha_estreno": "2026-08-27",
  "trailer_url": "https://www.youtube.com/watch?v=video",
  "visibilidad_fondo_porcentaje": 65
}
```

La respuesta devuelve resúmenes de los catálogos para evitar consultas adicionales:

```json
{
  "id": "8d69005e-4044-4651-b7b6-67df80253e1a",
  "titulo": "Horizonte Perdido",
  "descripcion_breve": "Una expedición cruza los límites de lo conocido.",
  "sinopsis": "Descripción completa de la película.",
  "duracion_minutos": 118,
  "clasificacion": "B",
  "generos": [
    {"id": "genero-id-1", "nombre": "Aventura"},
    {"id": "genero-id-2", "nombre": "Ciencia ficcion"}
  ],
  "idioma": "Doblada al español",
  "director": {"id": "director-id-1", "nombre": "Nombre del director"},
  "actores": [
    {"id": "actor-id-1", "nombre": "Actor 1"},
    {"id": "actor-id-2", "nombre": "Actor 2"}
  ],
  "seccion": "CARTELERA",
  "publicada": true,
  "activa": true,
  "destacada_inicio": true,
  "fecha_estreno": "2026-08-06",
  "trailer_url": "https://www.youtube.com/watch?v=video",
  "poster_url": "https://archivos.example/poster.webp",
  "fondo_inicio_url": "https://archivos.example/fondo.webp",
  "visibilidad_fondo_porcentaje": 65
}
```

Valores permitidos para `seccion`:

- `CARTELERA`
- `PROXIMAMENTE`
- `RETIRADA`

Recomendaciones de imágenes:

- Póster: proporción `2:3`, mínimo `1000 × 1500 px`.
- Fondo de Inicio: proporción `16:7`, mínimo `1920 × 840 px`, ideal `2560 × 1120 px`.
- `visibilidad_fondo_porcentaje`: entero entre `35` y `85`; permite que Administración previsualice y elija cuánto se ve la imagen detrás del texto.
- Formatos: JPG, PNG o WebP.
- El backend valida tipo real, peso y dimensiones antes de publicar.

### 4.1 Carga de imágenes

Las imágenes se envían después de crear la película:

```http
POST /api/v1/administracion/peliculas/{id}/imagenes/
Content-Type: multipart/form-data
```

Campos admitidos:

| Campo | Uso |
|---|---|
| `poster` | Archivo JPG, PNG o WebP opcional. |
| `fondo_inicio` | Archivo JPG, PNG o WebP opcional. |
| `poster_encuadre` | JSON opcional con `x`, `y`, `zoom` y proporción `2:3`. |
| `fondo_encuadre` | JSON opcional con `x`, `y`, `zoom` y proporción `16:7`. |
| `visibilidad_fondo_porcentaje` | Entero entre 35 y 85. |

El backend puede guardar el archivo ya recortado o conservar el original y el encuadre. Esa decisión es interna; la respuesta que necesita el frontend es:

```json
{
  "poster_url": "https://archivos.example/poster.webp",
  "fondo_inicio_url": "https://archivos.example/fondo.webp",
  "visibilidad_fondo_porcentaje": 65
}
```

Las URLs pueden ser públicas o firmadas según el proveedor elegido. Nunca deben devolverse datos base64 como almacenamiento definitivo.

## 5. Crear una función

Petición:

```http
POST /api/v1/administracion/peliculas/8d69005e-4044-4651-b7b6-67df80253e1a/funciones/
Content-Type: application/json
```

```json
{
  "fecha": "2026-08-10",
  "hora": "14:00",
  "formato": "2D",
  "precio": "120.00"
}
```

Respuesta `201 Created`:

```json
{
  "id": "b9c097fd-44ed-46f8-b87e-6722b9f74c58",
  "pelicula_id": "8d69005e-4044-4651-b7b6-67df80253e1a",
  "fecha": "2026-08-10",
  "hora": "14:00",
  "hora_inicio": "2026-08-10T14:00:00-06:00",
  "venta_hasta": "2026-08-10T14:20:00-06:00",
  "venta_disponible": true,
  "motivo_cierre": null,
  "sala": "Sala 1",
  "formato": "2D",
  "precio": "120.00"
}
```

El backend no acepta `sala` desde este formulario. La asigna como `Sala 1`.

## 6. Regla de cierre de ventas

La venta en línea y en Taquilla permanece disponible hasta 20 minutos después de `hora_inicio`.

Al llegar a `venta_hasta`, el backend debe:

- rechazar nuevas compras y ventas;
- rechazar confirmaciones iniciadas antes pero recibidas fuera del límite;
- liberar bloqueos temporales no pagados;
- mantener disponibles los boletos pagados para consulta, impresión y escaneo.

Código recomendado cuando la función ya cerró:

```json
{
  "codigo": "VENTA_CERRADA_20_MIN",
  "mensaje": "Venta cerrada para esta función.",
  "errores": null
}
```

## 7. Configuración de la promoción 2x1

Solo Administración puede guardar esta configuración. La compra en línea y Taquilla reciben el resultado calculado por el backend; ninguno de esos canales decide si la promoción aplica.

```json
{
  "activa": true,
  "peliculas_ids": [
    "8d69005e-4044-4651-b7b6-67df80253e1a"
  ],
  "fecha_inicial": "2026-08-10",
  "fecha_final": "2026-08-26",
  "dias_semana": ["LUNES", "MARTES", "MIERCOLES"],
  "aplica_en": "FUNCIONES_ESPECIFICAS",
  "funciones_ids": [
    "b9c097fd-44ed-46f8-b87e-6722b9f74c58"
  ],
  "condiciones_visibles": "Por cada dos admisiones se cobra una en las funciones seleccionadas."
}
```

Valores permitidos para `aplica_en`:

- `TODAS_LAS_FUNCIONES`
- `FUNCIONES_ESPECIFICAS`

El backend debe validar:

1. que exista al menos una película;
2. que el periodo sea válido;
3. que los días sean únicamente lunes, martes y/o miércoles;
4. que las funciones específicas pertenezcan a las películas y al periodo seleccionado;
5. que la promoción esté activa al momento de confirmar la venta;
6. que por cada dos accesos se cobre uno y se generen dos boletos individuales;
7. que ambos asientos reduzcan el aforo;
8. que el precio normal, descuento y total queden registrados en la venta.

## 8. Respuesta para compra en línea y Taquilla

Al consultar una función desde la compra en línea o desde Taquilla, el backend debe devolver el resultado ya calculado:

```json
{
  "funcion_id": "b9c097fd-44ed-46f8-b87e-6722b9f74c58",
  "promocion_2x1": {
    "aplica": true,
    "codigo": "2X1_LMM",
    "mensaje": "2x1 activo para esta función."
  }
}
```

En Taquilla, el vendedor únicamente informa esta condición. En la compra en línea, el cliente ve la promoción activa antes de confirmar.

Ninguno de los dos canales puede activar, desactivar ni forzar la promoción. El backend verifica que aplique y calcula el precio normal, el descuento y el total al confirmar la venta.

## 9. Errores comunes

```json
{
  "codigo": "CRUCE_HORARIO_SALA",
  "mensaje": "La Sala 1 ya tiene una función en ese horario.",
  "errores": {
    "hora": ["Selecciona una hora que no se cruce con otra función."]
  }
}
```

| Estado | Código | Uso |
|---:|---|---|
| `400` | `ERROR_VALIDACION` | Faltan campos o el formato es inválido. |
| `400` | `CRUCE_HORARIO_SALA` | La única sala está ocupada durante ese intervalo. |
| `400` | `IMAGEN_INVALIDA` | El tipo, peso, dimensiones o encuadre no es aceptado. |
| `400` | `PROMOCION_INVALIDA` | La configuración del 2x1 no cumple las reglas. |
| `401` | `AUTENTICACION_REQUERIDA` | No existe sesión válida. |
| `403` | `PERMISO_DENEGADO` | El empleado no puede realizar la operación. |
| `404` | `RECURSO_NO_ENCONTRADO` | No existe la película, función o promoción. |
| `409` | `NOMBRE_DUPLICADO` | Ya existe un género, actor o director con ese nombre. |
| `409` | `RECURSO_EN_USO` | El catálogo está relacionado con películas y debe conservar historial. |
| `409` | `FUNCION_CON_VENTAS` | No puede eliminarse una función con ventas. |
| `409` | `VENTA_CERRADA_20_MIN` | La confirmación llegó después del límite. |

## 10. Archivos de ejemplo

Los ejemplos JSON están en:

```text
docs/json/cartelera/
```

Son un contrato de intercambio, no una base de datos ni una API estática.

El contrato completo y directamente validable por el backend está en:

```text
docs/json/04-cartelera-catalogos-funciones-promociones.json
```

La colección para pruebas manuales está en:

```text
docs/postman/Aramacao-Cartelera-Catalogos-Funciones.postman_collection.json
```
