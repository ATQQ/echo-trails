# Android 包体积基线快照

- 记录时间：2026-05-24
- 版本：`0.7.9`
- 执行命令：`bun run analyze:android-size`
- 用途：作为 Step 2 及后续优化前的原始对比快照。

```text
$ bun run scripts/analyze-android-package-size.ts
# Android package size baseline

Version: 0.7.9

## Artifacts
| Artifact | Size | Path |
| --- | ---: | --- |
| release arm64 APK | 42.89 MB | /Users/sugar/Documents/fe/echo-trails/release/echo-trails-release-0.7.9.apk |
| release arm64 AAB | 17.63 MB | /Users/sugar/Documents/fe/echo-trails/release/echo-trails-release-0.7.9.aab |
| build arm64 APK | 42.89 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk |
| build universal APK | 150.94 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk |
| build arm64 AAB | 17.63 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/arm64Release/app-arm64-release.aab |
| build universal AAB | 57.84 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab |

## Directories and native library
| Target | Size | Path |
| --- | ---: | --- |
| app dist | 2.22 MB | /Users/sugar/Documents/fe/echo-trails/packages/app/dist |
| arm64 libtauri_app_lib.so | 40.47 MB | /Users/sugar/Documents/fe/echo-trails/packages/native/src-tauri/gen/android/app/build/intermediates/stripped_native_libs/arm64Release/stripArm64ReleaseDebugSymbols/out/lib/arm64-v8a/libtauri_app_lib.so |

## Largest entries: release arm64 APK (echo-trails-release-0.7.9.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 40.47 MB | 40.47 MB | stor |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 1010.15 KB | 1010.15 KB | stor |
| kotlin/kotlin.kotlin_builtins | 18.20 KB | 5.13 KB | defN |
| res/Gc.png | 13.83 KB | 13.83 KB | stor |
| res/as.png | 13.83 KB | 13.83 KB | stor |
| res/o-.png | 13.83 KB | 13.83 KB | stor |
| META-INF/FastDoubleParser-LICENSE | 11.09 KB | 3.86 KB | defN |
| res/Lf.png | 8.37 KB | 8.37 KB | stor |
| res/RJ.png | 8.37 KB | 8.37 KB | stor |
| res/fO.png | 8.37 KB | 8.37 KB | stor |
| AndroidManifest.xml | 6.85 KB | 1.91 KB | defN |

## Largest entries: release arm64 AAB (echo-trails-release-0.7.9.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 40.47 MB | 14.33 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.35 MB | 316.84 KB | defN |
| META-INF/KEY0.SF | 114.04 KB | 42.26 KB | defN |
| META-INF/MANIFEST.MF | 113.99 KB | 39.54 KB | defN |
| base/root/kotlin/kotlin.kotlin_builtins | 18.20 KB | 5.13 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher.png | 13.83 KB | 13.68 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png | 13.83 KB | 13.68 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher_round.png | 13.83 KB | 13.68 KB | defN |
| base/res/drawable/ic_launcher_background.xml | 11.45 KB | 984 B | defN |
| base/root/META-INF/FastDoubleParser-LICENSE | 11.09 KB | 3.86 KB | defN |

## Largest entries: build arm64 APK (app-arm64-release.apk)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| lib/arm64-v8a/libtauri_app_lib.so | 40.47 MB | 40.47 MB | stor |
| classes.dex | 1.94 MB | 939.33 KB | defN |
| resources.arsc | 1010.15 KB | 1010.15 KB | stor |
| kotlin/kotlin.kotlin_builtins | 18.20 KB | 5.13 KB | defN |
| res/Gc.png | 13.83 KB | 13.83 KB | stor |
| res/as.png | 13.83 KB | 13.83 KB | stor |
| res/o-.png | 13.83 KB | 13.83 KB | stor |
| META-INF/FastDoubleParser-LICENSE | 11.09 KB | 3.86 KB | defN |
| res/Lf.png | 8.37 KB | 8.37 KB | stor |
| res/RJ.png | 8.37 KB | 8.37 KB | stor |
| res/fO.png | 8.37 KB | 8.37 KB | stor |
| AndroidManifest.xml | 6.85 KB | 1.91 KB | defN |

## Largest entries: build arm64 AAB (app-arm64-release.aab)
| Entry | Uncompressed | Compressed | Method |
| --- | ---: | ---: | --- |
| base/lib/arm64-v8a/libtauri_app_lib.so | 40.47 MB | 14.33 MB | defN |
| BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map | 16.76 MB | 1.40 MB | defN |
| base/dex/classes.dex | 1.94 MB | 939.33 KB | defN |
| base/resources.pb | 1.35 MB | 316.84 KB | defN |
| META-INF/KEY0.SF | 114.04 KB | 42.26 KB | defN |
| META-INF/MANIFEST.MF | 113.99 KB | 39.54 KB | defN |
| base/root/kotlin/kotlin.kotlin_builtins | 18.20 KB | 5.13 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher.png | 13.83 KB | 13.68 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png | 13.83 KB | 13.68 KB | defN |
| base/res/mipmap-xxxhdpi-v4/ic_launcher_round.png | 13.83 KB | 13.68 KB | defN |
| base/res/drawable/ic_launcher_background.xml | 11.45 KB | 984 B | defN |
| base/root/META-INF/FastDoubleParser-LICENSE | 11.09 KB | 3.86 KB | defN |

## Largest ELF sections: arm64 libtauri_app_lib.so
| Section | Size | Type |
| --- | ---: | --- |
| .text | 17.84 MB | TEXT |
| .strtab | 6.93 MB |  |
| .symtab | 4.96 MB |  |
| .rodata | 3.22 MB | DATA |
| .eh_frame | 2.30 MB | DATA |
| .data.rel.ro | 1.80 MB | DATA |
| .gcc_except_table | 1.64 MB | DATA |
| .rela.dyn | 1.40 MB |  |
| .eh_frame_hdr | 310.36 KB | DATA |
| .data | 32.20 KB | DATA |
| .bss | 11.82 KB | BSS |
| .dynsym | 8.93 KB |  |
```
