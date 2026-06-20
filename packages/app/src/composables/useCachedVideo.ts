import { ref } from 'vue';
import { isTauri } from '@/constants';
import { BaseDirectory, writeFile, lstat, mkdir } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import SparkMD5 from 'spark-md5';
import pLimit from 'p-limit';
import { isCacheDisabled } from '@/composables/useCachedImage';

const limit = pLimit(2);
const downloadLimit = pLimit(1);
const VIDEO_CACHE_DIR = 'video_cache';

const videoMemoryCache = new Map<string, string>();
const videoProcessingCache = new Map<string, Promise<string>>();
let videoCacheDirPromise: Promise<void> | null = null;
let videoCachedBaseDir: string | null = null;

async function initVideoCache() {
  if (!isTauri) return;
  if (videoCacheDirPromise) return videoCacheDirPromise;
  videoCacheDirPromise = (async () => {
    await mkdir(VIDEO_CACHE_DIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
    videoCachedBaseDir = await appLocalDataDir();
  })();
  return videoCacheDirPromise;
}

initVideoCache();

function guessVideoExt(url: string): string {
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  if (ext === 'mov' || ext === 'mp4') return ext;
  return 'mp4';
}

export async function cacheVideo(
  url: string,
  cacheKey?: string,
  forceRefresh = false,
  waitForDownload = false,
): Promise<string> {
  if (!isTauri || isCacheDisabled.value) return url;
  if (!url || !url.startsWith('http')) return url;

  const memKey = cacheKey ? `key:${cacheKey}` : url;

  if (!forceRefresh && videoMemoryCache.has(memKey)) {
    return videoMemoryCache.get(memKey)!;
  }

  if (!forceRefresh && videoProcessingCache.has(memKey)) {
    return videoProcessingCache.get(memKey)!;
  }

  const processPromise = limit(async () => {
    if (!forceRefresh && videoMemoryCache.has(memKey)) {
      return videoMemoryCache.get(memKey)!;
    }

    try {
      await initVideoCache();
      const hashContent = cacheKey || url;
      const hash = SparkMD5.hash(hashContent);
      const filename = `${hash}.${guessVideoExt(url)}`;
      const filePath = `${VIDEO_CACHE_DIR}/${filename}`;
      const cacheBase = videoCachedBaseDir || await appLocalDataDir();
      const absolutePath = await join(cacheBase, VIDEO_CACHE_DIR, filename);

      let fileExists = false;
      if (!forceRefresh) {
        try {
          await lstat(filePath, { baseDir: BaseDirectory.AppLocalData });
          fileExists = true;
        } catch {
          fileExists = false;
        }
      }

      if (fileExists) {
        const src = convertFileSrc(absolutePath);
        videoMemoryCache.set(memKey, src);
        return src;
      }

      const fetchAndCache = async () => {
        try {
          const response = await fetch(url, { method: 'GET' });
          if (!response.ok) {
            throw new Error(`Failed to fetch video ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength < 1024) {
            throw new Error(`Video too small: ${arrayBuffer.byteLength} bytes`);
          }
          await writeFile(filePath, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppLocalData });
          const src = convertFileSrc(absolutePath);
          videoMemoryCache.set(memKey, src);
          return src;
        } catch (e) {
          console.error('[VideoCache] Async download failed:', e);
          return url;
        }
      };

      if (waitForDownload) {
        return (await downloadLimit(() => fetchAndCache())) || url;
      }
      downloadLimit(() => fetchAndCache());
      return url;
    } catch (e) {
      console.error('[VideoCache] cacheVideo failed:', e);
      return url;
    } finally {
      videoProcessingCache.delete(memKey);
    }
  });

  videoProcessingCache.set(memKey, processPromise);
  return processPromise;
}

export function useCachedLiveVideoUrl() {
  const cachedUrl = ref('');

  async function updateVideoUrl(url: string | undefined, cacheKey?: string) {
    if (!url) {
      cachedUrl.value = '';
      return;
    }
    if (!isTauri) {
      cachedUrl.value = url;
      return;
    }
    cachedUrl.value = await cacheVideo(url, cacheKey, false, true);
  }

  return { cachedUrl, updateVideoUrl };
}
