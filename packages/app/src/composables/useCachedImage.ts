
import { ref, watchEffect, toValue, type MaybeRef } from 'vue';
import { isTauri } from '@/constants';
import { BaseDirectory, writeFile, lstat, mkdir } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appCacheDir, join } from '@tauri-apps/api/path';
import SparkMD5 from 'spark-md5';
import pLimit from 'p-limit';

const limit = pLimit(4); // Limit concurrent downloads
const CACHE_DIR_NAME = 'image_cache';

// Cache for in-memory URLs to avoid repeated checks for the same URL in the same session
const memoryCache = new Map<string, string>();

// Ensure cache directory exists
let cacheDirPromise: Promise<string> | null = null;

async function getCacheDir() {
  if (cacheDirPromise) return cacheDirPromise;

  cacheDirPromise = (async () => {
    try {
      await mkdir(CACHE_DIR_NAME, { baseDir: BaseDirectory.AppCache, recursive: true });
      return CACHE_DIR_NAME;
    } catch (e) {
      console.error('Failed to create cache dir', e);
      return CACHE_DIR_NAME;
    }
  })();

  return cacheDirPromise;
}

/**
 * Cache an image URL to local filesystem and return the local path.
 * @param url The remote URL of the image
 * @param cacheKey Optional unique key for the image. If provided, it will be used for the filename hash instead of the URL.
 *                 Useful for signed URLs where the signature changes but the image is the same.
 */
export async function cacheImage(url: string, cacheKey?: string): Promise<string> {
  if (!isTauri) return url;
  if (!url || !url.startsWith('http')) return url;

  // Use cacheKey for memory cache if available, otherwise URL
  // We suffix with 'key:' to distinguish from raw URLs if needed, but here simple string is fine
  const memKey = cacheKey ? `key:${cacheKey}` : url;

  if (memoryCache.has(memKey)) {
    return memoryCache.get(memKey)!;
  }

  return limit(async () => {
    // Double check memory cache
    if (memoryCache.has(memKey)) {
      return memoryCache.get(memKey)!;
    }

    try {
      await getCacheDir();
      // Use provided key for hashing, or fallback to URL
      const hashContent = cacheKey || url;
      const hash = SparkMD5.hash(hashContent);
      // Try to guess extension from URL
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      // Sanitize extension
      const safeExt = ext.replace(/[^a-z0-9]/gi, '').substring(0, 4) || 'jpg';
      const filename = `${hash}.${safeExt}`;
      const filePath = `${CACHE_DIR_NAME}/${filename}`;

      // Check if file exists
      let fileExists = false;
      try {
        await lstat(filePath, { baseDir: BaseDirectory.AppCache });
        fileExists = true;
      } catch (e) {
        fileExists = false;
      }

      if (fileExists) {
        const cacheBase = await appCacheDir();
        const absolutePath = await join(cacheBase, CACHE_DIR_NAME, filename);
        const src = convertFileSrc(absolutePath);

        memoryCache.set(memKey, src);
        return src;
      } else {
        // Download
        const response = await fetch(url, {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch ${response.status} ${response.statusText} from ${url}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await writeFile(filePath, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppCache });

        const cacheBase = await appCacheDir();
        const absolutePath = await join(cacheBase, CACHE_DIR_NAME, filename);
        const src = convertFileSrc(absolutePath);

        memoryCache.set(memKey, src);
        return src;
      }
    } catch (e) {
      console.error('Cache image failed:', e);
      return url;
    }
  });
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

    cachedSrc.value = await cacheImage(targetUrl, key);
  });

  return cachedSrc;
}
