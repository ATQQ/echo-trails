# Android 包体积 Step 3 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：`bun run analyze:android-size`
- 优化项：在 release build 中启用 compressed native libs packaging。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 为准。

## 对比摘要

| 指标 | Step 1 基线 | Step 2 结果 | Step 3 结果 | Step 3 相比 Step 2 |
| --- | ---: | ---: | ---: | ---: |
| build arm64 APK | 42.89 MB | 31.00 MB | 14.51 MB | -16.49 MB |
| build arm64 AAB | 17.63 MB | 15.40 MB | 15.40 MB | 0 MB |
| arm64 `libtauri_app_lib.so` | 40.47 MB | 28.58 MB | 28.58 MB | 0 MB |
| APK 内 so | 40.47 MB / `stor` | 28.58 MB / `stor` | 28.58 MB -> 12.09 MB / `defN` | compressed |
| AAB 内 so | 40.47 MB -> 14.33 MB / `defN` | 28.58 MB -> 12.09 MB / `defN` | 28.58 MB -> 12.09 MB / `defN` | unchanged |

## 结论

- Step 3 对自分发 APK 收益明显，build arm64 APK 从 31.00 MB 降到 14.51 MB。
- AAB 原本就压缩 native lib，因此 Step 3 对 AAB 体积没有明显影响。
- 下一步需要真机安装验证，确认压缩后的 native lib 能正常解压和加载。

## 关键分析输出

```text
## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| build arm64 APK | 14.51 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build arm64 AAB | 15.40 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.23 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 28.58 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 12.09 MB | defN |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 1010.15 KB | 1010.15 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 12.09 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.35 MB | 316.84 KB | defN |
```
