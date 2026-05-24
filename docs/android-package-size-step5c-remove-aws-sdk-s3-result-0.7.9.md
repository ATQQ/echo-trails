# Android 包体积 Step 5C 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：
  - `cargo test s3_presign`
  - `bun run tauri android build --target aarch64 --split-per-abi --apk true --aab true`
  - `bun run analyze:android-size`
- 优化项：移除 native `aws-sdk-s3` 和 AWS/Smithy runtime，改用本地轻量 S3 SigV4 presigned PUT URL 实现。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 为准。
- 当前验证结论：构建和单元测试通过，待真机上传验证。

## 改动内容

- `Cargo.toml`：
  - 移除 `aws-sdk-s3`。
  - 移除 `aws-smithy-runtime-api`。
  - 增加直接依赖 `ring`，用于 HMAC-SHA256 和 SHA256。
- `upload.rs`：
  - `upload_token` 不再构造 AWS SDK client。
  - 保持命令入参与返回结构不变，前端调用路径不变。
  - 继续生成 3600 秒有效的 S3 presigned PUT URL。
- `s3_presign.rs`：
  - 新增 path-style S3 SigV4 query-string presign 实现。
  - 保持当前 SDK 的 path-style 行为：`/<bucket>/<key>`。
  - payload 使用 `UNSIGNED-PAYLOAD`。
  - 只签 `host` header，避免不同上传路径的 header 差异导致签名失败。

## 对比摘要

| 指标 | Step 5B-1 结果 | Step 5C 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 13.59 MB | 11.88 MB | -1.71 MB |
| build arm64 AAB | 14.76 MB | 13.05 MB | -1.71 MB |
| arm64 `libtauri_app_lib.so` | 27.85 MB | 24.07 MB | -3.78 MB |
| APK `libtauri_app_lib.so` 压缩后 | 11.79 MB | 10.08 MB | -1.71 MB |

相对 Step 4：

| 指标 | Step 4 结果 | Step 5C 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 13.90 MB | 11.88 MB | -2.02 MB |
| build arm64 AAB | 15.07 MB | 13.05 MB | -2.02 MB |
| arm64 `libtauri_app_lib.so` | 28.58 MB | 24.07 MB | -4.51 MB |

## 依赖变化

以下命令均已无法匹配到包：

```text
cargo tree --target aarch64-linux-android -i aws-sdk-s3
cargo tree --target aarch64-linux-android -i aws-sigv4
cargo tree --target aarch64-linux-android -i aws-smithy-runtime-api
```

`Cargo.lock` 中也已无 `aws-*` / `aws-smithy-*` 相关包。

## 单元测试

已新增 4 个签名测试：

- 普通 key 与 AWS SDK 输出完全一致。
- 中文、空格、`+`、括号、`#`、`%` 特殊字符 key 与 AWS SDK 输出完全一致。
- endpoint 无协议时自动补 `https://`。
- endpoint 带 path 时拒绝，避免签名 URL 不一致。

测试结果：

```text
running 4 tests
test command::s3_presign::tests::rejects_endpoint_with_path ... ok
test command::s3_presign::tests::signs_simple_key_like_aws_sdk ... ok
test command::s3_presign::tests::signs_special_characters_like_aws_sdk ... ok
test command::s3_presign::tests::normalizes_endpoint_without_scheme ... ok
```

## 结论

- Step 5C 收益明显，超过之前设定的 500 KB 回滚线。
- 构建通过，签名测试通过。
- 由于已经不依赖 AWS SDK，后续维护重点转移到 S3 SigV4 签名兼容性。
- 真机验证通过前，不建议继续做下一项优化。

## 建议真机验证点

- 本地模式上传图片成功。
- 本地模式上传视频成功。
- 远程模式开启原生上传 token 后上传成功。
- 文件名包含中文、空格、括号、`+`、`#`、`%` 时上传成功。
- 上传后图片预览、封面、缓存加载正常。
- 配置 endpoint 为 `s3.bitiful.net` 和 `https://s3.bitiful.net` 时都能生成有效上传 URL。

## 关键分析输出

```text
## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| build arm64 APK | 11.88 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build arm64 AAB | 13.05 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.23 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 24.07 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 24.07 MB | 10.08 MB | defN |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 591.39 KB | 591.39 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 24.07 MB | 10.08 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.01 MB | 251.89 KB | defN |
```
