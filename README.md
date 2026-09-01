<p align="center">
  <img src="screenshot/icon.svg" alt="AlipanBuddy" width="120">
</p>

<h1 align="center">神行云盘助手 · AlipanBuddy</h1>

<p align="center">
  中文 · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <strong>阿里云盘桌面客户端：文件与相册管理、分享、上传下载、加密工具。</strong>
</p>

<p align="center">
  <a href="https://github.com/programfan/alipanbuddy/releases">下载</a>
  ·
  <a href="#开发">开发</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/github/license/programfan/alipanbuddy?style=flat-square">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square&logo=tauri&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-ESNext-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-desktop-blue?style=flat-square">
</p>

---

## 神行云盘助手 是什么

神行云盘助手（AlipanBuddy）是 [BoxPlayer](https://github.com/gaozhangmin/boxplayer)（源自“小白羊网盘” aliyunpan）的一个 fork，并朝着更「纯粹」的方向持续演进：只做阿里云盘桌面客户端，砍掉一切与之无关的功能。

- 多账号登录，备份盘 / 资源盘 / 相册 / 安全盘统一浏览。
- 文件管理：新建、重命名、移动、复制、收藏、回收站、搜索、属性、压缩包解压。
- 相册管理与图片查看器。
- 分享：创建分享链接、导入他人分享、分享历史、快传、订阅。
- 上传下载：多线程 aria2c 下载、断点续传、加密上传 / 解密下载。
- 插件工具：文件加密 / 解密、喜马拉雅解密、空文件夹清理、重复文件 / 大文件扫描、违规文件扫描、相册批量复制。

### 与上游（BoxPlayer）的差异

- **只支持阿里云盘**：其他网盘的支持与多云抽象层已删除，不会再加回来。
- **不再内置播放器 / 媒体库 / 阅读器等附加系统**，专注文件管理、分享与传输本身。
- **没有自动更新、也不内置任何凭据**：这是一个「自带凭据」的私有客户端——每位用户都需要在
  [阿里云盘开放平台](https://www.aliyundrive.com/developer) 申请自己的 client id / client secret 才能登录使用。
- 从 Electron 迁移到 Tauri 2（Rust），体积与内存占用大幅下降。

<p align="center">
  <img src="screenshot/drive_home.png" width="720" alt="网盘首页">
</p>

---

## 安装

> **使用前提：自备阿里云盘开放平台凭据。**
> 发行版不内置任何 client id / secret。请先在
> [阿里云盘开放平台](https://www.aliyundrive.com/developer) 申请自己的凭据，
> 启动后在「设置 → 账户设置 → OpenAPI 授权」中选择“自定义凭据”填入，即可完成登录。

在 GitHub Releases 下载对应平台安装包：

[https://github.com/programfan/alipanbuddy/releases](https://github.com/programfan/alipanbuddy/releases)

| 平台 | 推荐文件 |
|---|---|
| Windows（x64 / ARM64） | `*-setup.exe` |
| Debian / Ubuntu | `*.deb` |
| Fedora / openSUSE | `*.rpm` |
| Linux 通用（tar 包安装） | `alipanbuddy-*-linux-<arch>.tar.gz` |

Linux tar 包本身就是一份 FHS 前缀目录（`bin/`、`lib/alipanbuddy/`、`share/`），自带桌面图标与
菜单项，解压后运行 `install.sh` 即可作为桌面应用安装：

```bash
tar -xzf alipanbuddy-<版本>-linux-x86_64.tar.gz
cd alipanbuddy-<版本>-linux-x86_64
sudo ./install.sh          # 安装到 /usr/local；或 ./install.sh --user 安装到 ~/.local
# 卸载：sudo ./install.sh --uninstall
```

三种 Linux 包共用同一套目录结构：主程序与自带的 aria2c 位于 `/usr/lib/alipanbuddy/`，
`/usr/bin/alipanbuddy` 是符号链接，因此不会与系统的 aria2 软件包冲突。

macOS 不再提供预构建安装包，可自行构建：`pnpm run build:mac`。构建产物如被 Gatekeeper
拦截，可在确认来源可信后执行 `sudo xattr -d com.apple.quarantine /Applications/alipanbuddy.app`。

---

## 开发

### 环境要求

- Node.js >= 22.12.0
- pnpm（仓库内不要使用 npm 或 yarn）
- Rust stable 工具链（`rustup`）
- Linux 需要 WebKitGTK 开发包：Fedora `webkit2gtk4.1-devel gtk3-devel libsoup3-devel librsvg2-devel libappindicator-gtk3-devel`，
  Debian/Ubuntu `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- macOS / Windows / Linux

### 常用命令

```bash
pnpm install                       # 安装依赖
pnpm dev                           # 本地开发（Vite 热重载 + Tauri/Rust）
pnpm run typecheck                 # 渲染端类型检查（vue-tsc）
pnpm run typecheck:rust            # Rust 类型检查（cargo check）
pnpm run test                      # Vitest
pnpm run test:rust                 # Rust 核心库单元测试（cargo test -p alipancore）
pnpm run build                     # 递增版本号 → 类型检查 → Vite 打包 → tauri build 生成安装包
pnpm run build:mac | build:linux | build:windows | build:windows:arm64
```

### 私有配置与密钥

阿里云盘 OpenAPI 的 `client id` / `client secret` 不提交到仓库。将其写入 `.env.local`（参考 `.env.example`），然后：

```bash
pnpm run secrets:generate   # 生成 src/secrets.generated.ts（已 ignore，已有值不会被空值覆盖）
```

`pnpm dev` / `pnpm run build` / `pnpm run test` 会自动执行该步骤。没有内置凭据的构建也可以使用：在
「设置 → 账户设置 → OpenAPI 授权」中选择“自定义凭据”，填入自己在
[阿里云盘开放平台](https://www.aliyundrive.com/developer) 申请的 client id / secret。

---

## 项目结构

```text
src-tauri/            Tauri（Rust）应用：窗口、托盘、命令、aria2c 引擎、本地解密代理
src-tauri/crates/alipancore/  与 GTK 无关的核心库（加密流、文件名编码、代理、上传、哈希），含单元测试
src/tauri/            渲染端 ↔ Rust 桥（window.WebXxx API、axios 适配器、fs/hash/upload 封装）
src/aliapi/           阿里云盘 API：文件、目录、分享、上传、相册、回收站
src/pan/              文件管理器 UI（目录树、列表、菜单、弹窗）
src/share/            分享 / 订阅
src/down/             上传下载任务与 aria2 集成
src/transfer/         上传队列
src/workerpage/       上传 / 下载工作窗口
src/rss/              插件工具（加密、扫描、清理等）
src/module/flow-enc/  加密文件名编码（文件内容加密在 Rust 中完成）
src/user/             登录与账号
src/setting/          设置页
src/layout/           主布局、图片查看器
src/store/            Pinia 状态
src/utils/            通用工具
scripts/              密钥生成、aria2c sidecar 准备、版本工具
static/engine/        各平台 aria2c 可执行文件与 aria2.conf
```

---

## 技术栈

- Tauri 2 (Rust) · Vue 3 · Vite · TypeScript
- Arco Design Vue · Ant Design Vue
- Dexie (IndexedDB)
- aria2c

---


## 鸣谢

本项目 fork 自 [BoxPlayer](https://github.com/gaozhangmin/boxplayer)，其前身为 [liupan1890/aliyunpan](https://github.com/liupan1890/aliyunpan)（小白羊网盘）。感谢原作者与社区的贡献。

---

## 免责声明

1. 本项目为学习、研究和个人文件管理用途，请遵守所在地区法律法规以及平台服务条款。
2. 本项目通过公开接口、官方接口或用户授权方式访问服务，不鼓励也不支持滥用账号、绕过限制或侵犯版权的行为。
3. 用户应自行确认文件来源、分享链接和下载内容的合法性。
4. 使用云盘服务产生的账号风险、限速、封禁或费用由用户自行承担。
5. 如有侵权或合规问题，请通过 GitHub Issue 联系处理。
