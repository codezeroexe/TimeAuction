import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `npm run dev` talks to a locally running event server (`npm run server`) when there is one.
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
    // The event server writes its data here; it is not source code, so it must not trigger reloads.
    watch: { ignored: ['**/event-data/**'] },
  },
})
