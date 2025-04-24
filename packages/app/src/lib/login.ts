import { isTauri } from "@/constants"

export async function login() {
  const token = localStorage.getItem('token')
  if (!token && !['/login', '/set'].includes(window.location.pathname)) {
    throw new Error('Not logged in')
  }
}

export function goLogin() {
  if (isTauri) {
    window.location.href = `${location.origin}/set`
    return
  }

  window.location.href = `${location.origin}/login`
}