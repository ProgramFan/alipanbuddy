<p align="center">
  <img src="screenshot/icon.svg" alt="BoxPlayer" width="120">
</p>

<h1 align="center">BoxPlayer</h1>

<p align="center">
  中文 · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <strong>阿里云盘桌面客户端：文件与相册管理、分享、上传下载、加密工具。</strong>
</p>

<p align="center">
  <a href="https://github.com/gaozhangmin/aliyunpan/releases">下载</a>
  ·
  <a href="#开发">开发</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/github/license/gaozhangmin/aliyunpan?style=flat-square">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-40-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ESNext-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-desktop-blue?style=flat-square">
</p>

---

## BoxPlayer 是什么

BoxPlayer 源自“小白羊网盘”，是一个专注于阿里云盘的跨平台桌面客户端：

- 多账号登录，备份盘 / 资源盘 / 相册 / 安全盘统一浏览。
- 文件管理：新建、重命名、移动、复制、收藏、回收站、搜索、属性、压缩包解压。
- 相册管理与图片查看器。
- 分享：创建分享链接、导入他人分享、分享历史、快传、订阅。
- 上传下载：多线程 aria2c 下载、断点续传、加密上传 / 解密下载。
- 插件工具：文件加密 / 解密、喜马拉雅解密、空文件夹清理、重复文件 / 大文件扫描、违规文件扫描、相册批量复制。

<p align="center">
  <img src="screenshot/drive_home.png" width="720" alt="网盘首页">
</p>

---

## 安装

在 GitHub Releases 下载对应平台安装包：

[https://github.com/gaozhangmin/aliyunpan/releases](https://github.com/gaozhangmin/aliyunpan/releases)

| 平台 | 推荐文件 |
|---|---|
| macOS Apple Silicon | `*-mac-arm64.dmg` |
| macOS Intel | `*-mac-x64.dmg` |
| Windows | `*-win.exe` |
| Debian / Ubuntu | `*.deb` |
| Linux 通用 | `*.AppImage` |
| Arch / Manjaro | `*.pacman` |

macOS 如果提示“文件已损坏”或被 Gatekeeper 拦截，可在确认来源可信后执行：

```bash
sudo xattr -d com.apple.quarantine /Applications/BoxPlayer.app
```

---

## 开发

### 环境要求

- Node.js >= 22.12.0
- pnpm（仓库内不要使用 npm 或 yarn）
- macOS / Windows / Linux

### 常用命令

```bash
pnpm install                       # 安装依赖
pnpm dev                           # 本地开发（Vite + Electron 热重载）
CI=true pnpm exec vue-tsc --noEmit # 仅类型检查
pnpm run test                      # Vitest
pnpm run build                     # 递增版本号 → 类型检查 → 打包渲染端与主进程
pnpm run build:electron            # 打包安装包（electron-builder）
pnpm run build:mac | build:linux | build:windows
```

### 私有配置与密钥

阿里云盘 `client id` / `client secret` 不提交到仓库。将其写入 `.env.local`（参考 `.env.example`），然后：

```bash
pnpm run secrets:generate   # 生成 src/secrets.generated.ts（已 ignore）
```

`pnpm dev` / `pnpm run build` / `pnpm run test` 会自动执行该步骤。

---

## 项目结构

```text
electron/main/        Electron 主进程：窗口、IPC、自动更新、aria2c 下载引擎
electron/preload/     预加载脚本（IPC 桥）
src/aliapi/           阿里云盘 API：文件、目录、分享、上传、相册、回收站
src/pan/              文件管理器 UI（目录树、列表、菜单、弹窗）
src/share/            分享 / 订阅
src/down/             上传下载任务与 aria2 集成
src/transfer/         上传队列
src/workerpage/       上传 / 下载工作窗口
src/rss/              插件工具（加密、扫描、清理等）
src/module/flow-enc/  文件加密流
src/user/             登录与账号
src/setting/          设置页
src/layout/           主布局、图片查看器
src/store/            Pinia 状态
src/utils/            通用工具
shared/               主进程 / 渲染端共享代码
scripts/              密钥生成、版本工具
```

---

## 技术栈

- Electron 40 · Vue 3 · Vite · TypeScript
- Arco Design Vue · Ant Design Vue
- Dexie (IndexedDB)
- aria2c

---

## 赞助与社区

如果 BoxPlayer 对你有帮助，欢迎赞助支持持续维护。

<p align="center">
  <img src="public/images/wechat_pay.jpg" width="220" alt="微信赞赏码">
  <img src="public/images/alipay.jpg" width="220" alt="支付宝赞赏码">
</p>

USDT / USDC：

```text
0xb0a3f7254e97a8bd398b1ab7f70eb48b0dc68eaf
```

微信公众号：

<p align="center">
  <img src="screenshot/qrcode_wechat.jpg" width="320" alt="小白羊公众号">
</p>

Telegram：[https://t.me/+wjdFeQ7ZNNE1NmM1](https://t.me/+wjdFeQ7ZNNE1NmM1)

---

## 鸣谢

本项目基于 [liupan1890/aliyunpan](https://github.com/liupan1890/aliyunpan) 继续开发，感谢原作者和社区贡献。

---

## 免责声明

1. 本项目为学习、研究和个人文件管理用途，请遵守所在地区法律法规以及平台服务条款。
2. 本项目通过公开接口、官方接口或用户授权方式访问服务，不鼓励也不支持滥用账号、绕过限制或侵犯版权的行为。
3. 用户应自行确认文件来源、分享链接和下载内容的合法性。
4. 使用云盘服务产生的账号风险、限速、封禁或费用由用户自行承担。
5. 如有侵权或合规问题，请通过 GitHub Issue 联系处理。
