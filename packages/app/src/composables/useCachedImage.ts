
import { ref, watchEffect, toValue, type MaybeRef } from 'vue';
import { isTauri } from '@/constants';
import { BaseDirectory, writeFile, lstat, mkdir } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appCacheDir, join } from '@tauri-apps/api/path';
import SparkMD5 from 'spark-md5';
import pLimit from 'p-limit';

const limit = pLimit(4); // Limit concurrent file operations
const downloadLimit = pLimit(1); // Limit concurrent background downloads
const CACHE_DIR_NAME = 'image_cache';
export const MEMORY_CACHE_STORAGE_KEY = 'image_memory_cache_v1';

// Cache for in-memory URLs to avoid repeated checks for the same URL in the same session
// Initialize from localStorage to persist across app restarts
let memoryCache = new Map<string, string>();
try {
  const savedCache = localStorage.getItem(MEMORY_CACHE_STORAGE_KEY);
  if (savedCache) {
    const parsed = JSON.parse(savedCache);
    memoryCache = new Map(Object.entries(parsed));
  }
} catch (e) {
  console.error('[ImageCache] Failed to load memory cache from storage', e);
}

// Helper to save memory cache to storage (debounced and idle-scheduled)
let persistTimer: number | null = null;
function persistMemoryCache() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = window.setTimeout(() => {
    const saveTask = () => {
      try {
        const obj = Object.fromEntries(memoryCache.entries());
        localStorage.setItem(MEMORY_CACHE_STORAGE_KEY, JSON.stringify(obj));
        console.log('[ImageCache] Memory cache persisted to storage');
      } catch (e) {
        console.error('[ImageCache] Failed to save memory cache', e);
      }
    };

    // Use requestIdleCallback if available, otherwise just execute
    if ('requestIdleCallback' in window) {
      // (window as any).requestIdleCallback(saveTask);
      saveTask();
    } else {
      saveTask();
    }
  }, 2000); // 2 seconds debounce
}

// Ensure cache directory exists and base path is cached
let cacheDirPromise: Promise<string> | null = null;
let cachedBaseDir: string | null = null;

export async function initImageCache() {
  if (!isTauri) return;
  if (cacheDirPromise) return cacheDirPromise;

  const start = performance.now();
  console.log('[ImageCache] Initializing cache dir...');
  cacheDirPromise = (async () => {
    try {
      await mkdir(CACHE_DIR_NAME, { baseDir: BaseDirectory.AppCache, recursive: true });
      cachedBaseDir = await appCacheDir();
      console.log('[ImageCache] Initialized successfully. Base:', cachedBaseDir);
      return CACHE_DIR_NAME;
    } catch (e) {
      console.error('[ImageCache] Failed to init cache dir', e);
      return CACHE_DIR_NAME;
    } finally {
      console.log('[ImageCache] Cache dir initialized in', performance.now() - start, 'ms');
    }
  })();

  return cacheDirPromise;
}

// Ensure it's initialized but don't strictly block export, just in case
initImageCache();

// Use a promise cache to prevent concurrent processing of the same image
const processingCache = new Map<string, Promise<string>>();

/**
 * Cache an image URL to local filesystem and return the local path.
 * @param url The remote URL of the image
 * @param cacheKey Optional unique key for the image. If provided, it will be used for the filename hash instead of the URL.
 *                 Useful for signed URLs where the signature changes but the image is the same.
 */
