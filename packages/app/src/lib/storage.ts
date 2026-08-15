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
      await invoke('db_delete_cache', { key });
      localStorage.removeItem(key);
    } catch (e) {
      console.error('[Storage] Tauri cache removal failed:', e);
      localStorage.removeItem(key);
    }
  } else {
    localStorage.removeItem(key);
  }
}

/**
 * 清空全部 kv_cache（用于切换模式/地址时清理残留缓存）。
 * Tauri 环境调用 db_clear_all_cache 命令清空本地数据库 kv_cache 表；
 * Web 环境无 kv_cache，仅移除图片内存缓存键。
 * 不使用 localStorage.clear() 以避免误清 bitiful-config 等用户数据。
 */
export async function clearAllLocalCache(): Promise<void> {
  if (isTauri) {
    try {
      await invoke('db_clear_all_cache');
    } catch (e) {
      console.error('[Storage] Tauri clear all cache failed:', e);
    }
  }
  // 两端均清理图片内存缓存键
  localStorage.removeItem('image_memory_cache_v1');
}

export interface CacheInfo {
  key: string;
  size: number;
}

export async function getAllCacheInfo(): Promise<CacheInfo[]> {
  const infos: CacheInfo[] = [];

  if (isTauri) {
    try {
      const dbInfos = await invoke<CacheInfo[]>('db_get_all_cache_info');
      // Merge with localStorage in case some are not migrated yet
      const dbKeys = new Set(dbInfos.map(i => i.key));
      infos.push(...dbInfos);

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !dbKeys.has(key)) {
          const value = localStorage.getItem(key) || '';
          infos.push({ key, size: key.length * 2 + value.length * 2 });
        }
      }
    } catch (e) {
      console.error('[Storage] Tauri db_get_all_cache_info failed:', e);
      fallbackGetAllCacheInfo(infos);
    }
  } else {
    fallbackGetAllCacheInfo(infos);
  }

  return infos;
}

function fallbackGetAllCacheInfo(infos: CacheInfo[]) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key) || '';
      infos.push({ key, size: key.length * 2 + value.length * 2 });
    }
  }
}
