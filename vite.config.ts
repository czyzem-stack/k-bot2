import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/kalshi-api': {
        target: 'https://api.elections.kalshi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kalshi-api/, '/trade-api/v2'),
      },
      '/binance-api': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, '/api/v3'),
      },
    },
  },
})
