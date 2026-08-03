import { ref } from 'vue'
import { isTauri } from '@/constants'

// 使用 ref 使 currentMode 成为响应式变量。
// 这样 authStore.isLoggedIn 等 computed 在调用 isLocalMode() 时，
// 能正确追踪 currentMode 作为依赖，当 setMode() 改变模式时自动重新求值。
const currentMode = ref<string>('server')

export function setMode(mode: string) {
  currentMode.value = mode
}

export function getMode(): string {
  return currentMode.value
}

export function isLocalMode(): boolean {
  return isTauri && currentMode.value === 'offline'
}

/** @deprecated Use isLocalMode() instead */
export const isOfflineMode = isLocalMode
