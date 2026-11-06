import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  server: { port: 5199 },
})
