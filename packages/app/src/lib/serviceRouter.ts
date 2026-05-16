import { isTauri } from '@/constants'

let currentMode: string = 'server'

export function setMode(mode: string) {
  currentMode = mode
}

export function getMode(): string {
  return currentMode
}

export function isLocalMode(): boolean {
  return isTauri && currentMode === 'offline'
}

/** @deprecated Use isLocalMode() instead */
export const isOfflineMode = isLocalMode
