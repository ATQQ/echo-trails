import { useLocalStorage } from '@vueuse/core'
import { watch, type Ref } from 'vue'

// 模块级单例：跨组件共享同一个 vConsole 实例与开关状态
let vConsoleInstance: any = null
let initialized = false
let enabledRef: Ref<boolean> | null = null

async function syncVConsole() {
  if (enabledRef?.value) {
    if (!vConsoleInstance) {
      try {
        const VConsole = (await import('vconsole')).default
        vConsoleInstance = new VConsole()
      } catch (e) {
        console.error('[vConsole] 加载失败', e)
      }
    }
  } else if (vConsoleInstance) {
    try {
      vConsoleInstance.destroy()
    } catch {}
    vConsoleInstance = null
  }
}

/**
 * vConsole 调试控制台开关
 * - DEV 环境默认开启，production 默认关闭
 * - 开关状态持久化到 localStorage('debug.vconsole')
 * - 切换即时生效：开则动态 import 并实例化，关则 destroy
 */
export function useVConsole() {
  if (!enabledRef) {
    enabledRef = useLocalStorage<boolean>('debug.vconsole', !!import.meta.env.DEV)
  }
  if (!initialized) {
    initialized = true
    watch(enabledRef, syncVConsole, { immediate: true })
  }
  return { enabled: enabledRef }
}
