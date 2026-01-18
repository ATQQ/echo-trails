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

## 2. 客户端开发 (`packages/native`)
**角色**: 系统集成与原生能力
- **技术栈**: Tauri (Rust), Android (Kotlin/Java), iOS (Swift).
- **职责**:
  - **桥接 (Bridge)**: 向前端暴露原生系统 API（文件系统、相机、权限等）。
  - **性能**: 处理繁重任务（如文件哈希计算、压缩等）。
  - **平台特定**: Android 端 `MainActivity.kt` 用于 JNI 调用（如 `getFileInfo`, `installApk`）。
- **关键规则**:
  - **JNI 安全**: 任何通过 Rust 调用的 `MainActivity.kt` 方法，**必须**在 `proguard-rules.pro` 中添加对应的 `-keep` 规则。
  - **跨平台**: `lib.rs` 中的 Rust 代码应优雅处理 `#[cfg(target_os = "android")]` 与其他平台的差异。

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

## 交互工作流

### 照片上传流程
1.  **前端**: 用户选择照片 -> 调用 `get_file_info` (Native) 获取精准拍摄时间。
2.  **原生**: Rust 调用 Android JNI -> 返回 `FileInfo` 对象。
3.  **前端**: 向 **服务端** 请求上传 Token。
4.  **服务端**: 返回 S3 预签名 URL。
5.  **前端**: 直接上传二进制文件到 S3 -> 同步元数据到 **服务端**。

### 应用更新流程
1.  **原生**: 检查版本更新。
2.  **原生**: 下载 APK (`download_apk` Rust 命令)。
3.  **原生**: 触发安装 (`open_apk` -> JNI `installApk`).
