/**
 * 统一的应用更新编排：
 *   - 静默：启动后拉清单，Web 离线包后台下载；未交互且在启动窗口内则立即启用刷新，
 *           否则留在 staging，下次冷启动自动生效。
 *   - 手动：设置页「检查更新」复用同一入口，Web 更新弹窗提示后立即启用；
 *           Android 走安装包下载流程；桌面无 Web 更新时回退 tauri-plugin-updater。
 */
import { ref } from 'vue'
import { showConfirmDialog, showLoadingToast, showToast, closeToast } from 'vant'
import { isTauri } from '@/constants'
import {
  activateWebPackage,
  fetchAppUpdate,
  getLocalAppVersion,
  getNativePlatform,
  prepareWebPackage,
  reloadAfterWebUpdate,
  type AppUpdateInfo,
} from '@/lib/app-update'

type DownloadProgressPayload = {
  progress: number
  total: number
  status: string
}

/** 启动窗口：这段时间内且用户尚未交互，热更新可静默启用并刷新。 */
const LAUNCH_WINDOW_MS = 8000

const launchAt = Date.now()
let userInteracted = false
let interactionBound = false

function bindInteractionOnce() {
  if (interactionBound || typeof window === 'undefined') return
  interactionBound = true
  const mark = () => {
    userInteracted = true
  }
  window.addEventListener('pointerdown', mark, { once: true, capture: true })
  window.addEventListener('keydown', mark, { once: true, capture: true })
}

function canApplySilently() {
  return !userInteracted && Date.now() - launchAt <= LAUNCH_WINDOW_MS
}

function isDesktopPlatform(platform: string) {
  return platform === 'macos' || platform === 'windows' || platform === 'linux'
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

// module 级单例状态：App.vue 静默检查与设置页手动检查共享同一份进行中状态
const checking = ref(false)
const downloading = ref(false)
const installing = ref(false)
const applyingWeb = ref(false)
const webPrepared = ref(false)
const downloadPercent = ref(0)
const downloadStatus = ref('')
const downloadedPath = ref('')
const currentVersion = ref(getLocalAppVersion())
const nativePlatform = ref('')
const updateInfo = ref<AppUpdateInfo | null>(null)
let preparedVersion = ''

function isPreparedWeb(info: AppUpdateInfo) {
  return webPrepared.value && preparedVersion === info.latestVersion
}

function bindDownloadProgress(
  listen: typeof import('@tauri-apps/api/event').listen,
) {
  return listen<DownloadProgressPayload>('download-progress', (event) => {
    const { progress, total, status } = event.payload
    if (status === 'exists') {
      downloadPercent.value = 100
      downloadStatus.value = '文件已存在'
      return
    }
    if (status === 'retrying') {
      downloadPercent.value = 0
      downloadStatus.value = '校验失败，正在重新下载…'
      return
    }
    if (status === 'extracting') {
      downloadPercent.value = 100
      downloadStatus.value = '正在解压…'
      return
    }
    if (status === 'applying') {
      downloadPercent.value = 100
      downloadStatus.value = '正在应用更新…'
      return
    }
    if (total > 0) {
      downloadPercent.value = Math.min(100, Math.floor((progress / total) * 100))
      downloadStatus.value = `正在下载… ${downloadPercent.value}%`
      return
    }
    const mb = (progress / 1024 / 1024).toFixed(2)
    downloadStatus.value = `正在下载… ${mb} MB`
  })
}

async function openDownloadUrl(url: string) {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}

async function prepareWebUpdate(info: AppUpdateInfo) {
  if (isPreparedWeb(info)) return true
  downloading.value = true
  downloadPercent.value = 0
  downloadStatus.value = '准备下载…'
  let unlisten: (() => void) | undefined
  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlisten = await bindDownloadProgress(listen)
  } catch (error) {
    console.error('Bind download progress failed:', error)
  }
  try {
    await prepareWebPackage(info)
    webPrepared.value = true
    preparedVersion = info.latestVersion
    return true
  } catch (error) {
    console.error('Web package prepare failed:', error)
    webPrepared.value = false
    preparedVersion = ''
    return false
  } finally {
    unlisten?.()
    downloading.value = false
  }
}

async function activateWebUpdate(info: AppUpdateInfo) {
  if (applyingWeb.value) return
  applyingWeb.value = true
  try {
    await activateWebPackage()
    reloadAfterWebUpdate(info.latestVersion)
  } catch (error) {
    console.error('Web package activate failed:', error)
    showToast(`更新失败: ${errorMessage(error, '启用失败')}`)
  } finally {
    applyingWeb.value = false
  }
}

async function installDownloaded() {
  if (!downloadedPath.value || installing.value) return
  installing.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_apk', { filePath: downloadedPath.value })
  } catch (error) {
    console.error('Update install failed:', error)
    showToast(`无法打开安装包: ${errorMessage(error, '安装失败')}`)
  } finally {
    installing.value = false
  }
}

