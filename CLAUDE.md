# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick commands

```bash
pnpm install          # pnpm only — never npm/yarn
pnpm dev              # hot-reload Electron dev server (Vite + vue-tsc)
pnpm run build        # version bump → typecheck → vite bundle
pnpm run build:electron  # full build + electron-builder packaging
pnpm run test         # Vitest (Node env): aria engine, downloads, utils, aliapi, shared
CI=true pnpm exec vue-tsc --noEmit   # typecheck only (no version bump)
pnpm exec tsc -p tsconfig.node.json --noEmit  # typecheck Electron main/preload
pnpm run build:mac    # unsigned macOS .dmg/.zip
pnpm run build:mac:signed  # signed + notarized macOS
pnpm run build:linux  # Linux .deb/.AppImage/.pacman
pnpm run build:windows  # Windows .exe/.zip
pnpm run build:all    # cross-platform sequentially
pnpm run secrets:generate  # .env.local → src/secrets.generated.ts (runs automatically before dev/build/test)
```

## Scope

BoxPlayer is an **Aliyun Drive–only** desktop client. Supported functionality: multi-account login, file/album
management, sharing, upload/download (aria2c), file encryption/decryption and the other add-on tools under `src/rss`.
Other cloud providers, media library/servers, players, readers, AI agents and the clouddrive-cli were removed on
purpose — do not reintroduce provider abstractions or feature gates for them.

## Architecture (Electron + Vue 3 + Vite)

```
electron/main/       Electron main process (entry: electron/main/index.ts, launch.ts)
  core/              Window lifecycle, IPC (ipcEvent.ts), auto-update, dialogs
  aria/              Aria2c download engine (config, UPnP, runtime) + tests
electron/preload/    Preload script (IPC bridge → window.* APIs, declared in src/global.d.ts)

src/                 Vue 3 renderer (entry: src/main.ts → App.vue → layout/PageMain.vue)
  aliapi/            Aliyun Drive API (files, dirs, share, upload, album, trash, user)
  pan/               File manager UI (tree, list, menus, modals, topbtns)
  share/             Share links, imports, history, following
  down/              Download/upload task UI + aria2 integration (DownDAL)
  transfer/          Upload queue DAL
  workerpage/        Upload/download worker windows
  rss/               Add-on tools (encryption, scans, cleanup, album copy)
  module/flow-enc/   Encrypted upload/download stream
  user/              Login, token refresh, account UI
  setting/           Settings pages + settingstore
  layout/            PageMain shell, PageImage viewer, PageWorker, shared widgets
  store/             Pinia stores
  drive/             Aliyun drive context helpers (getDriveId/getDriveType, token lookup)
  utils/             Shared utilities (db, proxy server, modal registry, openfile, aria2 rpc)
  i18n/              zh-CN / en-US strings

shared/              Code shared between main + renderer (constants, config keys, UA, utils)
scripts/             generate-secrets.mjs, version-utils.mjs
```

Path aliases: `@shared/*` → `shared/*`, `@main/*` → `electron/main/*`

## Key patterns

- **pnpm only** — lockfile is `pnpm-lock.yaml`; `package-lock.json`/`yarn.lock` are gitignored
- **Node ≥ 22.12**
- **Pre-commit hooks** (`nano-staged.mjs`): prettier + eslint on JS/TS, stylelint + prettier on Vue/CSS, typecheck on changed `src/` files
- **Formatting**: single quotes, no semicolons, 260 printWidth, no trailing commas, LF, `sortAttributes: true` in Vue
- **TypeScript**: strict mode, ESNext target, node moduleResolution
- **Secrets**: only `ALIYUN_APP_ID`/`ALIYUN_APP_SECRET` (+ Apple notarization vars) via `.env.local`; never commit `src/secrets.generated.ts`
- **Vitest**: Node environment only, explicit test directory list in `vitest.config.ts` (not glob patterns). Add new test dirs to config.
- **Windows/pages**: `WebOpenWindow({ page })` opens `PageImage` / `PageWorker` secondary windows; `App.vue` switches on `appStore.appPage`
- **CI**: Manual trigger only via `.github/workflows/release.yml`, publishes draft GitHub Release
