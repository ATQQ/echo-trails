# Android 包体积 Step 4 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：`bun run analyze:android-size`
- 优化项：在 release build 中启用 Android resource shrink。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 为准。

## 对比摘要

| 指标 | Step 3 结果 | Step 4 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 14.51 MB | 13.90 MB | -0.61 MB |
| build arm64 AAB | 15.40 MB | 15.07 MB | -0.33 MB |
| arm64 `libtauri_app_lib.so` | 28.58 MB | 28.58 MB | 0 MB |
| APK `resources.arsc` | 1010.15 KB | 591.39 KB | -418.76 KB |
| AAB `base/resources.pb` | 1.35 MB | 1.01 MB | -0.34 MB |

## 结论

- Step 4 收益符合预期，属于小幅资源瘦身。
- native so 没有变化，安装后体积主要仍由解压后的 so 决定。
- 下一步需要真机安装验证，重点看图标、主题、文件选择、弹窗和安装 APK 等 Android 侧资源是否正常。

## 关键分析输出

```text
## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| build arm64 APK | 13.90 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build arm64 AAB | 15.07 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 12.09 MB | defN |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 591.39 KB | 591.39 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 12.09 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.01 MB | 251.89 KB | defN |
```
