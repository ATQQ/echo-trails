/**
 * 桌面端自动更新封装（tauri-plugin-updater + tauri-plugin-process）
 *
 * 仅桌面端使用。调用方应通过动态 import('@/lib/updater') 引入，
 * 避免在 Android/Web 构建产物中静态打包 @tauri-apps/plugin-updater。
 *
 * 流程：check() 检测更新 → downloadAndInstall() 下载+签名校验+安装 → relaunch() 重启
 */
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type DesktopUpdate = Awaited<ReturnType<typeof check>>

/**
 * 检测桌面端是否有可用更新
 * @returns Update 对象（有更新）或 null（已是最新）
 */
export async function checkDesktopUpdate(): Promise<DesktopUpdate> {
  return check()
}

/**
 * 下载并安装桌面端更新，完成后自动重启应用
 * @param onProgress 下载进度回调（0-100）
 * @returns 是否执行了更新（false 表示无可用更新）
 */
export async function downloadAndInstallDesktopUpdate(
  onProgress?: (percent: number) => void,
): Promise<boolean> {
  const update = await check()
  if (!update) return false

  let total = 0
  let downloaded = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started' && event.data.contentLength) {
      total = event.data.contentLength
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
    }
    if (total && onProgress) {
      onProgress(Math.min(100, Math.round((downloaded / total) * 100)))
    }
  })

  // 安装完成后重启应用
  await relaunch()
  return true
}
