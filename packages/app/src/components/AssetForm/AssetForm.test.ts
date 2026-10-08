import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssetForm from './AssetForm.vue';

const mocks = vi.hoisted(() => ({
  addAsset: vi.fn(),
  updateAsset: vi.fn(),
}));

vi.mock('@/stores/asset', () => ({
  useAssetStore: () => ({
    addAsset: mocks.addAsset,
    updateAsset: mocks.updateAsset,
  }),
}));

vi.mock('@/composables/useResponsive', async () => {
  const { ref } = await import('vue');
  return {
    useResponsive: () => ({ isDesktop: ref(false) }),
  };
});

vi.mock('@/lib/router', () => ({
  preventBack: vi.fn(),
}));

vi.mock('@/lib/file', () => ({
  buildDatedObjectKey: vi.fn(),
  ensureUploadInfo: vi.fn(),
  filePath2Name: vi.fn(),
  parseNativeImageFileUploadInfo: vi.fn(),
}));

vi.mock('@/service', () => ({
  getUploadUrl: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock('vant', () => ({
  closeToast: vi.fn(),
  showImagePreview: vi.fn(),
  showLoadingToast: vi.fn(() => ({})),
  showToast: vi.fn(),
}));

const asset = {
  id: 'asset-1',
  name: '相机',
  categoryId: 'camera',
  subCategoryId: '',
  status: 'active',
  price: 1000,
  purchaseDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
  soldPrice: null,
  soldDate: null,
  retiredDate: null,
  calcType: 'count',
  description: '',
  image: '',
  usageCount: 0,
};

function mountForm() {
  return mount(AssetForm, {
    props: {
      visible: false,
      categories: [{ id: 'camera', name: '数码', subCategories: [] }],
      statuses: [{ id: 'active', name: '服役中', value: 'active' }],
      initialData: asset as any,
    },
    global: {
      stubs: {
        'van-popup': {
          props: ['show'],
          template: '<div v-if="show"><slot /></div>',
        },
        'van-nav-bar': {
          template: '<div><slot name="left" /><slot name="title" /><slot name="right" /></div>',
        },
        'van-form': { template: '<form><slot /></form>' },
        'van-cell-group': { template: '<div><slot /></div>' },
        'van-field': true,
        'van-icon': true,
        'van-picker': true,
        'van-calendar': true,
        'van-image': true,
      },
    },
  });
}

describe('AssetForm 保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addAsset.mockResolvedValue(undefined);
    mocks.updateAsset.mockResolvedValue(undefined);
  });

  it('编辑保存成功后触发一次保存事件并关闭弹层', async () => {
    const wrapper = mountForm();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    await wrapper.find('.asset-save-button').trigger('click');
    await flushPromises();

    expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('连续点击保存只提交一次', async () => {
    const wrapper = mountForm();
    await wrapper.setProps({ visible: true });
    await flushPromises();

    const button = wrapper.find('.asset-save-button');
    await Promise.all([button.trigger('click'), button.trigger('click')]);
    await flushPromises();

    expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('save')).toHaveLength(1);
    wrapper.unmount();
  });
});
