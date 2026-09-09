# Operaciones de compra

Prototipo de app para Monday.com que arma una **Orden de Compra** paso a paso (proveedor →
productos → emisión) y la mapea sobre los tableros de Monday.

Stack: React 18 + TypeScript + Vite. En el deploy, Serverless Functions de Vercel.

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # y pegá tu token de Monday en VITE_MONDAY_TOKEN
npm run dev                        # http://localhost:5182
```

Sin token la app arranca igual, pero no habla con Monday: el selector de responsable queda vacío
y los servicios no salen a la red.

En desarrollo los pedidos salen por el proxy de Vite (`/monday-api`, `/monday-api-file`,
`/monday-files`), que evita el CORS de pegarle directo a `api.monday.com` desde el navegador.

## Deploy en Vercel

La única variable que hay que configurar es **`MONDAY_TOKEN`** (sin prefijo `VITE_`), en
*Project → Settings → Environment Variables*.

En producción el navegador **no** habla con Monday: pega contra las funciones de `api/`, que
inyectan el token del lado servidor.

| Ruta | Qué hace |
| --- | --- |
| `api/monday.ts` | Proxy del endpoint GraphQL (`/v2`). |
| `api/monday-upload.ts` | Proxy de la subida de archivos (`/v2/file`, multipart). |
| `api/monday-file.ts` | Trae los bytes de un archivo del bucket S3, que no manda CORS. |

> **No definir `VITE_MONDAY_TOKEN` en Vercel.** Vite incrusta todo lo que lleva prefijo `VITE_` en
> el bundle público: el token quedaría legible para cualquiera que abra la app.

`vercel.json` agrega el `frame-ancestors` que permite embeber la app dentro de Monday, y el
rewrite de SPA para todo lo que no sea `/api/`.

## Estado de seguridad

Las funciones de `api/` **todavía no tienen guardián**: reenvían a Monday sin verificar quién
llama. El token dejó de estar expuesto en el bundle, pero las rutas que lo usan sí lo están.
Antes de un uso real hay que traer la verificación de session token + lista blanca que ya existe
en "Operaciones de venta".

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (puerto 5182, `strictPort`). |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build local. |
| `npm run typecheck` | TypeScript sobre `src/` + `api/`. |
| `npm run typecheck:api` | TypeScript sobre `api/` con resolución de Node. |
