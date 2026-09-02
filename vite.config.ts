import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isBuild = command === 'build'
  return {
    plugins: [vue()],
    // Tauri expects a fixed port and fails if that port is not available
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: {
        // tell vite to ignore watching `src-tauri`
        ignored: ['**/src-tauri/**']
      }
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      // Tauri uses Chromium (WebView2) on Windows and WebKitGTK on Linux
      target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari14',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      // Keep application styles in one predictable entry file instead of relying on CSS attached to a lazy-loaded Vue chunk.
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          chunkFileNames: '[name].js',
          entryFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        }
      }
    },
    esbuild: isBuild && !process.env.TAURI_ENV_DEBUG ? { drop: ['console', 'debugger'] } : {}
  }
})
