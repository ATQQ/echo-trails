# Android 包体积 Step 2 结果快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：`bun run analyze:android-size`
- 优化项：在 `packages/native/src-tauri/Cargo.toml` 增加 `[profile.release] strip = "symbols"`。
- 说明：本次未运行 release 重命名脚本，因此 `release/` 目录仍是 Step 1 的旧包；对比以 `build arm64 APK/AAB` 和 `arm64 libtauri_app_lib.so` 为准。

## 对比摘要

| 指标 | Step 1 基线 | Step 2 结果 | 变化 |
| --- | ---: | ---: | ---: |
| build arm64 APK | 42.89 MB | 31.00 MB | -11.89 MB |
| build arm64 AAB | 17.63 MB | 15.40 MB | -2.23 MB |
| arm64 `libtauri_app_lib.so` | 40.47 MB | 28.58 MB | -11.89 MB |
| APK 内 so | 40.47 MB / `stor` | 28.58 MB / `stor` | -11.89 MB |
| AAB 内 so | 40.47 MB -> 14.33 MB / `defN` | 28.58 MB -> 12.09 MB / `defN` | -2.24 MB compressed |
| `.strtab` | 6.93 MB | 已移除 | -6.93 MB |
| `.symtab` | 4.96 MB | 已移除 | -4.96 MB |

## 分析输出

```text
$ bun run scripts/analyze-android-package-size.ts
# Android package size baseline

Version: 0.7.9

## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| release arm64 APK | 42.89 MB | /Users/sugar/Documents/fe/echo-trails/release/echo-trails-release-0.7.9.apk |
| release arm64 AAB | 17.63 MB | /Users/sugar/Documents/fe/echo-trails/release/echo-trails-release-0.7.9.aab |
| build arm64 APK | 31.00 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build universal APK | 150.94 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk |
| build arm64 AAB | 15.40 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |
| build universal AAB | 57.84 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.23 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 28.58 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 28.58 MB | stor |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 1010.15 KB | 1010.15 KB | stor |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 28.58 MB | 12.09 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.35 MB | 316.84 KB | defN |

## Largest ELF sections: arm64 libtauri_app_lib.so
| Section | Size | Type |
| --- | ---: | --- |
| .text | 17.84 MB | TEXT |
| .rodata | 3.22 MB | DATA |
| .eh_frame | 2.30 MB | DATA |
| .data.rel.ro | 1.80 MB | DATA |
| .gcc_except_table | 1.64 MB | DATA |
| .rela.dyn | 1.40 MB |  |
| .eh_frame_hdr | 310.35 KB | DATA |
| .data | 32.20 KB | DATA |
| .bss | 11.82 KB | BSS |
| .dynsym | 8.93 KB |  |
| .dynstr | 6.78 KB |  |
| .got | 5.99 KB | DATA |
```
