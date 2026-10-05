# 发版手册（CI 构建 + 本地推送部署）

> 适用对象：Android、桌面端、Web、Server。
> 核心约束：**GitHub Actions 只负责构建，不接触部署密钥**；APK 上传 CDN、Web/Server 部署都在本地完成。

## 1. 角色与分工

| 角色 | 职责 |
| --- | --- |
| 执行者（Agent） | 前置检查、升版本、更新 CHANGELOG、打 tag、触发并等待 CI、下载产物、上传 CDN、部署 Web/Server、终态校验 |
| 人工（User） | 只 check 三项：**版本号**、**CHANGELOG**、**最终线上结果**（其余步骤静默执行） |

原则：

1. 任一环节失败立即停止，不带着异常继续发。
2. 升级版本、CHANGELOG、部署命令都由本地脚本静默完成，不要求人工交互。
3. 涉及生产部署（Web / Server）时，先给出「版本 + CHANGELOG + 变更摘要」，确认后再执行最后两步。

## 2. 一次性本地准备

- `git`、`gh`（已 `gh auth login`，有 repo / workflow 权限）、`bun`、`node`。
- `kite` CLI 已登录（`kite config` 能看到 token），项目为 `packages/app/kite.config.prod.json`、`packages/server/kite.config.prod.json`。
- 根目录 `.bitiful.env.local` 存在且包含 `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION`（**不入库**）。
- 工作区干净，当前分支 `main` 且与远端同步。

## 3. 事实源与产物流向

```
版本源 packages/app/package.json ──upgrade──▶ tauri.conf.json / Cargo.toml / Cargo.lock /
                                              server package.json / public/version.json / public/update.json

tag vX.Y.Z ──▶ GitHub Actions(release.yml)
                 ├─ build-android   → GitHub Release APK + meta
                 ├─ build-desktop   → GitHub Release 各平台安装包 + meta/sig
                 ├─ sync-md5        → 回写 update.json / version.json 到 main
                 └─ publish-latest-json → 回写 latest.json 到 main + Release

本地 ──▶ 下载 APK ──▶ 上传 Bitiful CDN ──▶ update.json 里的 downloadUrl 生效
本地 ──▶ Deploy Web ──▶ photo.sugarat.top 上的 update.json / version.json / latest.json 生效
本地 ──▶ Deploy Server ──▶ 后端接口生效
```

关键地址：

- APK CDN：`https://three-source.cdn.sugarat.top/echo-trails/release/echo-trails-release-<version>.apk`
- Web：`https://photo.sugarat.top`
- 更新检查（原生 `check_update`）优先读：`https://photo.sugarat.top/update.json`
- 兜底：GitHub `releases/latest/download/latest.json`、`raw.githubusercontent.com`、`jsdelivr`

## 4. 标准发版流程

以下命令均在仓库根目录执行，`<version>` 形如 `0.9.3`，`<tag>` 形如 `v0.9.3`。

### Step 0 前置检查

```bash
git status --short
git pull --ff-only
gh auth status
kite config
node -e "console.log(require('./packages/app/package.json').version)"
```

要求：工作区干净；`gh` 已登录；`kite` token 可用；记住 `currentVersion`。

### Step 1 升版本 + 更新 CHANGELOG（本地静默）

```bash
bun run upgrade -- --version <version> --desc "<一句话发布说明>"
```

- 该命令会同步更新：`packages/app/package.json`、`packages/server/package.json`、`packages/native/src-tauri/tauri.conf.json`、`Cargo.toml`、`Cargo.lock`、`packages/app/public/version.json`、`packages/app/public/update.json`（新版本 md5 清空、downloadUrl 换版本号）。
- 也可用 `--patch` 自动取下一个 patch 版本。
- 随后按 `git log <lastTag>..HEAD --pretty=format:'%s'` 生成 CHANGELOG 条目，按现有格式归类到 `### Feature` / `### Bug Fixes` / `### Chore`。

**人工检查点 1（User）**：确认版本号与 CHANGELOG 内容。

```bash
git diff --stat
git diff -- CHANGELOG.md packages/app/package.json packages/native/src-tauri/tauri.conf.json
```

### Step 2 提交、打 tag、推送

```bash
git add CHANGELOG.md \
  packages/app/package.json packages/server/package.json \
  packages/native/src-tauri/tauri.conf.json \
  packages/native/src-tauri/Cargo.toml packages/native/src-tauri/Cargo.lock \
  packages/app/public/version.json packages/app/public/update.json
git commit -m "chore(release): <tag>"
git tag <tag>
git push origin main
git push origin <tag>
```

注意：确保只提交版本相关文件，不要 `git add -A` 把本机 IP 改动（`capabilities/default.json`、`tauri.conf.json` 的 devUrl）或 `bun.lockb` 格式变更带进去。

### Step 3 触发并等待 CI

```bash
bun run release:trigger -- --yes
gh run list --workflow=release.yml -L 1
gh run watch <runId> --exit-status
```

- CI 会校验 `tauri.conf.json` 版本 == tag，不一致会直接失败。
- 四个 job 全部成功才算通过：`build-android`、`build-desktop`、`sync-md5`、`publish-latest-json`。

