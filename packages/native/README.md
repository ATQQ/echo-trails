<div align="center">
  <a href="https://github.com/ATQQ/echo-trails">
    <img src="./../../logo.png" alt="Logo" width="120" height="120">
  </a>

  <h3>记忆的回响 | echo-trails</h3>
  <p>
    <a href="https://photo.sugarat.top">Website</a>
    ·
    <a href="https://github.com/ATQQ/echo-trails/releases/latest">Releases</a>
    <br />
    <br />
  </p>
   <p>一个私人的相册APP</p>
</div>

<!-- TODO：网页截图 -->

_“echo” 可以象征着记忆的回响，过去的经历像回声一样在这些 “trails” 上徘徊，每当走过，就能听到记忆的声音。_

## 👋🏻 Getting Started

```sh
bun install
```

修改 tauri.conf.json 中 `devUrl` 和 `VITE_BASE_ORIGIN` 为当前设备的局域网地址

```json
{
  "build": {
    "beforeDevCommand": "cd ../app && VITE_BASE_ORIGIN=http://192.168.31.173:1420 TAURI=true bun run dev",
    "devUrl": "http://192.168.31.173:1420"
  }
}
```

```sh
# android
bun run dev:android
```

## 静默 OTA 热更新（Android + 桌面）

壳启动后会优先从本地 OTA 目录读取前端资源，缺失时回退到壳内置资源；因此**纯前端改动无需重新构建发版**。

- 目录：`AppLocalData/ota/{staging,current,previous}`，查找顺序 `current → previous → 内置资源`。
- 静默流程：启动后静默检查并后台下载解压离线包；用户尚未交互且仍在启动窗口内则立即启用并刷新 WebView，否则留 staging，下次冷启动自动提升。
- 版本双轨：`packages/app` 是 Web 版本（日常迭代），`packages/native` 是壳版本（仅 Native 变化时升）。`version.json` 同时记录壳 `version` + `nativeHash` + `webPackage`。
- `nativeHash` 由 [scripts/native-hash.ts](../../scripts/native-hash.ts) 生成，写入 `src-tauri/native-hash.txt`（已 gitignore），`build.rs` 注入编译期常量；换网导致的 dev IP 改动不影响 hash。
- 客户端只在 `nativeHash` 与本机编译值一致时才应用 `webPackage`，否则回退 Android APK / 桌面 `tauri-plugin-updater`。

相关命令：

```sh
bun run native:hash          # 计算并写出当前 Native hash
bun run upgrade:native       # Native 变化时升壳 + 写 version.json（--check 只检测，退出码 2 表示需要升壳）
bun run pack:web-package     # 打包前端为离线包并写 webPackage
bun run upload:web-package   # 上传离线包到 Bitiful CDN
bun run ota:local            # 局域网验证：打基线 APK → 发离线包 → 冷启动静默生效
```

本地验证细节见 [docs/release.md](../../docs/release.md) 第 4.5 节。
