import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { isLocalMode } from '@/lib/serviceRouter'

/**
 * 认证状态 store
 * - token 响应式持有，与 localStorage 同步
 * - isLoggedIn 综合判断 token 与本地模式（本地模式视为已登录）
 * - 用于控制侧边栏等需要登录态判断的 UI
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))

  // 本地模式视为已登录；否则看 token
  const isLoggedIn = computed(() => !!token.value || isLocalMode())

  const setToken = (t: string | null) => {
    token.value = t
    if (t) {
      localStorage.setItem('token', t)
    } else {
      localStorage.removeItem('token')
    }
  }

  // 从 localStorage 重新同步（用于 localStorage.clear() 等外部清理后）
  const refresh = () => {
    token.value = localStorage.getItem('token')
  }

  return { token, isLoggedIn, setToken, refresh }
})