export async function cacheImage(url: string, cacheKey?: string): Promise<string> {
  if (!isTauri) return url;
  if (!url || !url.startsWith('http')) return url;

  const totalStart = performance.now();

  // Use cacheKey for memory cache if available, otherwise URL
  const memKey = cacheKey ? `key:${cacheKey}` : url;

  if (memoryCache.has(memKey)) {
    return memoryCache.get(memKey)!;
  }

  // If this exact image is already being processed, wait for that promise instead of starting a new one
  if (processingCache.has(memKey)) {
    return processingCache.get(memKey)!;
  }

  const processPromise = limit(async () => {
    // Double check memory cache in case it was populated while waiting in the limit queue
    if (memoryCache.has(memKey)) {
      return memoryCache.get(memKey)!;
    }

    try {
      // Fast path: Don't check/create dir on every single image call.
      // We only need to ensure it once per session, which initImageCache() already handles,
      // but we await it here just to be safe if it wasn't ready yet.

      const hashStart = performance.now();
      const hashContent = cacheKey || url;
      const hash = SparkMD5.hash(hashContent);
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      const safeExt = ext.replace(/[^a-z0-9]/gi, '').substring(0, 4) || 'jpg';
      const filename = `${hash}.${safeExt}`;
      const filePath = `${CACHE_DIR_NAME}/${filename}`;

      // Calculate absolute path using the cached base dir
      // Fallback to appCacheDir() just in case it failed to cache
      const cacheBase = cachedBaseDir || await appCacheDir();
      const absolutePath = await join(cacheBase, CACHE_DIR_NAME, filename);
      const hashEnd = performance.now();

      // Check if file exists
      let fileExists = false;
      const statStart = performance.now();
      try {
        await lstat(filePath, { baseDir: BaseDirectory.AppCache });
        fileExists = true;
      } catch (e) {
        fileExists = false;
      }
      const statEnd = performance.now();

      if (fileExists) {
        const convertStart = performance.now();
        const src = convertFileSrc(absolutePath);
        const convertEnd = performance.now();

        memoryCache.set(memKey, src);
        persistMemoryCache();
        console.log(`[Cache Hit] ${filename} - Total: ${(performance.now() - totalStart).toFixed(2)}ms (Hash&Path: ${(hashEnd-hashStart).toFixed(2)}ms, Stat: ${(statEnd-statStart).toFixed(2)}ms, Convert: ${(convertEnd-convertStart).toFixed(2)}ms)`);
        return src;
      } else {
        // Asynchronous download, return original URL immediately
        const fetchAndCache = async () => {
          try {
            const fetchStart = performance.now();
            const response = await fetch(url, {
              method: 'GET',
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch ${response.status} ${response.statusText} from ${url}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const fetchEnd = performance.now();

            const writeStart = performance.now();
            await writeFile(filePath, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppCache });
            const writeEnd = performance.now();

            const convertStart = performance.now();
            const src = convertFileSrc(absolutePath);
            const convertEnd = performance.now();

            memoryCache.set(memKey, src);
            persistMemoryCache();
            console.log(`[Cache Downloaded] ${filename} - Async Total: ${(performance.now() - fetchStart).toFixed(2)}ms (Fetch: ${(fetchEnd-fetchStart).toFixed(2)}ms, Write: ${(writeEnd-writeStart).toFixed(2)}ms, Convert: ${(convertEnd-convertStart).toFixed(2)}ms)`);
          } catch (e) {
            console.error('[ImageCache] Async download failed:', e);
          }
        };

        // Fire and forget
        downloadLimit(() => fetchAndCache());

        console.log(`[Cache Miss/Return URL] ${filename} - Returned in ${(performance.now() - totalStart).toFixed(2)}ms`);
        return url;
      }
    } catch (e) {
      console.error('Cache image failed:', e);
      return url;
    } finally {
      // Clean up the processing cache when done
      processingCache.delete(memKey);
    }
  });

  processingCache.set(memKey, processPromise);
  return processPromise;
}

export function useCachedImage(url: MaybeRef<string | undefined>, cacheKey?: MaybeRef<string | undefined>) {
  const cachedSrc = ref<string>('');

  if (!isTauri) {
    watchEffect(() => {
      cachedSrc.value = toValue(url) || '';
    });
    return cachedSrc;
  }

  watchEffect(async () => {
    const targetUrl = toValue(url);
    const key = toValue(cacheKey);

    if (!targetUrl) {
      cachedSrc.value = '';
      return;
    }

    // Check memory cache synchronously to avoid microtask flicker
    const memKey = key ? `key:${key}` : targetUrl;
    if (memoryCache.has(memKey)) {
      cachedSrc.value = memoryCache.get(memKey)!;
      return;
    }

    // Clear the previous image before starting async work
    // to prevent displaying old images when recycled in virtual lists
    cachedSrc.value = '';

    cachedSrc.value = await cacheImage(targetUrl, key);
  });

  return cachedSrc;
}
