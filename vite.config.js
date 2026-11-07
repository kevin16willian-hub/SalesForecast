import { defineConfig } from 'vite'

// Proxy todas as chamadas /api/* para o backend Node — elimina problemas de CORS em dev.
export default defineConfig({
  envPrefix: ['VITE_', 'REDIRECT_'],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
