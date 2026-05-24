# Android 包体积 Step 5C 分析：移除 native `aws-sdk-s3`

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 分析目标：评估是否用轻量 S3 SigV4 presigned PUT URL 实现替换 native `aws-sdk-s3`。
- 当前结论：有优化空间，但风险明显高于 Step 5B-1；建议作为独立实验执行，必须先加签名单元测试，再构建验证和真机上传验证。

## 当前状态

Step 5B-1 后，native 仍保留：

```toml
aws-sdk-s3 = { version = "1", default-features = false, features = ["rt-tokio", "http-1x"] }
aws-smithy-runtime-api = "1"
```

`upload_token` 当前仍使用 AWS SDK 的 `put_object().presigned()` 生成 URL，只是 HTTP client 替换成了 no-op client。

当前体积：

| 指标 | 当前结果 |
| --- | ---: |
| build arm64 APK | 13.59 MB |
| build arm64 AAB | 14.76 MB |
| arm64 `libtauri_app_lib.so` | 27.85 MB |
| APK 内 so 压缩后 | 11.79 MB |

## 当前 AWS 依赖链

当前只有 `aws-sdk-s3` 直接引入 S3/AWS 签名相关依赖：

```text
aws-sdk-s3
├── aws-runtime
├── aws-sigv4
├── aws-smithy-async
├── aws-smithy-checksums
├── aws-smithy-eventstream
├── aws-smithy-http
├── aws-smithy-json
├── aws-smithy-observability
├── aws-smithy-runtime
├── aws-smithy-runtime-api
├── aws-smithy-types
├── aws-smithy-xml
└── aws-types
```

本地 registry 源码体积参考：

| 依赖 | 源码体积 |
| --- | ---: |
| `aws-sdk-s3` | 17 MB |
| `aws-sigv4` | 3.4 MB |
| `aws-smithy-runtime` | 800 KB |
| `aws-smithy-runtime-api` | 528 KB |
| `aws-runtime` | 528 KB |
| `aws-smithy-types` | 644 KB |
| `aws-smithy-checksums` | 112 KB |
| `aws-smithy-eventstream` | 208 KB |
| `aws-smithy-json` | 184 KB |
| `aws-smithy-xml` | 124 KB |

源码体积不等于最终 so 体积，但能说明该 SDK 栈对“只生成一个 PUT presigned URL”的场景偏重。

## 方案

用本地轻量实现替换 AWS SDK：

- 保留 native 命令名 `upload_token`，前端调用不变。
- 只实现 S3 SigV4 query-string presign，方法固定为 `PUT`。
- 继续使用 path-style URL，保持当前 SDK 的 `.force_path_style(true)` 行为：
  - `https://s3.bitiful.net/<bucket>/<key>?X-Amz-*`
- 签名有效期保持 3600 秒。
- 默认只签 `host` header，payload 使用 `UNSIGNED-PAYLOAD`。
- `upload_file` 仍使用现有 `reqwest PUT`，不改上传逻辑。

推荐依赖策略：

- 优先直接使用 `ring` 的 HMAC/SHA256。
- `ring` 目前已经由 `rustls/reqwest` 引入，新增直接依赖通常不会额外增加 native 体积。
- URL 编码建议手写，不依赖通用 `encodeURIComponent` 风格函数。

## 预期收益

收益比 Step 5B-1 更可能明显，因为可以移除整个 AWS/Smithy SDK 栈。

保守预估：

| 指标 | 预估收益 |
| --- | ---: |
| arm64 `libtauri_app_lib.so` | -1 MB 到 -3 MB |
| build arm64 APK | -0.4 MB 到 -1.5 MB |
| build arm64 AAB | -0.4 MB 到 -1.5 MB |

实际收益必须以构建结果为准。由于 APK 中 so 已压缩，APK 收益会小于未压缩 so 的收益。

## 主要风险

### 1. URL 编码风险，最高

当前 key 由前端生成，包含原始文件名：

```text
<prefix>/<username>/<operator>/<date>/<time>-<timestamp>-<fileInfo.name>
```

因此 key 可能包含：

