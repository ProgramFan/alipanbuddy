import { rmSync } from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json'

const sharedAlias = {
  '@shared': path.resolve(__dirname, 'shared'),
  '@main':   path.resolve(__dirname, 'electron/main')
}
// Native addons must stay outside Rollup so they resolve their bindings at runtime.
const electronMainExternal = [...Object.keys('dependencies' in pkg ? pkg.dependencies : {}), '@motrix/nat-api', 'aria2-lib']

// https://vitejs.dev/config/
// @ts-ignore
export default defineConfig(({ command }) => {
  rmSync('dist', { recursive: true, force: true })
  if (command === 'build') {
    rmSync('release', { recursive: true, force: true })
  }

  const isBuild = command === 'build'
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: { alias: sharedAlias },
    build: {
      // Packaged windows load static HTML from file:// inside app.asar. Keep
      // application styles in one predictable entry file instead of relying
      // on CSS attached to a lazy-loaded Vue chunk.
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          chunkFileNames: '[name].js',
          entryFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        }
      }
    },
    esbuild: isBuild ? { drop: ['console', 'debugger'] } : {},
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag == 'Webview'
          }
        }
      }),
      electron([
        {
          entry: 'electron/main/index.ts',
          onstart({ startup }) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */ '[startup] Electron App')
            } else {
          startup(['.', '--no-sandbox', '--remote-debugging-port=9223'])
            }
          },
          vite: {
            resolve: { alias: sharedAlias },
            build: {
              minify: isBuild,
              outDir: 'dist/electron/main',
              rollupOptions: {
                input: {
                  index: path.resolve(__dirname, 'electron/main/index.ts')
                },
                output: {
                  entryFileNames: '[name].js',
                  chunkFileNames: '[name].js'
                },
                // @ts-ignore
                external: (id: string) => electronMainExternal.includes(id)
              }
            }
          }
        },
        {
          entry: path.join(__dirname, 'electron/preload/index.ts'),
          onstart({ reload }) {
            reload()
          },
          vite: {
            resolve: { alias: sharedAlias },
            build: {
              minify: isBuild,
              outDir: 'dist/electron/preload',
              rollupOptions: {
                // @ts-ignore
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {})
              }
            }
          }
        }
      ]),
      renderer()
    ],
    server:
      process.env.VSCODE_DEBUG &&
      (() => {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
        return {
          host: url.hostname,
          port: +url.port
        }
      })()
  }
})
