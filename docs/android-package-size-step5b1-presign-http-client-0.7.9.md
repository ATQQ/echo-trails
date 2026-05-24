# Android 包体积 Step 5B-1 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：
  - `cargo check`
  - `bun run tauri android build --target aarch64 --split-per-abi --apk true --aab true`
  - `bun run analyze:android-size`
- 优化项：保留 `aws-sdk-s3` 的 presign 逻辑，移除 `aws-smithy-http-client`，改用本地 no-op HTTP client。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 为准。
- 验证结论：真机验证通过，可保留该优化。

## 改动内容

- `Cargo.toml`：
  - 移除直接依赖 `aws-smithy-http-client`。
  - 增加 `aws-smithy-runtime-api`，用于实现最小 HTTP client trait。
- `upload.rs`：
  - 新增 `PresignOnlyHttpClient` / `PresignOnlyHttpConnector`。
  - `upload_token` 仍使用 `aws_sdk_s3::Client` 和 `.presigned()` 生成 PUT URL。
  - no-op connector 正常 presign 时不会发起网络请求；如果未来代码路径意外尝试发送 S3 HTTP 请求，会返回明确错误。

## 对比摘要

| 指标 | Step 4 结果 | Step 5B-1 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 13.90 MB | 13.59 MB | -0.31 MB |
| build arm64 AAB | 15.07 MB | 14.76 MB | -0.31 MB |
| arm64 `libtauri_app_lib.so` | 28.58 MB | 27.85 MB | -0.73 MB |
| APK `libtauri_app_lib.so` 压缩后 | 12.09 MB | 11.79 MB | -0.30 MB |

## 依赖变化

`cargo tree --target aarch64-linux-android -i aws-smithy-http-client` 已无法匹配到包，说明 `aws-smithy-http-client` 不再进入 Android 目标依赖树。

`Cargo.lock` 中同步移除了：

- `aws-smithy-http-client`
- `rustls-native-certs`
- `openssl-probe`
- `schannel`
- `security-framework`
- `security-framework-sys`

## 结论

- 构建通过，体积收益约 310 KB APK / 730 KB native so。
- 比 Step 5A 的约 80 KB 收益更明确，但仍属于小幅优化。
- 因为签名仍由 AWS SDK 生成，功能风险低于手写 SigV4。
- 真机验证通过，可保留该优化。

## 建议验证点

- 本地模式上传图片成功。
- 本地模式上传视频成功。
- 远程模式默认 server token 上传成功。
- 远程模式开启原生上传 token 后上传成功。
- 文件 key 包含中文、空格、括号时上传成功。
- 上传后图片预览、封面、缓存加载正常。

## 关键分析输出

```text
## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| build arm64 APK | 13.59 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build arm64 AAB | 14.76 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.23 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 27.85 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 27.85 MB | 11.79 MB | defN |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 591.39 KB | 591.39 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 27.85 MB | 11.79 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.01 MB | 251.89 KB | defN |
```