- 中文
- 空格
- 括号
- `+`
- `#`
- `%`
- 其他用户文件名里的特殊字符

AWS 官方 SigV4 文档要求：

- 空格必须编码成 `%20`，不能是 `+`。
- percent hex 字母必须大写。
- 除未保留字符外，每个字节都要 URI encode。
- S3 object key 里的 `/` 不编码，其他位置的 `/` 要按规则处理。
- 官方提醒平台内置 UriEncode 可能不符合 S3 签名要求，建议自定义实现。

这是手写方案最容易出错的地方。

### 2. Path-style URL 兼容风险

当前 SDK 配置了 `force_path_style(true)`。手写实现必须保持：

```text
canonical_uri = /<bucket>/<key>
```

而不是：

```text
canonical_uri = /<key>
host = <bucket>.<endpoint-host>
```

Bitiful 当前 endpoint 是 `https://s3.bitiful.net`，path-style 应该继续可用，但如果以后换成只支持 virtual-hosted-style 的 S3 服务，需要额外适配。

### 3. endpoint 解析风险

需要明确处理：

- endpoint 无协议时补 `https://`。
- endpoint 带端口时，host header 要包含端口。
- endpoint 带尾部 `/` 时不要生成双斜杠。
- endpoint 如果自带 path/query，应先限制或明确报错；否则签名和最终 URL 容易不一致。

### 4. Header 签名风险

当前 `upload_file` 只额外设置：

```text
Content-Length
```

建议手写 URL 只签 `host`，不要签 `content-length`、`content-type`。否则前端 Web 上传、native 上传、不同平台 HTTP client 的 header 差异都可能导致签名失败。

### 5. 临时凭证扩展风险

当前配置只有 access key / secret key，没有 session token。

如果未来支持 STS 临时凭证，需要额外支持：

```text
X-Amz-Security-Token
```

并纳入 canonical query string。

### 6. 时间和时区风险

SigV4 要求使用 UTC 时间：

```text
yyyyMMdd'T'HHmmss'Z'
```

当前项目已有 `chrono`，实现时应明确使用 UTC，避免本地时区影响。

## 测试要求

这一步不建议只靠真机上传验证。建议先加 Rust 单元测试：

1. AWS 官方示例测试：
   - 使用官方固定 access key / secret key / region / time。
   - 对比 canonical request、string to sign、signature。
2. Path-style PUT 测试：
   - endpoint：`https://s3.bitiful.net`
   - bucket：固定 bucket
   - key：`photos/a.jpg`
3. 编码测试：
   - key：`中文 空格+(1)#%.jpg`
   - 确认 canonical URI 和最终 URL 编码一致。
4. endpoint 测试：
   - `s3.bitiful.net`
   - `https://s3.bitiful.net`
   - `https://s3.bitiful.net/`
   - `https://s3.bitiful.net:443`
5. 上传链路真机验证：
   - 本地模式上传图片成功。
   - 本地模式上传视频成功。
   - 远程模式开启原生上传 token 后上传成功。
   - 中文、空格、括号文件名上传成功。
   - 上传后预览、封面、缓存加载正常。

## 回滚条件

实验后如果出现以下情况，建议恢复 AWS SDK：

- APK 收益小于 500 KB。
- 中文/空格/特殊字符 key 上传不稳定。
- 需要兼容多个 S3-like 服务但无法确认签名差异。
- 实现代码超过 150-200 行且测试仍难覆盖主要分支。
- 后续计划支持 STS、multipart upload、额外 `x-amz-*` header。

## 推荐决策

建议可以做，但要按“实验分支”心态推进：

1. 新增轻量 `s3_presign` 模块和单元测试。
2. 先在 native 本地 `cargo test` 中验证签名输出。
3. 替换 `upload_token`，移除 `aws-sdk-s3` 和 `aws-smithy-runtime-api`。
4. Android release 构建并记录体积变化。
5. 真机验证上传。
6. 如果 APK 收益低于 500 KB 或上传验证有任何边角问题，恢复 AWS SDK。

## 参考

- AWS IAM SigV4 signing process: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
- Amazon S3 SigV4 query-string authentication: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
