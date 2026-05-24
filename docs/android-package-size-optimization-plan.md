# Android 包体积优化计划

> 目标：围绕当前约 45M 的 Android APK，按低风险、可验证、可回滚的顺序逐步优化。每一步完成后先停下，由项目维护者确认，再进入下一步。

## 当前基线

- 基线命令：`bun run analyze:android-size`
- 基线快照：`docs/android-package-size-baseline-0.7.9.md`
- Step 2 结果快照：`docs/android-package-size-step2-strip-0.7.9.md`
- Step 3 结果快照：`docs/android-package-size-step3-compress-native-libs-0.7.9.md`
- Step 4 结果快照：`docs/android-package-size-step4-shrink-resources-0.7.9.md`
- 当前版本：`0.7.9`
- 最新 APK：`release/echo-trails-release-0.7.9.apk`，42.89 MB。
- 最新 AAB：`release/echo-trails-release-0.7.9.aab`，17.63 MB。
- build arm64 APK：`packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`，42.89 MB。
- build universal APK：`packages/native/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`，150.94 MB。
- build arm64 AAB：`packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab`，17.63 MB。
- build universal AAB：`packages/native/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`，57.84 MB。
- APK 最大文件：`lib/arm64-v8a/libtauri_app_lib.so`，40.47 MB，APK 中为 `stor` 未压缩。
- AAB 最大文件：`base/lib/arm64-v8a/libtauri_app_lib.so`，未压缩 40.47 MB，压缩后 14.33 MB。
- 前端产物：`packages/app/dist`，2.22 MB。
- native so 关键 section：`.strtab` 6.93 MB，`.symtab` 4.96 MB，`.text` 17.84 MB。
- 结论：当前主要优化对象是 Tauri/Rust native library，不是前端 JS/CSS/图片资源。

## 推进规则

- 每一步单独提交改动和验证结果，不混入无关重构。
- 每一步完成后输出体积对比，并等待确认后再继续下一步。
- 验证过程中不启动项目；只做构建、检查、产物体积分析。
- 涉及上传、接口、数据流改动时，需要兼容远程模式和本地模式。

## Step 1：建立可复用体积基线

- 状态：已完成，待确认进入 Step 2
- 目标：把 APK/AAB/native so/frontend dist 的体积检查命令和结果固化，作为后续对比依据。
- 改动范围：
  - 已新增 `scripts/analyze-android-package-size.ts`。
  - 已新增根命令 `bun run analyze:android-size`。
- 验证方式：
  - 已检查 `release/*.apk`、`release/*.aab` 体积。
  - 已使用 `zipinfo` 拆分 APK/AAB 内部大文件。
  - 已检查 `packages/app/dist` 和 `libtauri_app_lib.so` 体积。
  - 已使用 `objdump -h` 输出 so section 体积。
- 预期结果：
  - 已得到后续每一步都能复用的对比口径。
- 风险：
  - 无功能风险，只读分析或新增辅助脚本。
- 完成后暂停点：
  - 你确认基线口径后，再进入 Step 2。

## Step 2：启用 Rust release 符号裁剪

- 状态：已完成，待确认进入 Step 3
- 目标：减少 `libtauri_app_lib.so` 中不必要的符号表。
- 主要依据：
  - 当前 release so 仍包含 `.symtab` 和 `.strtab`。
  - 临时测试 `strip-unneeded` 后，so 可从约 40M 降到约 29M。
- 改动范围：
  - 已修改 `packages/native/src-tauri/Cargo.toml`
  - 已增加 `[profile.release] strip = "symbols"`
  - 暂未启用 `panic = "abort"`、`codegen-units = 1`、`lto = true` 或 `"thin"`，避免混入构建耗时和运行语义变化。
- 建议先做：
  - 第一轮只加 `strip = "symbols"`，降低行为变化风险。
- 验证方式：
  - 已执行 Android release 构建命令：`bun run tauri android build --target aarch64 --split-per-abi --apk true --aab true`
  - 已执行体积分析命令：`bun run analyze:android-size`
  - 已对比新旧 `libtauri_app_lib.so`、APK、AAB 体积。
  - 已确认 `.strtab` 和 `.symtab` 从 so section 列表中移除。
- 预期收益：
  - APK 预计减少 8-12M。
  - 实际结果：build arm64 APK 从 42.89 MB 降到 31.00 MB，减少 11.89 MB。
  - 实际结果：arm64 `libtauri_app_lib.so` 从 40.47 MB 降到 28.58 MB，减少 11.89 MB。
  - 实际结果：build arm64 AAB 从 17.63 MB 降到 15.40 MB，减少 2.23 MB。
