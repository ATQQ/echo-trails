/**
 * 应用更新底层能力：版本比较、平台识别、更新清单拉取与 OTA 命令封装。
 *
 * Web 端只读远端清单做展示；Tauri（Android / 桌面）统一走 Native `check_update`，
 * 由 Native 依据本机编译的 nativeHash 决定是热更新离线包（web）还是安装包（apk）。
 */
import { isTauri } from '@/constants'
import { version as packageVersion } from '../../package.json'

/** 自定义构建时可注入 __APP_VERSION__，未注入则回退 package.json 版本。 */
declare const __APP_VERSION__: string | undefined
/** 构建期注入的 git 短 commit，未注入则为空。 */
declare const __APP_COMMIT__: string | undefined

export const VERSION_URL =
  import.meta.env.VITE_VERSION_URL?.trim() ||
  'https://photo.sugarat.top/version.json'

export type UpdateKind = 'none' | 'web' | 'apk'

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
  nativeHash?: string
  webPackage?: WebPackageInfo
}

export type AppUpdateInfo = {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  description: string
  downloadUrl: string
  forceUpdate: boolean
  md5: string
  fileSize: number
  updateKind: UpdateKind
}

export type NativeBuildInfo = {
  version: string
  nativeHash: string
  commit?: string
  /** 已启用的热更新包版本，没有热更新时为空 */
  webVersion?: string
  /** 已启用的热更新包 md5，没有热更新时为空 */
  webHash?: string
}

let nativePlatform: string | null = null
let nativePlatformPromise: Promise<string> | null = null

/** 当前运行平台：web / android / macos / windows / linux ... */
export async function getNativePlatform(): Promise<string> {
  if (nativePlatform) return nativePlatform
  if (!isTauri) {
    nativePlatform = 'web'
    return nativePlatform
  }
  if (!nativePlatformPromise) {
    nativePlatformPromise = import('@tauri-apps/plugin-os')
      .then(({ type }) => type())
      .then((platform) => {
        nativePlatform = platform
        return platform
      })
  }
  return nativePlatformPromise
}

export function compareVersion(left: string, right: string) {
  const partsLeft = left.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const partsRight = right.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const len = Math.max(partsLeft.length, partsRight.length)
  for (let i = 0; i < len; i += 1) {
    const a = partsLeft[i] ?? 0
    const b = partsRight[i] ?? 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

export function formatPackageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 对外展示的产品版本：优先热更新后的 Web 版本。 */
export function displayedAppVersion(info: PlatformVersionInfo | undefined) {
  const webVersion = info?.webPackage?.version?.trim()
  if (webVersion) return webVersion
  return info?.version?.trim() || ''
}

export function getLocalAppVersion(): string {
  // 热更新离线包会把新版本号注入 VITE_APP_VERSION；
  // 若读不到再看编译期 define，最后回退 package.json 版本。
  const injected = import.meta.env.VITE_APP_VERSION?.trim()
  if (injected) return injected
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) return __APP_VERSION__
  return packageVersion
}

/** 构建期注入的 git 短 hash；Web 端展示用，Native 端另有更权威的 commit。 */
export function getAppCommit(): string {
  return typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__.trim() : ''
}

export async function getNativeBuild(): Promise<NativeBuildInfo | null> {
  if (!isTauri) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<NativeBuildInfo>('get_native_build')
}

function emptyUpdate(currentVersion: string): AppUpdateInfo {
  return {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    description: '',
    downloadUrl: '',
    forceUpdate: false,
    md5: '',
    fileSize: 0,
    updateKind: 'none',
  }
}

function normalizeUpdateInfo(
  info: AppUpdateInfo,
  currentVersion: string,
): AppUpdateInfo {
  const kind = info.updateKind
  const updateKind: UpdateKind =
    kind === 'web' || kind === 'apk' || kind === 'none' ? kind : 'apk'
  return {
    hasUpdate: Boolean(info.hasUpdate),
    currentVersion: info.currentVersion || currentVersion,
    latestVersion: info.latestVersion || currentVersion,
    description: info.description || '',
    downloadUrl: info.downloadUrl || '',
    forceUpdate: Boolean(info.forceUpdate),
    md5: info.md5 || '',
    fileSize: Number(info.fileSize) || 0,
    updateKind: info.hasUpdate ? updateKind : 'none',
  }
}

/**
 * 拉取更新信息。Tauri 环境交给 Native 决策（含 nativeHash 校验）；
 * 纯 Web 环境没有壳，直接视为无更新。
 */
export async function fetchAppUpdate(
  currentVersion: string,
): Promise<AppUpdateInfo> {
  if (!isTauri) return emptyUpdate(currentVersion)

  const { invoke } = await import('@tauri-apps/api/core')
  const platform = await getNativePlatform()
  const info = await invoke<AppUpdateInfo>('check_update', {
    currentVersion,
    platform,
    versionUrl: VERSION_URL,
  })
  return normalizeUpdateInfo(info, currentVersion)
}

function invokeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return String(error ?? '')
}

function isMissingTauriCommand(error: unknown, command: string) {
  const message = invokeErrorMessage(error).toLowerCase()
  const name = command.toLowerCase()
  const missing =
    message.includes('not found') ||
    message.includes('not allowed') ||
    message.includes('unknown command') ||
    message.includes('invalid command')
  return missing && (message.includes(name) || message.includes('command'))
}

export type WebPackagePrepareResult = 'staged' | 'applied'

/** 一步到位：下载 + 解压 + 立即启用（老壳只支持 apply_web_package 时的兼容路径）。 */
export async function applyWebPackage(info: AppUpdateInfo) {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('apply_web_package', {
    url: info.downloadUrl,
    version: info.latestVersion,
    md5: info.md5,
    fileSize: info.fileSize,
  })
}

/** 后台下载并解压到 staging，不立即启用；下次冷启动或手动 activate 时生效。 */
export async function prepareWebPackage(
  info: AppUpdateInfo,
): Promise<WebPackagePrepareResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    await invoke('prepare_web_package', {
      url: info.downloadUrl,
      version: info.latestVersion,
      md5: info.md5,
      fileSize: info.fileSize,
    })
    return 'staged'
  } catch (error) {
    if (!isMissingTauriCommand(error, 'prepare_web_package')) throw error
    await applyWebPackage(info)
    return 'applied'
  }
}

/** 把已 staging 的包提升为 current，立即对后续资源加载生效。 */
export async function activateWebPackage() {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    await invoke('activate_web_package')
  } catch (error) {
    if (!isMissingTauriCommand(error, 'activate_web_package')) throw error
  }
}

/** 启用后刷新 WebView（带 _ota 参数避免命中旧缓存）。 */
export function reloadAfterWebUpdate(version: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('_ota', version)
  window.location.replace(url.toString())
}
