import { isTauri } from '@/constants';
import { invoke } from '@tauri-apps/api/core';

export async function setLocalCache(key: string, value: string): Promise<void> {
  if (isTauri) {
    try {
      await invoke('db_set_cache', { key, value });
    } catch (e) {
      console.error('[Storage] Tauri db_set_cache failed:', e);
      localStorage.setItem(key, value); // fallback
    }
  } else {
    localStorage.setItem(key, value);
  }
}

export async function getLocalCache(key: string): Promise<string | null> {
  if (isTauri) {
    try {
      const res = await invoke<string | null>('db_get_cache', { key });
      if (res !== null) return res;
      // Fallback to localStorage if not found in db (migration path)
      const fallback = localStorage.getItem(key);
      if (fallback) {
        // Migrate it to db
        await setLocalCache(key, fallback);
        return fallback;
      }
      return null;
    } catch (e) {
      console.error('[Storage] Tauri db_get_cache failed:', e);
      return localStorage.getItem(key);
    }
  } else {
    return localStorage.getItem(key);
  }
}

export async function removeLocalCache(key: string): Promise<void> {
  if (isTauri) {
    try {
      // In db, we can just set it to empty or implement a delete command.
      // For now, setting to empty string or we can add a delete command if needed.
      // Since we don't have db_delete_cache, we just overwrite with empty JSON object or empty string.
      // Let's implement it as empty string for now, but usually it's better to add db_delete_cache.
      // Let's fallback to localStorage removal for safety too.
      await invoke('db_set_cache', { key, value: '' });
      localStorage.removeItem(key);
    } catch (e) {
      console.error('[Storage] Tauri cache removal failed:', e);
    }
  } else {
    localStorage.removeItem(key);
  }
}
