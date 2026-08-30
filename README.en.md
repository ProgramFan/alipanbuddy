<p align="center">
  <img src="screenshot/icon.svg" alt="BoxPlayer" width="120">
</p>

<h1 align="center">BoxPlayer</h1>

<p align="center">
  <a href="./README.md">中文</a> · English
</p>

<p align="center">
  <strong>A desktop client for Aliyun Drive: file & album management, sharing, upload/download, and encryption tools.</strong>
</p>

---

## What it is

BoxPlayer continues the "aliyunpan (小白羊)" project as a cross-platform Aliyun Drive desktop client:

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
sudo xattr -d com.apple.quarantine /Applications/BoxPlayer.app
```

---

## Development

Requirements: Node.js >= 22.12.0 and pnpm (never npm / yarn in this repo).

```bash
pnpm install
pnpm dev                            # Vite + Electron with hot reload
CI=true pnpm exec vue-tsc --noEmit  # type check only
pnpm run test                       # Vitest
pnpm run build                      # bump version → type check → bundle
pnpm run build:electron             # package with electron-builder
```

Aliyun Drive client id / secret live in `.env.local` (see `.env.example`); `pnpm run secrets:generate` writes `src/secrets.generated.ts` (git-ignored) and runs automatically before `dev`, `build`, and `test`.

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

1. This is a free and open-source project intended for personal cloud-drive file management and Electron learning. Comply with all applicable laws and the platform's terms of service; do not abuse it.
2. It works through official APIs and user authorization and does not bypass or tamper with official interfaces.
3. Before using it, understand and accept the related risks (account restrictions, speed limits, etc.); they are unrelated to this program.
4. For infringement or compliance concerns, open a GitHub Issue.
