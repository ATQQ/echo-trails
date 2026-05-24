# Android 包体积 Step 5A 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：
  - `bun run tauri android build --target aarch64 --split-per-abi --apk true --aab true`
  - `bun run analyze:android-size`
- 优化项：关闭 `tauri-plugin-http` 的默认 feature，仅保留当前需要的 `rustls-tls` 和 `unsafe-headers`。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 为准。
- 最终决策：APP 验证通过，但收益只有约 80 KB；考虑后续桌面端可能需要 Cookie、HTTP/2、charset 或 macOS 系统网络配置支持，已恢复代码配置，本优化不采用。

## 改动内容

```toml
tauri-plugin-http = { version = "2", default-features = false, features = ["rustls-tls", "unsafe-headers"] }
```

本次移除的默认 feature 主要包括：

- `cookies`
- `http2`
- `charset`
- `macos-system-configuration`

## 对比摘要

| 指标 | Step 4 结果 | Step 5A 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 13.90 MB | 13.82 MB | -0.08 MB |
| build arm64 AAB | 15.07 MB | 14.99 MB | -0.08 MB |
| arm64 `libtauri_app_lib.so` | 28.58 MB | 28.39 MB | -0.19 MB |
| APK `libtauri_app_lib.so` 压缩后 | 12.09 MB | 12.02 MB | -0.07 MB |
| AAB `base/resources.pb` | 1.01 MB | 1.01 MB | 0 MB |

## 结论

- Step 5A 构建通过，方向正确但收益很小，APK/AAB 大约各减少 80 KB。
- `Cargo.lock` 中确实移除了 cookie store、HTTP/2、charset 编码、部分系统配置相关依赖。
- 因为收益较小，这项优化更像“顺手清理无用能力”，不是主要体积矛盾。
- 主要风险在网络兼容性，需要真机验证 Tauri HTTP 相关请求、图片缓存、更新检查和上传下载链路。
- 最终已恢复 `Cargo.toml` 和 `Cargo.lock`，保留本文件作为实验记录。

## 建议验证点

- 登录后远程 API 请求正常。
- 图片列表、图片预览、缓存图片加载正常。
- 文件上传、下载、更新检查正常。
- 如果有依赖 Cookie、HTTP/2-only 服务或非 UTF-8 响应的接口，需要重点验证。

## 关键分析输出

```text
## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| build arm64 APK | 13.82 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build arm64 AAB | 14.99 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.23 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 28.39 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 28.39 MB | 12.02 MB | defN |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 591.39 KB | 591.39 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 28.39 MB | 12.02 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.01 MB | 251.89 KB | defN |
```
