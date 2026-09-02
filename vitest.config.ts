// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: [
      'src/download/**/*.test.ts',
      'src/upload/**/*.test.ts',
      'src/utils/__tests__/**/*.test.ts',
      'src/aliapi/__tests__/**/*.test.ts'
    ]
  }
})