async function downloadApkUpdate(info: AppUpdateInfo) {
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  downloading.value = true
  downloadPercent.value = 0
  downloadStatus.value = '准备下载…'
  downloadedPath.value = ''

  let unlisten: (() => void) | undefined
  try {
    unlisten = await bindDownloadProgress(listen)
    const filePath = await invoke<string>('download_apk', {
      url: info.downloadUrl,
      version: info.latestVersion,
      md5: info.md5,
      fileSize: info.fileSize,
    })
    downloadedPath.value = filePath
    downloadPercent.value = 100
    downloadStatus.value = '安装包已就绪，正在打开安装器'
  } catch (error) {
    console.error('Update download failed:', error)
    downloadedPath.value = ''
    downloadPercent.value = 0
    downloadStatus.value = ''
    showToast(`更新失败: ${errorMessage(error, '下载失败')}`)
    return
  } finally {
    unlisten?.()
    downloading.value = false
  }

  await installDownloaded()
}

/** 桌面端回退：tauri-plugin-updater 检查原生更新；有更新则弹窗并安装。 */
async function checkDesktopFallback(platform: string): Promise<boolean> {
  if (!isDesktopPlatform(platform)) return false
  const { checkDesktopUpdate, downloadAndInstallDesktopUpdate } = await import(
    '@/lib/updater'
  )
  const update = await checkDesktopUpdate()
  if (!update) return false
  showConfirmDialog({
    title: '发现新版本',
    message: `最新版本：${update.version}\n\n${update.body || ''}`,
    confirmButtonText: '立即更新',
    cancelButtonText: '取消',
  })
    .then(async () => {
      try {
        showToast('正在下载并安装更新...')
        await downloadAndInstallDesktopUpdate()
      } catch (error) {
        showToast(`更新失败: ${errorMessage(error, '更新失败')}`)
      }
    })
    .catch(() => {
      // 用户取消
    })
  return true
}

async function check(opts?: { silent?: boolean }): Promise<AppUpdateInfo | null> {
  const silent = Boolean(opts?.silent)
  bindInteractionOnce()
  if (applyingWeb.value) return null
  if (checking.value || downloading.value) {
    if (!silent) showToast('正在检查更新…')
    return null
  }

  checking.value = true
  let loading: ReturnType<typeof showLoadingToast> | undefined
  try {
    const version = getLocalAppVersion()
    currentVersion.value = version
    const platform = await getNativePlatform()
    nativePlatform.value = platform
    if (!silent) {
      loading = showLoadingToast({ message: '检查更新中...', forbidClick: true, duration: 0 })
    }

    const info = await fetchAppUpdate(version)
    updateInfo.value = info

    if (!info.hasUpdate || info.updateKind === 'none') {
      webPrepared.value = false
      preparedVersion = ''
      if (!silent) {
        const handled = await checkDesktopFallback(platform)
        if (!handled) showToast('当前已是最新版本')
      }
      return info
    }

    if (info.updateKind === 'web') {
      const ok = await prepareWebUpdate(info)
      if (silent) {
        if (ok && canApplySilently()) {
          await activateWebUpdate(info)
        }
        return info
      }
      closeToast()
      if (!ok) {
        showToast('更新下载失败，请稍后重试')
        return info
      }
      showConfirmDialog({
        title: '发现新版本',
        message: `最新版本：${info.latestVersion}\n\n${info.description || ''}\n\n启用后应用会自动刷新`,
        confirmButtonText: '立即启用',
        cancelButtonText: '稍后',
      })
        .then(() => activateWebUpdate(info))
        .catch(() => {
          // 用户取消，包已 staged，下次冷启动会自动生效
        })
      return info
    }

    // updateKind === 'apk'
    closeToast()
    if (platform === 'android') {
      showConfirmDialog({
        title: '发现新版本',
        message: `最新版本：${info.latestVersion}\n\n${info.description || ''}`,
        confirmButtonText: '应用内更新',
        cancelButtonText: '浏览器下载',
        closeOnClickOverlay: true,
      })
        .then(() => downloadApkUpdate(info))
        .catch(async (action: unknown) => {
          if (action === 'cancel' || action === 'close') {
            await openDownloadUrl(info.downloadUrl)
          }
        })
    } else if (info.downloadUrl) {
      await openDownloadUrl(info.downloadUrl)
    }
    return info
  } catch (error) {
    console.error('Update check failed:', error)
    if (!silent) {
      closeToast()
      showToast(`检查更新失败: ${errorMessage(error, '检查失败')}`)
    }
    return null
  } finally {
    checking.value = false
    if (loading) closeToast()
  }
}

export function useAppUpdate() {
  return {
    // state
    checking,
    downloading,
    installing,
    applyingWeb,
    webPrepared,
    downloadPercent,
    downloadStatus,
    downloadedPath,
    currentVersion,
    nativePlatform,
    updateInfo,
    // actions
    check,
    prepareWebUpdate,
    activateWebUpdate,
    downloadApkUpdate,
    installDownloaded,
    isDesktopPlatform,
  }
}
