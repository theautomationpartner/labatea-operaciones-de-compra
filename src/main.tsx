import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { AppProvider } from '@/state/AppProvider'

import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/components.css'
import '@/styles/views.css'
import '@/styles/proveedor.css'
import '@/styles/productos.css'
import '@/styles/emision.css'
import '@/styles/factura.css'
import '@/styles/compras.css'
import '@/styles/precios.css'
import '@/styles/comprobante.css'

const container = document.getElementById('root')
if (!container) throw new Error('No se encontró el nodo #root')

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