### Step 4 拉回 CI 的元数据提交并校验

```bash
git pull --ff-only
git log --oneline -3
node -e "const u=require('./packages/app/public/update.json');console.log(u.android[0])"
cat packages/app/public/latest.json | head -20
```

要求：`update.json` 头部的 `version` 等于 `<version>`，且带有 `md5`；main 上有 bot 的 `chore(release): sync APK md5@<tag>` 提交。

### Step 5 下载 APK 产物

```bash
bun run release:download -- --pattern "echo-trails-release-*.apk"
ls -lh release/
```

### Step 6 校验 md5 并上传 CDN

```bash
# 1) 本地 APK 的 md5
bun -e 'const c=require("crypto"),f=require("fs");console.log(c.createHash("md5").update(f.readFileSync(process.argv[1])).digest("hex"))' release/echo-trails-release-<version>.apk

# 2) 与 update.json 里的 md5 对比，必须完全一致
node -e "const u=require('./packages/app/public/update.json');console.log(u.android[0].md5)"

# 3) 上传到 Bitiful CDN
bun run upload:apk -- --file release/echo-trails-release-<version>.apk
```

上传后校验 CDN 可下载（期望 200/206）：

```bash
curl -sI -H "Range: bytes=0-0" "https://three-source.cdn.sugarat.top/echo-trails/release/echo-trails-release-<version>.apk" | head -5
```

> md5 不一致时**禁止继续部署**：说明下载到的不是 CI 构建的那份产物，需重新下载或重跑 CI。

### Step 7 部署 Web

必须在 Step 4 之后执行，保证把 CI 回写的 `update.json` / `version.json` / `latest.json` 一起发上去。

```bash
bun run deploy:client
curl -s "https://photo.sugarat.top/update.json?t=$(date +%s)" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const u=JSON.parse(s);console.log(u.android)})"
```

要求：线上 `update.json` 的 `version` / `md5` / `downloadUrl` 与 main 一致。

### Step 8 部署 Server（有后端变更时）

```bash
bun run deploy:server
```

### Step 9 终态校验与交付

```bash
gh release view <tag> --json assets --jq '.assets[].name'
curl -s "https://photo.sugarat.top/version.json?t=$(date +%s)" | head -20
```

**人工检查点 2（User）**：确认线上版本号、CHANGELOG、更新提示（`发现新版本`）正常。

## 5. 一键命令清单（Agent 版）

```bash
VERSION=0.9.3
DESC="修复 xxx"

git pull --ff-only
bun run upgrade -- --version "$VERSION" --desc "$DESC"
# 生成 CHANGELOG 条目
git add CHANGELOG.md packages/app/package.json packages/server/package.json \
  packages/native/src-tauri/tauri.conf.json packages/native/src-tauri/Cargo.toml \
  packages/native/src-tauri/Cargo.lock packages/app/public/version.json packages/app/public/update.json
git commit -m "chore(release): v$VERSION"
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

bun run release:trigger -- --yes
gh run list --workflow=release.yml -L 1
gh run watch <runId> --exit-status

git pull --ff-only
bun run release:download -- --pattern "echo-trails-release-*.apk"
bun run upload:apk -- --file "release/echo-trails-release-$VERSION.apk"
bun run deploy:client
bun run deploy:server
```

## 6. 失败处理与回滚

| 场景 | 处理 |
| --- | --- |
| CI 构建失败 | 修复代码后重跑 `gh run rerun <runId>`；若版本/tag 打错，本地 `git tag -d <tag>` + `git push origin :refs/tags/<tag>` 后重打 |
| `publish-latest-json` 回写 main 失败 | 它的同步步骤是 `continue-on-error`，检查 main 是否有 `latest.json`；没有则本地补一次提交或重跑该 job |
| APK md5 不一致 | 不部署，重新 `release:download`；仍不一致则重跑 CI 构建 |
| CDN 上传失败 | 重试 `upload:apk`；确认 `.bitiful.env.local` 与 bucket 正确 |
| Web 部署后 update.json 仍旧 | 确认已 `git pull`，再重新 `deploy:client` |
| 需要回滚 Web/Server | `kite rollback <projectId>`，或在 Kite 控制台选择历史版本回滚 |
| 需要回滚客户端更新 | 旧版本仍在 `update.json` 历史数组里，把 `version.json` 的 android 指向旧版本并重新部署 Web |

## 7. 当前自动化能力

已支持非交互执行：

- 升版本：`bun run upgrade -- --version <v> --desc "<desc>"`（也支持 `--patch`）。
- 触发 CI：`bun run release:trigger -- --yes`。
- 下载产物：`bun run release:download -- --pattern "<glob>"` 或 `--all`。
- 上传 CDN：`bun run upload:apk -- --file <path>`（会打印 md5）。

仍需执行者判断（不可脚本化）：

- CHANGELOG 归类与发布说明措辞。
- `forceUpdate` 是否需要开启。
- 生产部署前的人工确认。

未做（受境外 CI 无法持有密钥限制）：

- CI 内直传 Bitiful CDN、CI 内 `kite push` 部署。
- tag push 自动触发（当前为 `workflow_dispatch`）。
