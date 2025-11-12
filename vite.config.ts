import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  css: {
    postcss: './postcss.config.js',
  },
  server: {
    host: true, // This makes the server accessible from other devices on the network
    port: 5173, // You can specify a port if needed
    allowedHosts: [
      'localhost',
      '.trycloudflare.com', // Allow all Cloudflare tunnel hosts
      'broad-encryption-words-given.trycloudflare.com', // Your specific tunnel host
    ],
  },
})
