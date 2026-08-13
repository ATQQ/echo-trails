# AGENTS.md
## Setup commands
```
bun install
```

## 1. Web 前端 (`packages/app`)
**角色**: 用户界面与客户端逻辑
- **技术栈**: Vue 3, Vite, TypeScript, Pinia, SASS
- **包管理**：使用 `bun` 进行依赖管理。
- **职责**:
  - 渲染 UI：包括体重追踪、相册管理和设置页面。
  - 处理用户交互。
  - 调用后端 API。
  - 通过 Tauri Bridge 调用原生能力。
- **关键文件**:
  - `src/views/*`: 页面逻辑。
  - `src/components/*`: 可复用的 UI 组件。
  - `src/lib/*`: 工具函数和 API 客户端。
- **关键规则**:
  - **弹窗与路由拦截**: 所有的弹窗状态（如 `van-popup`、`van-action-sheet` 的 `v-model:show` 变量）必须使用 `@/lib/router` 提供的 `preventBack` 进行包裹。这样当用户点击 Android 物理返回键或浏览器后退时，会优先关闭弹窗而不是直接返回上一个页面。

## 2. 客户端开发 (`packages/native`)
**角色**: 系统集成与原生能力
- **技术栈**: Tauri (Rust), Android (Kotlin/Java), iOS (Swift), Desktop (macOS/Windows).
- **职责**:
  - **桥接 (Bridge)**: 向前端暴露原生系统 API（文件系统、相机、权限等）。
  - **性能**: 处理繁重任务（如文件哈希计算、压缩等）。
  - **平台特定**: Android 端 `MainActivity.kt` 用于 JNI 调用（如 `getFileInfo`, `installApk`）。
- **关键规则**:
  - **JNI 安全**: 任何通过 Rust 调用的 `MainActivity.kt` 方法，**必须**在 `proguard-rules.pro` 中添加对应的 `-keep` 规则。
  - **跨平台**: `lib.rs` 中的 Rust 代码应优雅处理 `#[cfg(target_os = "android")]` 与其他平台的差异。所有依赖 `jni` / `ndk-context` 的代码必须放在 `#[cfg(target_os = "android")]` 分支内，桌面分支提供跨平台等价实现或 stub。
- **构建命令**:
  - Android: `cd packages/native && bun run build:android`（会跑 `pre:build` + `tauri android build` + rename + 更新 md5）。
  - Desktop（本地 macOS/Windows/Linux 首次验证）: `cd packages/native && bun run build:desktop`；产物位于 `packages/native/src-tauri/target/release/bundle/{dmg,macos,msi,nsis,deb,rpm,appimage}/`。
  - Desktop 目标产物 whitelist 已在 [tauri.conf.json](./packages/native/src-tauri/tauri.conf.json) `bundle.targets` 里显式列出 (`app`, `dmg`, `msi`, `nsis`, `deb`, `rpm`, `appimage`)。CI 在 `ubuntu-22.04` 打 Linux x64。
- **本地开发命令**:
  - Android（后端 + Android 原生）: 项目根目录 `bun run dev`（等价 `run-p dev:server dev:android`）。
  - Desktop（后端 + 桌面 Tauri）: 项目根目录 `bun run dev:app`（等价 `run-p dev:server dev:desktop`）。
  - 仅 Android 原生: `cd packages/native && bun run dev:android` 或根目录 `bun run dev:android`。
  - 仅 Desktop 原生（macOS/Windows）: `cd packages/native && bun run dev`（等价 `bun run dev:desktop`；两者都会先跑 `pre:build` 再执行 `tauri dev`）；或根目录 `bun run dev:desktop`。
    - 前置条件: Rust stable + Xcode Command Line Tools（macOS）/ MSVC Build Tools（Windows）；首次编译需拉取 cargo 依赖，网络代理需可用。
    - `beforeDevCommand` 会在 [tauri.conf.json](./packages/native/src-tauri/tauri.conf.json) 中自启前端 Vite（`packages/app` @ 1420 端口）；若已手动运行 `bun run dev @ packages/app`，请先 `Ctrl+C` 掉再跑，或改用 `bunx tauri dev --no-dev-server` 复用现有服务。
    - [preset-build.js](./packages/native/scripts/preset-build.js) 每次运行会把本机 IP 写回 `beforeDevCommand`、`devUrl` 与 http capability，切网时无需手工修改。
- **桌面端已知差异（相对 Android）**:
  - `open_apk` 桌面下退化为 `tauri-plugin-opener` 打开文件，不会真正安装 APK。
  - `get_file_info` 桌面分支返回 `width=0/height=0`（见 [media.rs](./packages/native/src-tauri/src/command/media.rs)），前端 [getImageDimensions](./packages/app/src/lib/file.ts) 会通过 `<img>` 兜底解析尺寸；HEIC 图桌面因 Chromium 无原生解码器会拿不到宽高。
  - `save_to_pictures` 桌面走 `path().picture_dir()`（macOS `~/Pictures`、Windows `%USERPROFILE%\Pictures`），Android 仍写 `/storage/emulated/0/Pictures`。
  - 文件选择: `@tauri-apps/plugin-dialog` 的 `open` 在桌面返回绝对路径；上传前 [file.ts](./packages/app/src/lib/file.ts) 中 `readNativeFile` 会按 `isAbsoluteNativePath` 判断跳过 `BaseDirectory.Resource`。若要读取用户其它目录，需在 [capabilities/default.json](./packages/native/src-tauri/capabilities/default.json) 的 `fs:allow-read-file` / `fs:allow-lstat` / `fs:scope` 中追加 scope（当前已覆盖 `$HOME`、`$PICTURE`、`$DOWNLOAD`、`$DESKTOP`、`$DOCUMENT`）。
  - 缓存目录: 图片/视频缓存均落到 `appLocalDataDir`（macOS `~/Library/Application Support/com.echo-trails.app/`、Windows `%APPDATA%\com.echo-trails.app\`），已在 [tauri.conf.json](./packages/native/src-tauri/tauri.conf.json) `assetProtocol.scope` 中放行。

## 3. 服务端 server (`packages/server`)
**角色**: 数据持久化与业务逻辑
- **技术栈**: Bun, Hono, Mongoose (MongoDB), AWS S3 SDK.
- **包管理**：使用 `bun` 进行依赖管理。
- **职责**:
  - **API**: 为前端提供 RESTful 接口。
  - **数据库**: 管理用户、体重、照片和相册数据 (MongoDB)。
  - **存储**: 生成 S3 文件上传的预签名 URL (Bitiful/AWS)。
  - **认证**: 处理用户登录与鉴权 (JWT/Session)。

## 4. 运维脚本 (`scripts`)
**角色**: 自动化与部署
- **技术栈**: Bun/Node 脚本, Shell.
- **职责**:
  - **部署**: `deploy-client.ts`, `deploy-server.ts`.
  - **发布**: `git-release.ts`, `upgrade-version.ts`.
  - **Android**: `rename-android-apk.ts`, `setup-android-signing.ts`.

## 要求
1. 每次修改完在最后总结一下本次修改，用简体中文，安装常用的 git commit 的格式
2. 项目我会自己启动，请你在验证过程中不要再尝试启动项目，前端默认运行在 1420 端口
3. 涉及到数据和接口改动时，兼容远程和本地两种模式