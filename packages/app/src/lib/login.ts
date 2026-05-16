import { isTauri, OFFLINE_USERNAME } from "@/constants"
import { getConfig } from "./configStorage"
import { isLocalMode } from "./serviceRouter"

export async function login() {
  if (isLocalMode()) {
    localStorage.setItem('userInfo', JSON.stringify({
      username: OFFLINE_USERNAME,
      operator: OFFLINE_USERNAME,
      isAdmin: false
    }))
    return
  }

  const token = localStorage.getItem('token')
  if (!token && !['/login', '/set'].includes(window.location.pathname)) {
    throw new Error('Not logged in')
  }
}

export function goLogin() {
  if (window.location.pathname === '/login') {
    return
  }
  window.location.href = `${location.origin}/login`
}
