/**
 * 发版元数据：路径、CDN 约定、version.json / update.json 读写与类型。
 *
 * 版本双轨：
 *   packages/app/package.json   -> Web 版本（日常迭代，热更新跟随它）
 *   packages/native            -> 壳版本（tauri.conf / Cargo / package.json，仅 Native 变化时升）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const projectRoot = resolve(import.meta.dir, '..')
export const appPackagePath = join(projectRoot, 'packages/app/package.json')
export const nativePackagePath = join(projectRoot, 'packages/native/package.json')
export const serverPackagePath = join(projectRoot, 'packages/server/package.json')
export const tauriConfPath = join(projectRoot, 'packages/native/src-tauri/tauri.conf.json')
export const cargoTomlPath = join(projectRoot, 'packages/native/src-tauri/Cargo.toml')
export const cargoLockPath = join(projectRoot, 'packages/native/src-tauri/Cargo.lock')
export const nativeHashFilePath = join(projectRoot, 'packages/native/src-tauri/native-hash.txt')
export const nativeCommitFilePath = join(projectRoot, 'packages/native/src-tauri/native-commit.txt')
export const versionJsonPath = join(projectRoot, 'packages/app/public/version.json')
export const updateJsonPath = join(projectRoot, 'packages/app/public/update.json')
export const appDistDir = join(projectRoot, 'packages/app/dist')
export const releaseDir = join(projectRoot, 'release')

export const CDN_PUBLIC = 'https://three-source.cdn.sugarat.top'
export const S3_KEY_PREFIX = 'echo-trails/release'

/** 参与 OTA 判定的平台（iOS 暂不支持）。 */
export const OTA_PLATFORMS = ['android', 'macos', 'windows', 'linux'] as const
export type OtaPlatform = (typeof OTA_PLATFORMS)[number]

export function apkFileName(version: string) {
  return `echo-trails-release-${version}.apk`
}

export function webPackageFileName(version: string) {
  return `echo-trails-web-${version}.zip`
}

export function cdnApkUrl(version: string) {
  return `${CDN_PUBLIC}/${S3_KEY_PREFIX}/${apkFileName(version)}`
}

export function cdnWebPackageUrl(version: string) {
  return `${CDN_PUBLIC}/${S3_KEY_PREFIX}/${webPackageFileName(version)}`
}

export type WebPackageInfo = {
  version: string
  downloadUrl: string
  md5: string
  fileSize: number
}

export type PlatformVersionInfo = {
  version: string
  downloadUrl: string
  forceUpdate: boolean
  description: string
  md5: string
  fileSize: number
  /** 壳指纹；与客户端编译期 hash 一致才允许应用 webPackage。 */
  nativeHash?: string
  webPackage?: WebPackageInfo
}

export type VersionFile = {
  android?: PlatformVersionInfo
  macos?: PlatformVersionInfo
  windows?: PlatformVersionInfo
  linux?: PlatformVersionInfo
  ios?: PlatformVersionInfo
  [platform: string]: PlatformVersionInfo | undefined
}

export type UpdateFile = {
  android?: PlatformVersionInfo[]
  macos?: PlatformVersionInfo[]
  windows?: PlatformVersionInfo[]
  linux?: PlatformVersionInfo[]
  ios?: PlatformVersionInfo[]
  [platform: string]: PlatformVersionInfo[] | undefined
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

export function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function readPackageVersion(path: string) {
  if (!existsSync(path)) return ''
  return String(readJson<{ version?: string }>(path).version || '')
}

export function writePackageVersion(path: string, version: string) {
  if (!existsSync(path)) {
    console.warn(`Warning: ${path} not found.`)
    return
  }
  const pkg = readJson<Record<string, unknown>>(path)
  pkg.version = version
  writeJson(path, pkg)
  console.log(`Updated ${path.replace(`${projectRoot}/`, '')}`)
}

export function readVersionFile(): VersionFile {
  return readJson<VersionFile>(versionJsonPath)
}

export function readUpdateFile(): UpdateFile {
  if (!existsSync(updateJsonPath)) return {}
  return readJson<UpdateFile>(updateJsonPath)
}

/**
 * 在 update.json 的平台数组里按版本找条目。
 *
 * 不要用 `list[0]`：桌面端数组里还躺着历史占位条目，直接写 [0] 会把
 * 别的版本的说明 / webPackage 盖掉（0.9.4 发版时就是这么污染过数据）。
 */
export function findUpdateEntry(list: PlatformVersionInfo[] | undefined, version: string) {
  if (!Array.isArray(list)) return undefined
  return list.find((item) => item.version === version)
}

/** 把同一份 webPackage 写入所有 OTA 平台条目。 */
export function applyWebPackage(versionData: VersionFile, pkg: WebPackageInfo) {
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (entry) entry.webPackage = { ...pkg }
  }
}

/** 把描述同步到所有 OTA 平台条目。 */
export function applyDescription(versionData: VersionFile, description: string) {
  if (!description) return
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (entry) entry.description = description
  }
}

/**
 * 把壳版本对齐到指定版本：native package.json / tauri.conf.json / Cargo.toml / Cargo.lock。
 * 只改 version 字段，不碰依赖。
 */
export function setNativeVersion(version: string) {
  writePackageVersion(nativePackagePath, version)

  if (existsSync(tauriConfPath)) {
    const conf = readJson<Record<string, unknown>>(tauriConfPath)
    conf.version = version
    writeJson(tauriConfPath, conf)
    console.log(`Updated ${tauriConfPath.replace(`${projectRoot}/`, '')}`)
  }

  if (existsSync(cargoTomlPath)) {
    const toml = readFileSync(cargoTomlPath, 'utf-8')
    const versionRegex = /^version\s*=\s*".*"/m
    if (versionRegex.test(toml)) {
      writeFileSync(cargoTomlPath, toml.replace(versionRegex, `version = "${version}"`))
      console.log(`Updated ${cargoTomlPath.replace(`${projectRoot}/`, '')}`)
    } else {
      console.warn(`Warning: Could not find version field in ${cargoTomlPath}`)
    }
  }

  if (existsSync(cargoLockPath)) {
    const lock = readFileSync(cargoLockPath, 'utf-8')
    const lockRegex = /(\[\[package\]\]\nname = "echo-trails"\n)version = "[^"]+"/
    if (lockRegex.test(lock)) {
      writeFileSync(cargoLockPath, lock.replace(lockRegex, `$1version = "${version}"`))
      console.log(`Updated ${cargoLockPath.replace(`${projectRoot}/`, '')}`)
    } else {
      console.warn(`Warning: Could not find echo-trails package in ${cargoLockPath}`)
    }
  }
}
