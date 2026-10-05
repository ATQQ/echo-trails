/**
 * Native 壳升级：Native 代码（nativeHash）变化时，把壳版本对齐到当前 Web 版本，
 * 并更新 version.json / update.json 的 nativeHash。
 *
 * 用法：
 *   bun run upgrade:native           有变化则对齐壳版本（改文件，不打 APK）
 *   bun run upgrade:native --check   只检测，不改文件；退出码 2 表示需要升壳
 *   bun run upgrade:native --force   即使 hash 没变也强制对齐
 */
import {
  OTA_PLATFORMS,
  appPackagePath,
  cdnApkUrl,
  readPackageVersion,
  readUpdateFile,
  readVersionFile,
  setNativeVersion,
  updateJsonPath,
  versionJsonPath,
  writeJson,
} from './release-meta.ts'
import { computeNativeHash, writeNativeHashFile } from './native-hash.ts'

export type NativeUpgradePlan = {
  needRebuild: boolean
  force: boolean
  nativeHash: string
  publishedHash: string
  webVersion: string
  shellVersion: string
  apkMd5: string
}

export function nativeNeedsRebuild(
  publishedHash: string,
  currentHash: string,
  force: boolean,
) {
  return force || publishedHash !== currentHash
}

export function inspectNativeUpgrade(force = false): NativeUpgradePlan {
  const versionData = readVersionFile()
  if (!versionData.android) {
    console.error(`version.json missing android section: ${versionJsonPath}`)
    process.exit(1)
  }
  const nativeHash = computeNativeHash()
  const publishedHash = versionData.android.nativeHash || ''
  return {
    needRebuild: nativeNeedsRebuild(publishedHash, nativeHash, force),
    force,
    nativeHash,
    publishedHash,
    webVersion: readPackageVersion(appPackagePath),
    shellVersion: versionData.android.version,
    apkMd5: versionData.android.md5 || '',
  }
}

export function applyNativeUpgrade(plan: NativeUpgradePlan) {
  const versionData = readVersionFile()
  if (!versionData.android) {
    console.error(`version.json missing android section: ${versionJsonPath}`)
    process.exit(1)
  }

  setNativeVersion(plan.webVersion)

  const description = versionData.android.description || ''
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (!entry) continue
    entry.version = plan.webVersion
    entry.nativeHash = plan.nativeHash
    entry.md5 = ''
    entry.fileSize = 0
    // Android 走 CDN APK；桌面原生更新仍由 tauri-plugin-updater（latest.json）负责。
    entry.downloadUrl = platform === 'android' ? cdnApkUrl(plan.webVersion) : ''
  }
  writeJson(versionJsonPath, versionData)

  const updateData = readUpdateFile()
  if (updateData.android) {
    let entry = updateData.android.find((item) => item.version === plan.webVersion)
    if (!entry) {
      entry = {
        version: plan.webVersion,
        downloadUrl: cdnApkUrl(plan.webVersion),
        forceUpdate: false,
        description,
        md5: '',
        fileSize: 0,
      }
      updateData.android.unshift(entry)
    }
    entry.downloadUrl = cdnApkUrl(plan.webVersion)
    entry.nativeHash = plan.nativeHash
    entry.md5 = ''
    entry.fileSize = 0
    if (description) entry.description = description
    writeJson(updateJsonPath, updateData)
  }

  writeNativeHashFile(plan.nativeHash)
}

function printHelp() {
  console.log(`检测/对齐 Native 壳版本（与 scripts/native-hash.ts 同一套 hash）。

用法:
  bun run upgrade:native           有变化则把壳版本对齐到当前 Web 版本
  bun run upgrade:native --check   只检测，不改文件（退出码 2 表示需要升壳）
  bun run upgrade:native --force   即使 hash 没变也升到当前 Web 版本`)
}

function parseArgs(argv: string[]) {
  const args = argv.filter((item) => item !== '--')
  if (args.includes('-h') || args.includes('--help')) {
    printHelp()
    process.exit(0)
  }
  const check = args.includes('--check')
  const force = args.includes('--force')
  const unknown = args.filter((item) => item !== '--check' && item !== '--force')
  if (unknown.length) {
    console.error(`未知参数：${unknown.join(', ')}`)
    printHelp()
    process.exit(1)
  }
  return { check, force }
}

function main() {
  const { check, force } = parseArgs(process.argv.slice(2))
  const plan = inspectNativeUpgrade(force)
  console.log(
    `web=${plan.webVersion} shell=${plan.shellVersion} nativeHash=${plan.nativeHash} published=${plan.publishedHash || '(none)'}`,
  )

  if (check) {
    if (plan.needRebuild) {
      console.log('需要升壳 APK')
      process.exit(2)
    }
    console.log('Native 未变化，不必升壳')
    return
  }

  if (!plan.needRebuild) {
    console.log('Native 未变化，壳版本未改')
    return
  }

  console.log(`\n升壳 ${plan.shellVersion} → ${plan.webVersion}\n`)
  applyNativeUpgrade(plan)
  console.log('已对齐 native package / tauri.conf / Cargo.*，并更新 version.json 的 version / nativeHash。')
  console.log('md5 / fileSize 已清空。接着打包：bun run build:android:prod，再上传 APK 与 Web 离线包。')
}

if (import.meta.main) {
  main()
}
