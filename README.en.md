<p align="center">
  <img src="screenshot/icon.svg" alt="AlipanBuddy" width="120">
</p>

<h1 align="center">神行云盘助手 · AlipanBuddy</h1>

<p align="center">
  <a href="./README.md">中文</a> · English
</p>

<p align="center">
  <strong>A desktop client for Aliyun Drive: file & album management, sharing, upload/download, and encryption tools.</strong>
</p>

---

## What it is

AlipanBuddy (神行云盘助手) is a fork of [BoxPlayer](https://github.com/gaozhangmin/boxplayer) (itself derived from "aliyunpan / 小白羊") that diverges toward a purer goal: being *only* an Aliyun Drive desktop client, with everything unrelated cut away.

- Multiple accounts; browse backup / resource / album / safe-box drives.
- File management: create, rename, move, copy, favorites, recycle bin, search, properties, archive extraction.
- Album management and an image viewer.
- Online preview of Office documents and PDFs (Aliyun Drive's WebOffice viewer).
- Sharing: create share links, import other people's shares, share history, quick transfer, following.
- Upload / download: multi-connection aria2c downloads, resume, encrypted upload / decrypted download.
- Add-on tools: file encryption / decryption, Ximalaya decryption, empty-folder cleanup, duplicate / large-file scan, violation scan, batch album copy.

### How it diverges from upstream (BoxPlayer)

- **Aliyun Drive only** — support for other cloud providers and the multi-provider abstractions were removed for good.
- **No built-in players, media library, or readers** — the focus is file management, sharing, and transfers.
- **No auto-updater and no bundled credentials** — this is a bring-your-own-credentials client: every user must register their own client id / secret at the [Aliyun Drive developer portal](https://www.aliyundrive.com/developer) to log in.
- Migrated from Electron to Tauri 2 (Rust), with much smaller binaries and memory footprint.

<p align="center">
  <img src="screenshot/drive_home.png" width="720" alt="Drive home">
</p>

---

## Installation

> **Prerequisite: bring your own Aliyun Drive OpenAPI credentials.**
> Releases ship without any client id / secret. Register your own at the
> [Aliyun Drive developer portal](https://www.aliyundrive.com/developer), then enter them under
> Settings → Account → OpenAPI Authorization ("Custom credentials") to log in.

Download the installer for your platform from GitHub Releases:

[https://github.com/programfan/alipanbuddy/releases](https://github.com/programfan/alipanbuddy/releases)

| Platform | File |
|---|---|
| Windows (x64 / ARM64) | `*-setup.exe` |
| Debian / Ubuntu | `*.deb` |
| Fedora / openSUSE | `*.rpm` |
| Generic Linux (tarball) | `alipanbuddy-*-linux-<arch>.tar.gz` |

The Linux tarball unpacks as a ready-made FHS prefix (`bin/`, `lib/alipanbuddy/`, `share/`) with a desktop entry and icons; extract it and run `install.sh` to install it as a desktop application:

```bash
tar -xzf alipanbuddy-<version>-linux-x86_64.tar.gz
cd alipanbuddy-<version>-linux-x86_64
sudo ./install.sh          # installs into /usr/local; or ./install.sh --user for ~/.local
# uninstall: sudo ./install.sh --uninstall
```

All three Linux packages share one layout: the app and its bundled aria2c live in
`/usr/lib/alipanbuddy/` with `/usr/bin/alipanbuddy` as a symlink, so nothing collides
with the system aria2 package.

macOS is no longer supported: there are no prebuilt installers and no maintained local build path.

---

## Development

Requirements: Node.js >= 22.12.0, pnpm (never npm / yarn in this repo) and a stable Rust toolchain. On Linux install the
WebKitGTK development packages (`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` on Debian/Ubuntu,
`webkit2gtk4.1-devel gtk3-devel libsoup3-devel librsvg2-devel libappindicator-gtk3-devel` on Fedora).

```bash
pnpm install
pnpm dev                            # Vite hot reload + Tauri (Rust) app
pnpm run typecheck                  # renderer type check (vue-tsc)
pnpm run typecheck:rust             # cargo check
pnpm run test                       # Vitest
pnpm run test:rust                  # cargo test -p alipancore
pnpm run build:linux                # tauri build --no-bundle → .deb / .rpm
pnpm run build:windows              # NSIS installer (x64)
pnpm run build:windows:arm64        # NSIS installer (ARM64)
pnpm run build:debug                # debug build (no bundling, devtools enabled)
```

Aliyun Drive OpenAPI client id / secret live in `.env.local` (see `.env.example`); `pnpm run secrets:generate` writes `src/secrets.generated.ts` (git-ignored, existing values are never overwritten with empty ones) and runs automatically before `dev`, every `build:*`, and `test`. Builds without built-in credentials can still log in: pick "Custom credentials" under Settings → Account → OpenAPI Authorization and enter your own client id / secret from the [Aliyun Drive developer portal](https://www.aliyundrive.com/developer).

See [README.md](./README.md) for the project layout.

---

## Credits

This project is a fork of [BoxPlayer](https://github.com/gaozhangmin/boxplayer), whose lineage goes back to [liupan1890/aliyunpan](https://github.com/liupan1890/aliyunpan) (小白羊). Thanks to the original authors and community.

## Disclaimer

1. This is a free and open-source project intended for personal cloud-drive file management and Tauri learning. Comply with all applicable laws and the platform's terms of service; do not abuse it.
2. It works through official APIs and user authorization and does not bypass or tamper with official interfaces.
3. Before using it, understand and accept the related risks (account restrictions, speed limits, etc.); they are unrelated to this program.
4. For infringement or compliance concerns, open a GitHub Issue.
