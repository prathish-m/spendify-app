import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite configuration: React + Tailwind CSS v4 (via the official Vite plugin).
//
// `base: './'` makes built asset URLs relative, which is required for the
// Capacitor Android WebView (it serves the bundle from a local app origin, not
// the site root). This is harmless for normal web use too.
//
// The dev server proxies /api → the Node backend on port 4000 so the frontend
// can call same-origin `/api/...` paths without CORS concerns. On device the
// app instead calls the absolute `VITE_API_URL` (see .env).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
