import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
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
})
