import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
    // Desktop test files share mutable Zustand stores and mocked Tauri globals.
    // Serial file execution prevents cross-file state from making coverage results nondeterministic.
    fileParallelism: false,
    setupFiles: [],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/types/**',
        'src/mocks/**',
        'src/vite-env.d.ts',
      ],
    },
  },
})
