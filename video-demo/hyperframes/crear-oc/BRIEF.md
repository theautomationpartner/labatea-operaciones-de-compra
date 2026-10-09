---
workflow: general-video
flow: automation
storyboard: no
message: "Cómo crear una orden de compra en La Batea Compras, paso a paso por sus tres etapas"
destination: demo para usuarios de la app
aspect: "16:9"
language: es-AR
audience: usuarios internos de La Batea (compras)
length: "≤ 5 min"
---

## Intent
Video demo (tutorial) de la operación "Crear orden de compra": desde elegirla en el encabezado hasta emitir la orden
y preparar el envío al proveedor. Tiene que quedar claro que avanza por tres etapas (Seleccionar proveedor →
Seleccionar productos → Emitir y enviar), cómo se ve la etapa actual y cómo se marcan las completadas.
Guion aprobado por el usuario: `../../guion.md` (6 partes, una voz por parte).

## Assets
- Grabación de pantalla (Playwright, 4K) ya montada: `assets/crear-oc-base-4k.mp4` + `assets/timeline.json`
  (inicio de cada audio y cada zoom con la caja del elemento en px de la página de 1600×900).
- Voz en off: `audio/p1.mp3` … `audio/p6.mp3` (edge-tts, es-AR-ElenaNeural).
- Logo de la app: `assets/logo-la-batea.png`. Logo de The Automation Partner: `assets/logo-tap.png`.

## Customizations
- Grabación dentro de un contenedor "cámara" animado con GSAP (scale + x/y, transformOrigin 0 0): zoom suave
  (acercar y volver) sobre lo que nombra la voz, centrando la caja sin mostrar bordes vacíos; zooms cercanos
  encadenados sin volver a 1×.
- Apertura con título animado (logo y colores de la app) como subcomposición, que se funde en la grabación.
  El texto del título se desvanece antes que el fondo.
- Fundido desde negro al principio y a negro al final.
- Logo de The Automation Partner abajo a la derecha: durante el título a opacidad completa; terminada la apertura
  pasa a ~60 % del tamaño y ~35 % de opacidad como marca de agua hasta el final. Fuera de la cámara (no se
  agranda con los zooms) y debajo del fundido a negro. Mantiene su proporción.

## Notes
- Sin música. Sin subtítulos.
- Exportar en 1080p con alta calidad. No renderizar hasta que el usuario apruebe la vista previa.
