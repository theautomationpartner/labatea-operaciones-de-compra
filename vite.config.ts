import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // Prefijo vacío: también se leen las variables SIN `VITE_`, que se usan sólo acá (nunca en el bundle).
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * Las funciones de `api/` que en local tienen que correr TAL CUAL corren en Vercel.
   *
   * El análisis de la lista de precios con Claude: Vite carga la misma ruta que usa la función
   * (`api/_preciosIaHttp.ts`) y le pasa el pedido, con `ANTHROPIC_API_KEY` de `.env.local`.
   */
  const funcionesLocales: Plugin = {
    name: 'api-local',
    configureServer(server) {
      if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
      server.middlewares.use('/api/precios-ia', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_preciosIaHttp.ts')
        await mod.manejarPreciosIa(req, res)
      })
      /* El envío de la orden de compra al proveedor por Make.com, con el webhook de `.env.local`
         (`MAKE_WEBHOOK_ENVIO_OC_URL`): la dirección no llega nunca al navegador. */
      if (env.MAKE_WEBHOOK_ENVIO_OC_URL) {
        process.env.MAKE_WEBHOOK_ENVIO_OC_URL = env.MAKE_WEBHOOK_ENVIO_OC_URL
      }
      server.middlewares.use('/api/make-envio-oc', async (req, res) => {
        const mod = await server.ssrLoadModule('/api/_envioOcHttp.ts')
        await mod.manejarEnvioOc(req, res)
      })
    },
  }

  return {
    plugins: [react(), funcionesLocales],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    /* Puerto propio del proyecto: 5182. El 5180 es el de "Operaciones de venta" y el 5181 ya estaba
       tomado, así que esta app se corre al siguiente libre y las dos pueden convivir levantadas.
       `strictPort` evita que Vite salte a otro puerto en silencio si éste también se ocupa: es
       preferible que falle al arrancar y avise, antes que quedar sirviendo en una dirección
       distinta de la que dice la configuración. */
    server: {
      port: 5182,
      strictPort: true,
      proxy: {
        /* Subida de archivos a columnas `file`. Va ANTES de '/monday-api' porque Vite matchea por
           prefijo y '/monday-api-file' también empieza con '/monday-api'. */
        '/monday-api-file': {
          target: 'https://api.monday.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-api-file/, '/v2/file'),
        },
        // API GraphQL de Monday. El proxy evita el CORS de pegarle directo desde el navegador.
        '/monday-api': {
          target: 'https://api.monday.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-api/, '/v2'),
        },
        /* Archivos del board (S3). El bucket no manda cabeceras CORS, así que sin este proxy el
           navegador no puede leer los bytes de un PDF para mostrarlo embebido. */
        '/monday-files': {
          target: 'https://files-monday-com.s3.amazonaws.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/monday-files/, ''),
        },
      },
    },
  }
})
