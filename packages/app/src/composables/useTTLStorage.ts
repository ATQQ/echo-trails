import { ref, type Ref } from 'vue'
import { isTauri } from '@/constants'

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

  const load = (): boolean => {
    try {
      const storageKey = getStorageKey()
      const raw = localStorage.getItem(storageKey)
      if (!raw) return false

      const parsed = JSON.parse(raw)
      const lastUpdate = parsed.lastUpdate || 0

      // In Tauri environment, if persistInTauri is true, we ignore TTL and always load from cache
      // This allows offline viewing of previously loaded data
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

  const save = (newValue?: T) => {
    try {
      const storageKey = getStorageKey()
      const valToSave = newValue !== undefined ? newValue : data.value
      // Update local data ref if newValue is provided
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

  const clear = () => {
    const storageKey = getStorageKey()
    localStorage.removeItem(storageKey)
  }

  return {
    data,
    load,
    save,
    clear
  }
}
