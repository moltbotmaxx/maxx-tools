import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rename-html',
      enforce: 'post',
      generateBundle(_, bundle) {
        const html = bundle['app.html']
        if (html) {
          html.fileName = 'index.html'
        }
      }
    }
  ],
  base: './',
  build: {
    outDir: '.',
    emptyOutDir: false,
    rollupOptions: {
      input: 'app.html',
    },
  },
  server: {
    port: 3000,
    open: '/app.html'
  }
})

