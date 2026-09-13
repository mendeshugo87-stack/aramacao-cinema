# Propuesta: butacas fuera de servicio (Sala 1)

> **Estado: PROPUESTA. Estas rutas todavía no existen en Django.**
> El frontend ya está construido y funcionando con datos locales. Solo falta
> que el equipo de backend confirme (o corrija) la forma de estas dos rutas
> para conectarlo. Nada de este documento describe algo ya implementado.

## Para qué

El administrador necesita poder marcar una butaca rota para que deje de
venderse, tanto en Compra en línea como en Taquilla.

Hoy la Sala 1 está fija: 8 filas (A–H) × 14 butacas = 112 asientos, y no hay
forma de sacar ninguna de circulación.

## Por qué es de la sala y no de la función

Una butaca rota es un daño **físico**. Si F7 está quebrada, lo está para todas
las funciones hasta que alguien la repare. Por eso no se guarda dentro de la
película ni de la función: si fuera así, el administrador tendría que marcar la
misma butaca una y otra vez, y se le olvidaría al crear una película nueva.

## Rutas propuestas

### 1. Consultar el estado de la sala

```
GET /api/sala/asientos/
```

Respuesta:

```json
{
  "sala": "Sala 1",
  "aforo_fisico": 112,
  "aforo_disponible": 110,
  "asientos_fuera_de_servicio": [
    { "codigo": "F7", "motivo": "Respaldo quebrado", "marcado_en": "2026-09-13T14:20:00-06:00" },
    { "codigo": "G5", "motivo": "Tapicería rasgada", "marcado_en": "2026-09-13T14:22:00-06:00" }
  ]
}
```

- `aforo_fisico` no cambia nunca: son las butacas que existen en la sala.
- `aforo_disponible` = `aforo_fisico` − butacas fuera de servicio.

Se mantienen separados a propósito, para que los informes históricos no se
muevan cuando se rompe o se repara una butaca.

### 2. Marcar o habilitar una butaca

```
PATCH /api/sala/asientos/{codigo}/
```

Cuerpo:

```json
{ "fuera_de_servicio": true, "motivo": "Respaldo quebrado" }
```

Para volver a habilitarla:

```json
{ "fuera_de_servicio": false, "motivo": "" }
```

Respuesta:

```json
{
  "asiento": { "codigo": "F7", "fuera_de_servicio": true, "motivo": "Respaldo quebrado" },
  "funciones_afectadas": 2
}
```

`funciones_afectadas` es **cuántas funciones futuras ya tienen ese asiento
vendido**. El frontend lo muestra como aviso al administrador. Si el backend
prefiere no calcularlo, puede devolver `0` y el aviso simplemente no aparece.

### 3. Añadir el dato a la disponibilidad

La ruta que ya existe:

```
GET /api/asiento/disponibilidad/{funcion_id}/
```

debería incluir un campo más, junto a los que ya devuelve:

```json
{
  "asientos_bloqueados_temporalmente": ["B8", "B9"],
  "asientos_reservados": ["C1", "C2"],
  "asientos_ocupados": ["D1"],
  "asientos_fuera_de_servicio": ["F7", "G5"]
}
```

Con eso, Compra y Taquilla lo pintan solas. **Este es el único cambio
imprescindible** para que la función se vea en las pantallas de venta; las dos
rutas anteriores son para que el administrador pueda editarlo.

## Reglas que el backend debe hacer cumplir

1. **No se puede bloquear ni vender un asiento fuera de servicio.**
   `POST /api/asiento/bloquear/` debe rechazarlo con `409`.

2. **Marcar una butaca NO invalida boletos ya vendidos.**
   Quien ya pagó conserva su boleto. La butaca solo deja de ofrecerse en ventas
   nuevas. Por eso se devuelve `funciones_afectadas`: para que alguien reubique
   a esos clientes antes de la función.

3. **El motivo es obligatorio** (el frontend exige mínimo 5 caracteres) y
   conviene guardarlo en la auditoría junto con el empleado que lo marcó.

4. **Permiso.** Debería exigir un permiso de administración, por ejemplo
   `sala.administrar`. Hoy el frontend no lo comprueba porque no existe.

## Preguntas abiertas

1. ¿`aforo_fisico` / `aforo_disponible` son los nombres que prefieren, o el
   backend ya tiene otros para lo mismo?
2. ¿Quieren guardar un histórico de reparaciones (cuándo se rompió y cuándo se
   arregló), o basta con el estado actual?
3. ¿El código de butaca viaja como texto (`"F7"`) o como fila + número
   separados? El frontend usa texto en todas las pantallas.

## Dónde está el código del frontend

| Archivo | Qué hace |
|---|---|
| `Frontend/assets/js/administracion/sala-api.js` | Las dos rutas de arriba. La rama de demostración se borra al conectar Django. |
| `Frontend/assets/js/administracion/administracion-sala.js` | El panel "Sala" del administrador. |
| `Frontend/assets/js/compartido/seat-api.js` | Añade `asientos_fuera_de_servicio` a la disponibilidad. |
| `Frontend/assets/css/styles.css` | El color del estado, compartido por Compra y Taquilla. |
