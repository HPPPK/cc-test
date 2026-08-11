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
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      'src-tauri/**',
    ],
    globals: true,
    css: true,
    // Desktop test files share mutable Zustand stores and mocked Tauri globals.
    // Serial file execution prevents cross-file state from making coverage results nondeterministic.
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
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
