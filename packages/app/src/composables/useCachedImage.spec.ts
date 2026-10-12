import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock, lstatMock, mkdirMock, removeMock, writeFileMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  lstatMock: vi.fn(),
  mkdirMock: vi.fn(),
  removeMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('@/constants', () => ({
  isTauri: true,
  UploadStatus: { PENDING: 0, UPLOADING: 1, SUCCESS: 2, ERROR: 3, DUPLICATE: 4 },
  OFFLINE_USERNAME: 'local',
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppLocalData: 'appLocalData' },
  writeFile: writeFileMock,
  lstat: lstatMock,
  mkdir: mkdirMock,
  remove: removeMock,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: async () => '/cache',
  join: async (...parts: string[]) => parts.join('/'),
}));

vi.mock('@/lib/storage', () => ({
  getLocalCache: vi.fn(async () => undefined),
  setLocalCache: vi.fn(async () => undefined),
  removeLocalCache: vi.fn(async () => undefined),
}));

import { cacheImage, resolveImageCacheKey } from './useCachedImage';

describe('image cache identity', () => {
  it('keeps presigned cover URLs stable across signature changes', () => {
    const firstUrl = 'https://cdn.example.com/photos/cat!style:cover?_btf_tk=one&_ts=100';
    const secondUrl = 'https://cdn.example.com/photos/cat!style:cover?_btf_tk=two&_ts=200';

    expect(resolveImageCacheKey(firstUrl)).toBe('cdn.example.com/photos/cat!style:cover');
    expect(resolveImageCacheKey(secondUrl)).toBe(resolveImageCacheKey(firstUrl));
  });

  it('normalizes object keys and keeps purposes isolated', () => {
    expect(resolveImageCacheKey(undefined, 'photos//cat_cover')).toBe('photos/cat_cover');
    expect(resolveImageCacheKey(undefined, 'photos/cat_cover'))
      .not.toBe(resolveImageCacheKey(undefined, 'photos/cat_preview'));
  });
});

describe('image cache downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lstatMock.mockRejectedValue(new Error('file not found'));
    mkdirMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  it('returns the remote URL immediately and dedupes concurrent downloads', async () => {
    const firstUrl = 'https://cdn.example.com/photos/cat?signature=one';
    const secondUrl = 'https://cdn.example.com/photos/cat?signature=two';
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    });

    const firstResult = await cacheImage(firstUrl, 'photos/cat_cover');
    const secondResult = await cacheImage(secondUrl, 'photos/cat_cover');

    expect(firstResult).toBe(firstUrl);
    expect(secondResult).toBe(secondUrl);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock.mock.calls[0][0]).toBe(firstUrl);
  });

  it('keeps the remote URL fallback when the background download fails', async () => {
    const url = 'https://cdn.example.com/photos/dog?signature=broken';
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(cacheImage(url, 'photos/dog_cover')).resolves.toBe(url);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