- 风险：
  - 低。主要影响调试符号，不应影响运行逻辑。
- 完成后暂停点：
  - 你确认包体积和基本构建结果后，再进入 Step 3。

## Step 3：评估 APK native library 压缩

- 状态：已完成，真机安装验证通过
- 目标：降低自分发 APK 的下载体积。
- 主要依据：
  - 当前 APK 中 `libtauri_app_lib.so` 是 `stor`，没有压缩。
  - 临时压缩测试显示，strip 前 so gzip 后约 14M，strip 后约 12M。
- 改动范围：
  - 已修改 `packages/native/src-tauri/gen/android/app/build.gradle.kts`
  - 已在 release build 中设置 `jniLibs.useLegacyPackaging = true`。
- 关键评估点：
  - Android 版本对压缩 native libs 的加载行为。
  - 安装体积、安装耗时、启动加载的影响。
  - 自分发 APK 与应用商店 AAB 的取舍。
- 验证方式：
  - 已构建 APK/AAB。
  - 已使用 `bun run analyze:android-size` 确认 so 从 `stor` 变为 `defN`。
  - 已对比 APK 下载体积。
  - 真机安装运行验证通过。
- 预期收益：
  - 自分发 APK 可能进一步降到 20M 以内，具体取决于 Step 2 结果。
  - 实际结果：build arm64 APK 从 31.00 MB 降到 14.51 MB，减少 16.49 MB。
  - 实际结果：APK 内 `libtauri_app_lib.so` 从 28.58 MB / `stor` 变为 28.58 MB -> 12.09 MB / `defN`。
  - 实际结果：build arm64 AAB 保持 15.40 MB，符合预期。
- 风险：
  - 中等。需要谨慎验证 Android 安装和加载行为。
- 完成后暂停点：
  - 你确认是否接受 APK 压缩 native libs 的安装/运行取舍后，再进入 Step 4。

## Step 4：开启 Android 资源 shrink

- 状态：已完成，真机安装验证通过
- 目标：移除未使用的 Android 资源，压缩 `resources.arsc` 和 `res` 目录。
- 改动范围：
  - 已修改 `packages/native/src-tauri/gen/android/app/build.gradle.kts`
  - 已在 release build 中配合已有 `isMinifyEnabled = true` 开启 `isShrinkResources = true`。
- 验证方式：
  - 已构建 release APK/AAB。
  - 已对比 `resources.arsc`、`resources.pb` 和总体体积。
  - 真机检查图标、主题、文件选择、安装 APK 等 Android 侧功能验证通过。
- 预期收益：
  - 小到中等。
  - 实际结果：build arm64 APK 从 14.51 MB 降到 13.90 MB，减少 0.61 MB。
  - 实际结果：build arm64 AAB 从 15.40 MB 降到 15.07 MB，减少 0.33 MB。
  - 实际结果：APK `resources.arsc` 从 1010.15 KB 降到 591.39 KB。
- 风险：
  - 低到中等。动态引用资源可能被误删，需要验证。
- 完成后暂停点：
  - 你确认资源 shrink 没有引入问题后，再进入 Step 5。

## Step 5：清理 native 依赖重复和 feature

- 状态：进行中，Step 5B-1 已完成且真机验证通过
- 目标：减少 Rust native 依赖带来的代码体积。
- 当前观察：
  - native 中依赖 `aws-sdk-s3`、`aws-smithy-http-client`、`reqwest`、`tauri-plugin-http`、`turso`。
  - HTTP/TLS/SDK/数据库相关依赖是 native so 的主要体积来源之一。
- 改动范围：
  - `packages/native/src-tauri/Cargo.toml`
  - `packages/native/src-tauri/src/**/*`
  - 必要时涉及 `packages/app/src/**/*` 的调用路径。
- 处理顺序：
  - 先分析 `cargo tree` 和 feature。
  - 关闭明确无用的 feature。
  - 再评估能否减少重复 HTTP/TLS 依赖。
- Step 5A 结果：
  - 曾将 `tauri-plugin-http` 改为 `default-features = false`，仅保留 `rustls-tls` 和 `unsafe-headers`。
  - 构建通过。
  - build arm64 APK 从 13.90 MB 降到 13.82 MB，减少约 0.08 MB。
  - build arm64 AAB 从 15.07 MB 降到 14.99 MB，减少约 0.08 MB。
  - arm64 `libtauri_app_lib.so` 从 28.58 MB 降到 28.39 MB，减少约 0.19 MB。
  - APP 安装验证通过。
  - 因收益只有约 80 KB，且后续桌面端可能需要 Cookie、HTTP/2、charset 或 macOS 系统网络配置支持，已恢复 `Cargo.toml` 和 `Cargo.lock`，不采用该优化。
  - 详细记录见 `docs/android-package-size-step5a-http-feature-trim-0.7.9.md`。
