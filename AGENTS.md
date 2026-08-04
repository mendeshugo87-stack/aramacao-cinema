# AGENTS.md — Aramacao Cinema

## 1. Estado oficial del proyecto

El cliente eligió la Propuesta 3 como diseño definitivo de Aramacao Cinema.

El diseño tendrá algunos cambios visuales, pero conservará su identidad:

- estilo cinematográfico;
- fondos oscuros;
- azul oscuro;
- rojo;
- amarillo inspirado en el logotipo;
- diseño profesional y adaptable.

La carpeta definitiva del proyecto es:

C:\aramacao

La carpeta anterior con las tres propuestas es:

C:\Users\HP ELITEBOOK\Desktop\aramacao-cinema

La carpeta anterior se utilizará únicamente como referencia.

No modificar, eliminar, reorganizar ni sobrescribir archivos dentro de la
carpeta anterior.

---

## 2. Objetivo

Crear desde cero una plataforma limpia y preparada para integración con
backend Django.

El sistema tendrá interfaces separadas:

1. Sitio público para clientes.
2. Página de taquilla para venta física.
3. Panel del administrador operativo.
4. Administración técnica para el superadministrador.

Todas las interfaces deberán utilizar el mismo backend y la misma base de
datos.

---

## 3. Responsabilidades

### Frontend

Responsabilidad de Hugo:

- diseño visual;
- HTML;
- CSS;
- JavaScript;
- plantillas Django;
- componentes reutilizables;
- diseño responsive;
- estados de carga, error y éxito;
- página pública;
- interfaz de taquilla;
- panel administrativo visual;
- selección de asientos;
- resumen de compra;
- boleto y recibo visual.

### Backend

Responsabilidad del ingeniero backend:

- modelos;
- base de datos;
- migraciones;
- autenticación;
- permisos;
- consultas;
- servicios;
- transacciones;
- bloqueo de asientos;
- ventas;
- pagos;
- códigos QR;
- correos;
- reportes;
- seguridad.

No crear ni modificar modelos del backend sin coordinación.

---

## 4. Primera etapa

Se comenzará en paralelo con:

### Página pública

- Inicio.
- Cartelera.
- Detalle de película.
- Próximamente.
- Dulcería.
- Servicios.
- Contacto.
- Cuentas de clientes.

### Taquilla

- Inicio de sesión.
- Panel principal.
- Selección de película.
- Selección de función.
- Mapa de asientos.
- Aplicación de promoción 2x1.
- Resumen de venta.
- Cobro.
- Recibo imprimible.

La primera pantalla que se desarrollará será la página de Inicio pública.

---

## 5. Contenido de Inicio

La página de Inicio debe incluir:

- encabezado;
- logotipo;
- navegación;
- carrusel de películas destacadas;
- películas actualmente en cartelera;
- horarios principales;
- próximos estrenos;
- promoción 2x1;
- acceso a dulcería;
- servicios;
- contacto;
- pie de página.

La información de películas debe contemplar:

- título;
- descripción breve;
- duración;
- clasificación;
- género;
- idioma;
- póster;
- banner;
- tráiler;
- estado;
- horarios.

Inicialmente se podrán utilizar datos demostrativos claramente identificados.

Después, el backend reemplazará esos datos por consultas a la base de datos.

---

## 6. Promoción 2x1

La página debe permitir mostrar una promoción configurable:

- lunes;
- martes;
- miércoles;
- activa o desactivada;
- aplicable a películas u horarios autorizados.

El administrador operativo controlará si la promoción está habilitada.

En taquilla:

- se seleccionan dos asientos;
- se generan dos boletos;
- se cobra uno;
- se registra el descuento;
- se registra el vendedor que aplicó la promoción.

---

## 7. Arquitectura del frontend

Usar una estructura limpia y reutilizable.

Separar:

- plantillas;
- CSS;
- JavaScript;
- imágenes;
- componentes compartidos.

No colocar grandes bloques de CSS dentro de los archivos HTML.

No duplicar encabezados, pies de página, tarjetas, botones ni modales.

Usar plantillas parciales para componentes repetidos.

Usar nombres de clases claros y consistentes.

No reutilizar las clases temporales de las maquetas sin revisarlas.

---

## 8. Preparación para backend

Las plantillas deberán estar preparadas para recibir contextos como:

- featured_movies;
- current_movies;
- upcoming_movies;
- screenings;
- active_promotions;
- candy_products;
- services.

No escribir permanentemente la cartelera final dentro del HTML.

Los datos demostrativos deben poder reemplazarse fácilmente por información
proveniente de Django.

Conservar atributos data-* necesarios para JavaScript.

---

## 9. Base de datos y migraciones

No ejecutar migraciones iniciales hasta que el ingeniero backend confirme:

- usuario personalizado;
- configuración de PostgreSQL;
- aplicaciones definitivas;
- modelos iniciales.

No ejecutar:

- python manage.py migrate;
- python manage.py makemigrations;

sin autorización.

Se permite ejecutar:

- python manage.py check;
- pruebas que no modifiquen la base de datos definitiva.

---

## 10. Git y GitHub

No trabajar directamente en main.

Ramas previstas:

- main;
- develop;
- frontend/inicio;
- frontend/taquilla;
- backend/modelos;
- backend/autenticacion;
- backend/ventas.

No ejecutar sin autorización:

- git push;
- git merge;
- git rebase;
- git reset --hard;
- git clean;
- eliminación de ramas.

Antes de modificar:

- comprobar la ruta;
- comprobar la rama;
- revisar git status;
- presentar un plan breve.

Después de modificar:

- mostrar archivos modificados;
- mostrar git diff;
- ejecutar QA;
- informar resultados.

---

## 11. Seguridad

Nunca guardar ni subir:

- .env;
- contraseñas;
- tokens;
- claves privadas;
- credenciales;
- datos de tarjetas;
- bases de datos con información real;
- entorno virtual;
- archivos temporales.

---

## 12. Reglas para Codex

Antes de hacer cambios:

1. Leer este archivo.
2. Confirmar que la ruta es C:\aramacao.
3. Explicar qué archivos serán creados o modificados.
4. Esperar autorización para cambios amplios.

Durante el trabajo:

- modificar únicamente lo necesario;
- no acceder a carpetas no autorizadas;
- no modificar el proyecto antiguo;
- no copiar las tres propuestas;
- usar la Propuesta 3 solamente como referencia;
- mantener código legible;
- evitar duplicaciones;
- no inventar información del backend.

Al finalizar:

1. Enumerar archivos creados o modificados.
2. Explicar los cambios.
3. Ejecutar las comprobaciones autorizadas.
4. Informar errores y pendientes.
5. No hacer commit ni push automáticamente.