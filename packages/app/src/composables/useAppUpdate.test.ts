import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateWebPackage: vi.fn(),
  closeToast: vi.fn(),
  fetchAppUpdate: vi.fn(),
  getLocalAppVersion: vi.fn(() => '0.9.5'),
  getNativePlatform: vi.fn(async () => 'android'),
  prepareWebPackage: vi.fn(),
  reloadAfterWebUpdate: vi.fn(),
  showConfirmDialog: vi.fn(() => new Promise(() => {})),
  showLoadingToast: vi.fn(() => ({})),
  showToast: vi.fn(),
}));

vi.mock('vant', () => ({
  closeToast: mocks.closeToast,
  showConfirmDialog: mocks.showConfirmDialog,
  showLoadingToast: mocks.showLoadingToast,
  showToast: mocks.showToast,
}));

vi.mock('@/lib/app-update', () => ({
  activateWebPackage: mocks.activateWebPackage,
  fetchAppUpdate: mocks.fetchAppUpdate,
  getLocalAppVersion: mocks.getLocalAppVersion,
  getNativePlatform: mocks.getNativePlatform,
  prepareWebPackage: mocks.prepareWebPackage,
  reloadAfterWebUpdate: mocks.reloadAfterWebUpdate,
}));

const apkUpdate = {
  hasUpdate: true,
  currentVersion: '0.9.5',
  latestVersion: '0.9.6',
  description: '修复资产保存返回',
  downloadUrl: 'https://example.com/app.apk',
  forceUpdate: false,
  md5: 'md5',
  fileSize: 1024,
  updateKind: 'apk',
};

describe('useAppUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAppUpdate.mockResolvedValue(apkUpdate);
  });

  it('启动静默检查发现 APK 更新时只返回信息，不弹确认框', async () => {
    const { useAppUpdate } = await import('./useAppUpdate');

    const info = await useAppUpdate().check({ silent: true });

    expect(info?.updateKind).toBe('apk');
    expect(mocks.fetchAppUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.showConfirmDialog).not.toHaveBeenCalled();
  });

  it('设置页手动检查仍使用确认弹窗', async () => {
    const { useAppUpdate } = await import('./useAppUpdate');

    await useAppUpdate().check({ silent: false });

    expect(mocks.showConfirmDialog).toHaveBeenCalledTimes(1);
  });
});