- Step 5B 分析：
  - 目标是保留离线模式、本地模式获取上传 URL 能力，同时评估 native `aws-sdk-s3` 体积成本。
  - 当前 `aws-sdk-s3` 已经关闭默认 feature，仅保留 `rt-tokio` 和 `http-1x`，继续裁剪 feature 的空间有限。
  - 可先实验保留 AWS SDK，但用本地 no-op HTTP client 替换 `aws-smithy-http-client`；风险较低，收益需要实测。
  - 如果第一轮收益很小，再评估手写 S3 SigV4 presigned PUT URL，彻底移除 `aws-sdk-s3` 和大部分 AWS/Smithy runtime。
  - 详细分析见 `docs/android-package-size-step5b-aws-sdk-s3-analysis-0.7.9.md`。
- Step 5B-1 结果：
  - 已保留 `aws-sdk-s3` 的 presign 逻辑，移除 `aws-smithy-http-client`，改用本地 no-op HTTP client。
  - `cargo check` 通过。
  - Android release 构建通过。
  - `cargo tree --target aarch64-linux-android -i aws-smithy-http-client` 已无法匹配到包。
  - build arm64 APK 从 13.90 MB 降到 13.59 MB，减少约 0.31 MB。
  - build arm64 AAB 从 15.07 MB 降到 14.76 MB，减少约 0.31 MB。
  - arm64 `libtauri_app_lib.so` 从 28.58 MB 降到 27.85 MB，减少约 0.73 MB。
  - 详细记录见 `docs/android-package-size-step5b1-presign-http-client-0.7.9.md`。
  - 真机验证通过，可保留该优化。
- 验证方式：
  - 构建通过。
  - 对比 so、APK、AAB 体积。
  - 检查更新下载、文件上传、缓存图片、远程请求等路径。
- 预期收益：
  - 中等，不保证每个 feature 调整都有明显收益。
- 风险：
  - 中等。涉及网络、上传和本地能力。
- 完成后暂停点：
  - 你确认依赖瘦身方向后，再进入 Step 6。

## Step 6：评估移除客户端 AWS SDK 预签名逻辑

- 状态：待 Step 5 确认后执行
- 目标：尽量移除 `aws-sdk-s3` 和 `aws-smithy-http-client` 在客户端 native 包中的体积成本。
- 当前逻辑：
  - native 的 `upload_token` 会在客户端生成 S3 presigned URL。
  - server 侧也具备 S3 相关能力。
- 目标方案：
  - 远程模式：统一由 server 生成上传 URL。
  - 本地模式：保留可用降级策略，避免破坏本地数据和上传流程。
  - native：只保留文件读取、进度上报和按 URL 上传。
- 改动范围：
  - `packages/native/src-tauri/src/command/upload.rs`
  - `packages/native/src-tauri/Cargo.toml`
  - `packages/app/src/service`、上传组件和配置读取逻辑
  - 可能涉及 `packages/server/src/lib/bitiful.ts` 或相关接口
- 验证方式：
  - 远程模式上传可用。
  - 本地模式上传或降级提示符合预期。
  - 大文件上传进度正常。
  - 对比移除 AWS SDK 前后的 so、APK、AAB 体积。
- 预期收益：
  - 可能减少数 MB，并降低 native 复杂度。
- 风险：
  - 较高。涉及接口行为和本地/远程兼容，必须单独设计和验证。
- 完成后暂停点：
  - 你确认功能兼容后，再考虑进入更激进的优化。

## 暂不优先处理

- 前端资源压缩：当前 `dist` 约 2.4M，不是主要矛盾。
- 图标资源压缩：当前图标体积很小，收益有限。
- 大规模重构 Tauri 插件：风险较高，应在前几步收益明确后再评估。

## 预期里程碑

- 完成 Step 2：APK 预计从约 43M 降到约 32-34M。
- 完成 Step 3：自分发 APK 可能进一步明显下降，但需确认安装和运行取舍。
- 完成 Step 4：获得小幅资源收益。
- 完成 Step 5-6：进入依赖和架构级瘦身，收益不确定但长期价值更高。
