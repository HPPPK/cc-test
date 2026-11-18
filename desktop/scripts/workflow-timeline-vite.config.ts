import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: resolve('../artifacts/quality-runs/workflow-timeline-smoke/vite-cache'),
  build: {
    outDir: resolve('../artifacts/quality-runs/workflow-timeline-smoke/fixture-dist'),
    emptyOutDir: false,
    rollupOptions: { input: resolve('scripts/workflow-timeline-fixture.html') },
  },
})
