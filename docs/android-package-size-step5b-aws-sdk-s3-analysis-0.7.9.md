# Android 包体积 Step 5B 分析：native `aws-sdk-s3` 优化

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 分析目标：在保留离线模式、本地模式获取上传 URL 能力的前提下，评估 native 侧 `aws-sdk-s3` 的优化空间。
- 当前结论：可以优化，但不建议直接移除功能。推荐先做低风险实验，再决定是否进入轻量签名重写。

## 当前链路

前端 `getUploadUrl(key)` 当前路由：

- Tauri + 本地模式：调用 native `upload_token`，由客户端本地配置生成 S3 presigned PUT URL。
- Tauri + 远程模式 + 开启原生 S3 上传 Token：同样调用 native `upload_token`。
- 远程模式默认：调用 server `file/upload/token`，由服务端生成 presigned PUT URL。

native `upload_token` 当前做的事情：

- 校验 `endpoint`、`bucket`、`access_key`、`secret_key`。
- 构造 `aws_sdk_s3::Client`。
- 使用 `put_object().bucket().key().presigned()` 生成 1 小时有效的上传 URL。
- 实际不会发起网络请求，只做本地签名。

## 当前依赖状态

`Cargo.toml` 中已经做过基础裁剪：

```toml
aws-sdk-s3 = { version = "1", default-features = false, features = ["rt-tokio", "http-1x"] }
aws-smithy-http-client = { version = "1", features = ["rustls-ring"] }
```

也就是说，继续靠关闭 `aws-sdk-s3` feature 的空间已经不大。主要体积来自整个 AWS/Smithy SDK 栈：

- `aws-sdk-s3`
- `aws-runtime`
- `aws-sigv4`
- `aws-smithy-runtime`
- `aws-smithy-runtime-api`
- `aws-smithy-types`
- `aws-smithy-http`
- `aws-smithy-json`
- `aws-smithy-xml`
- `aws-smithy-checksums`
- `aws-smithy-eventstream`
- `aws-smithy-http-client`

本地源码体积参考：

| 依赖 | registry 源码体积 |
| --- | ---: |
| `aws-sdk-s3` | 17 MB |
| `aws-sigv4` | 3.4 MB |
| `aws-smithy-runtime` | 800 KB |
| `aws-smithy-runtime-api` | 528 KB |
| `aws-smithy-http-client` | 492 KB |
| `aws-runtime` | 528 KB |

源码体积不等于最终 so 体积，但能说明 SDK 栈本身比较重。

## 可选方案

### 方案 A：保留 `aws-sdk-s3`，去掉 `aws-smithy-http-client`

思路：

- 因为 `upload_token` 只做 presign，不会真正请求 S3。
- 当前引入 `aws-smithy-http-client` 只是为了给 AWS SDK 塞一个不会读系统证书的 HTTP client。
- 可以尝试用 `aws-smithy-runtime-api` 实现一个极小的 no-op HTTP client，避免引入 `aws-smithy-http-client`、`rustls-native-certs` 以及它带来的部分 HTTP/TLS 代码。

收益预估：

- 小到中等。
- 因为 `reqwest`、`tauri-plugin-http` 已经会引入 `hyper`、`rustls` 等依赖，去掉 `aws-smithy-http-client` 不一定能省很多。
- 需要实测，预计压缩后 APK 收益可能低于 1 MB。

风险：

- 低到中等。
- S3 presign 仍由 AWS SDK 生成，签名正确性风险低。
- 但需要接触 `aws-smithy-runtime-api` 的 HTTP trait，后续 SDK 升级可能有兼容成本。

建议：

- 可以作为 Step 5B 的第一轮实验。
- 如果收益小于 300 KB，建议像 Step 5A 一样恢复，不保留。

### 方案 B：移除 `aws-sdk-s3`，native 手写 S3 SigV4 presigned PUT URL

思路：

- 当前只需要生成一个 `PUT /bucket/key` 的 presigned URL。
- 不需要 S3 List/Get/Delete/Multipart 等 SDK 能力。
- 可以用轻量 Rust 实现 AWS Signature V4：
  - canonical request
  - credential scope
  - string to sign
  - HMAC-SHA256 signing key
  - `X-Amz-*` query 参数
- 只保留 `upload_file` 的 `reqwest PUT` 上传能力。

可能新增的轻量依赖：

- `hmac`
- `sha2`
- 可选 `hex`

收益预估：

- 中等到明显。
- 这是最可能真正减少 native so 的方案，因为可以移除 `aws-sdk-s3` 和大部分 AWS/Smithy runtime。
- 实际收益必须构建验证；保守预估压缩后 APK 可能减少约 0.8-2 MB，未压缩 so 可能减少数 MB。

风险：

- 中等偏高。
- 主要风险不是上传流程，而是签名细节：
  - S3 path-style URL：当前 SDK 使用 `force_path_style(true)`，手写也要保持 `/bucket/key`。
  - key 的 URL 编码要和 S3 规范一致，尤其是空格、中文、`+`、`!`、`/`。
  - endpoint 带 path、query、端口时要处理清楚。
  - 当前配置没有 session token；如果未来支持临时凭证，需要追加 `X-Amz-Security-Token`。
  - 上传时如果未来要签 `content-type`、`x-amz-*` header，签名逻辑也要同步扩展。

建议：

- 可以做，但必须作为单独实验步骤。
- 需要增加单元测试，对比固定输入生成的 canonical request、signature、URL。
- 真机验证必须覆盖本地模式上传、远程模式原生 token 上传、中文/空格文件名上传。

### 方案 C：把 presigned URL 生成挪到前端 TypeScript

思路：

- 本地 S3 配置本来已经在前端读取，再传给 native。
- 可以在前端用 Web Crypto 或轻量 JS HMAC-SHA256 生成 presigned URL。
- native 只保留 `upload_file`，彻底移除 Rust AWS SDK。

收益预估：

- native 体积收益接近方案 B。
- JS bundle 只会小幅增加。

风险：

- 中等。
- 需要确认 Android WebView、桌面 WebView 的 HMAC 能力；如果使用纯 JS crypto 库，兼容性更稳定但前端包会增加一点。
- 签名细节风险和方案 B 类似。

建议：

- 如果希望 native 更轻，这是长期更干净的方向。
- 但当前任务聚焦 native，优先考虑方案 B。

## 推荐执行顺序

1. 先做方案 A 的实验：保留 AWS SDK，只替换 `aws-smithy-http-client` 为本地 no-op HTTP client。
2. 构建并记录 APK/AAB/so 变化。
3. 如果收益明显且功能验证通过，则保留。
4. 如果收益很小，则恢复。
5. 再决定是否做方案 B：手写 SigV4，彻底移除 `aws-sdk-s3`。

## 验证清单

- 构建通过。
- `bun run analyze:android-size` 对比 Step 4。
- 本地模式上传图片成功。
- 本地模式上传视频成功。
- 远程模式默认 server token 上传成功。
- 远程模式开启原生上传 token 后上传成功。
- 文件 key 包含中文、空格、括号时上传成功。
- 上传后图片预览、封面、缓存加载正常。

## 当前建议

可以优化，但不要直接进入大改。

下一步建议先做 Step 5B-1：`aws-smithy-http-client` no-op 替换实验。它保持 AWS SDK 生成签名，风险相对低；如果构建结果显示收益不明显，就恢复并跳过，避免像 Step 5A 一样为小收益承担长期兼容成本。
