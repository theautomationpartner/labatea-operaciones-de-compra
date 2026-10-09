# Prompts de la IA

Acá están, en texto plano, las instrucciones que la app le manda a la IA (Claude). Se pueden leer y
editar con cualquier editor: la app las lee de estos archivos.

## Qué es cada archivo

| Archivo | Cuándo se usa | Qué es |
| --- | --- | --- |
| `lista-precios.sistema.txt` | ACTUALIZAR PRECIOS → "Cargar Excel", al soltar la lista del proveedor | Las instrucciones generales: rol, cómo emparejar los productos y qué devolver |
| `lista-precios.pedido.txt` | En ese mismo análisis | El pedido: va junto a los productos del Maestro y a la lista |

- **Sistema:** dice *cómo* trabajar.
- **Pedido:** va junto a los datos y dice *qué* hacer.

## Cómo editar sin romper nada

- **No cambies el nombre de los archivos.** La app los busca por nombre. Si uno falta o queda vacío,
  el análisis falla con el código `ERROR_PROMPT_IA` y el nombre del archivo.
- **Los nombres de los campos son fijos.** La respuesta de la IA tiene una forma fija (`productos`,
  `id`, `precioNuevo`, etc.), que está en el código (`api/_preciosIa.ts`). Podés cambiar las
  **reglas** y la **forma de emparejar**, pero si renombrás campos en el texto, la IA igual va a
  responder con los del código.
- **Guardá en UTF-8**, para no romper las tildes.
- **Probá el cambio con una lista real** antes de confirmar precios: un precio mal leído es un costo
  mal cargado en el Maestro.

## Cuándo se aplica un cambio

- **En tu computadora** (`npm run dev`): en el próximo análisis, sin reiniciar.
- **En producción:** con el próximo deploy.
