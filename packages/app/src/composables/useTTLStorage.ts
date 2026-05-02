import { ref, type Ref } from 'vue'
import { isTauri } from '@/constants'
import { getLocalCache, setLocalCache, removeLocalCache } from '@/lib/storage'

interface TTLStorageOptions<T> {
  ttl?: number // Time to live in ms, default 15 mins
  key: string | (() => string) // Support dynamic key
  initialValue: T
  persistInTauri?: boolean // Whether to ignore TTL in Tauri environment (default: false)
}

export function useTTLStorage<T>(options: TTLStorageOptions<T>) {
  const { ttl = 15 * 60 * 1000, key, initialValue, persistInTauri = false } = options

  // Create a deep copy of initialValue to avoid reference issues if needed,
  // but for simple usage ref() is fine.
  const data = ref<T>(initialValue) as Ref<T>

  const getStorageKey = () => {
    return typeof key === 'function' ? key() : key
  }

  // Synchronous load (fallback/legacy for Web)
  const load = (): boolean => {
    try {
      const storageKey = getStorageKey()
      const raw = localStorage.getItem(storageKey)
      if (!raw) return false

      const parsed = JSON.parse(raw)
      const lastUpdate = parsed.lastUpdate || 0

      const isExpired = Date.now() - lastUpdate > ttl;
      const shouldIgnoreTTL = isTauri && persistInTauri;

      if (isExpired && !shouldIgnoreTTL) {
        localStorage.removeItem(storageKey)
        return false
      }

      data.value = parsed.data
      return true
    } catch (e) {
      console.error(`[useTTLStorage] Load failed`, e)
      return false
    }
  }

  // Asynchronous load (Recommended for Tauri with Turso DB)
  const loadAsync = async (): Promise<boolean> => {
    try {
      const storageKey = getStorageKey()
      const raw = await getLocalCache(storageKey)
      if (!raw) return false

      const parsed = JSON.parse(raw)
      const lastUpdate = parsed.lastUpdate || 0

      const isExpired = Date.now() - lastUpdate > ttl;
      const shouldIgnoreTTL = isTauri && persistInTauri;

      if (isExpired && !shouldIgnoreTTL) {
        await removeLocalCache(storageKey)
        return false
      }

      data.value = parsed.data
      return true
    } catch (e) {
      console.error(`[useTTLStorage] Async load failed`, e)
      return false
    }
  }

  // Synchronous save (fallback/legacy)
  const save = (newValue?: T) => {
    try {
      const storageKey = getStorageKey()
      const valToSave = newValue !== undefined ? newValue : data.value
      if (newValue !== undefined) {
        data.value = newValue
      }

      const storageData = {
        data: valToSave,
        lastUpdate: Date.now()
      }
      localStorage.setItem(storageKey, JSON.stringify(storageData))
    } catch (e) {
      console.error(`[useTTLStorage] Save failed`, e)
    }
  }

  // Asynchronous save (Recommended for Tauri with Turso DB)
  const saveAsync = async (newValue?: T) => {
    try {
      const storageKey = getStorageKey()
      const valToSave = newValue !== undefined ? newValue : data.value
      if (newValue !== undefined) {
        data.value = newValue
      }

      const storageData = {
        data: valToSave,
        lastUpdate: Date.now()
      }
      await setLocalCache(storageKey, JSON.stringify(storageData))
    } catch (e) {
      console.error(`[useTTLStorage] Async save failed`, e)
    }
  }

  const clear = () => {
    const storageKey = getStorageKey()
    localStorage.removeItem(storageKey)
    removeLocalCache(storageKey)
  }

  return {
    data,
    load,
    loadAsync,
    save,
    saveAsync,
    clear
  }
}
