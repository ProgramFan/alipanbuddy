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

AlipanBuddy (神行云盘助手) is a fork of BoxPlayer / "aliyunpan (小白羊)", a cross-platform Aliyun Drive desktop client:

- Multiple accounts; browse backup / resource / album / safe-box drives.
- File management: create, rename, move, copy, favorites, recycle bin, search, properties, archive extraction.
- Album management and an image viewer.
- Sharing: create share links, import other people's shares, share history, quick transfer, following.
- Upload / download: multi-connection aria2c downloads, resume, encrypted upload / decrypted download.
- Add-on tools: file encryption / decryption, Ximalaya decryption, empty-folder cleanup, duplicate / large-file scan, violation scan, batch album copy.

<p align="center">
  <img src="screenshot/drive_home.png" width="720" alt="Drive home">
</p>

---

## Installation

Download the installer for your platform from GitHub Releases:

[https://github.com/gaozhangmin/aliyunpan/releases](https://github.com/gaozhangmin/aliyunpan/releases)

| Platform | File |
|---|---|
| macOS Apple Silicon | `*-mac-arm64.dmg` |
| macOS Intel | `*-mac-x64.dmg` |
| Windows | `*-win.exe` |
| Debian / Ubuntu | `*.deb` |
| Generic Linux | `*.AppImage` |
| Arch / Manjaro | `*.pacman` |

If macOS reports the app as damaged, run after verifying the source:

```sh
sudo xattr -d com.apple.quarantine /Applications/alipanbuddy.app
```

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
pnpm run test:rust                  # cargo test -p boxcore
pnpm run build                      # bump version → type check → vite build → tauri build (installers)
pnpm run build:mac | build:linux | build:windows | build:windows:arm64
```

Aliyun Drive OpenAPI client id / secret live in `.env.local` (see `.env.example`); `pnpm run secrets:generate` writes `src/secrets.generated.ts` (git-ignored, existing values are never overwritten with empty ones) and runs automatically before `dev`, `build`, and `test`. Builds without built-in credentials can still log in: pick "Custom credentials" under Settings → Account → OpenAPI Authorization and enter your own client id / secret from the [Aliyun Drive developer portal](https://www.aliyundrive.com/developer).

Auto update needs a Tauri signing key pair (`pnpm tauri signer generate`): put the public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` and provide `TAURI_SIGNING_PRIVATE_KEY` in CI.

See [README.md](./README.md) for the project layout.

---

## Community

Telegram: [https://t.me/+wjdFeQ7ZNNE1NmM1](https://t.me/+wjdFeQ7ZNNE1NmM1)

<p align="center">
  <img src="screenshot/qrcode_wechat.jpg" width="320" alt="WeChat official account">
</p>

## Credits

This project continues development based on [liupan1890/aliyunpan](https://github.com/liupan1890/aliyunpan). Thanks to [liupan1890](https://github.com/liupan1890).

## Disclaimer

1. This is a free and open-source project intended for personal cloud-drive file management and Tauri learning. Comply with all applicable laws and the platform's terms of service; do not abuse it.
2. It works through official APIs and user authorization and does not bypass or tamper with official interfaces.
3. Before using it, understand and accept the related risks (account restrictions, speed limits, etc.); they are unrelated to this program.
4. For infringement or compliance concerns, open a GitHub Issue.
