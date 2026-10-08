<template>
  <van-popup
    :show="visible"
    @update:show="$emit('update:visible', $event)"
    :position="isDesktop ? 'center' : 'bottom'"
    :style="isDesktop ? { width: '460px', maxHeight: '90vh', height: 'auto', borderRadius: '16px' } : { height: '100%' }"
    class="safe-padding-top asset-form-popup"
  >
    <div class="popup-content">
      <van-nav-bar
        @click-left="onClose"
      >
        <template #title>
          <div class="asset-form-title">
            <span>{{ isEdit ? '编辑资产' : '添加资产' }}</span>
          </div>
        </template>
        <template #left>
          <van-icon name="cross" size="20" />
        </template>
        <template #right>
          <button
            type="button"
            class="asset-save-button"
            :disabled="isSaving"
            @click.stop="handleSave"
          >
            {{ isSaving ? '保存中' : '保存' }}
          </button>
        </template>
      </van-nav-bar>
      <div class="form-scroll">
        <van-form>
          <van-cell-group inset>
            <div class="form-group-title">图片</div>
            <div class="asset-field asset-field--upload">
              <span class="asset-field__label">主图</span>
              <div class="upload-wrapper">
                <template v-if="previewUrl">
                  <button type="button" class="preview-thumb" @click="handlePreview">
                    <van-image
                      width="58"
                      height="58"
                      fit="cover"
                      :src="previewUrl"
                      radius="10"
                    />
                  </button>
                  <div class="upload-actions">
                    <button type="button" class="asset-plain-button" @click="triggerFilePick">
                      更换
                    </button>
                    <button type="button" class="asset-plain-button" @click="clearImage">
                      移除
                    </button>
                  </div>
                </template>
                <template v-else>
                  <button type="button" class="upload-btn" @click="triggerFilePick">
                    <van-icon name="plus" size="20" />
                  </button>
                  <span class="upload-hint">支持上传 / 预览 / 移除</span>
                </template>
                <input
                  ref="fileInputRef"
                  class="file-input"
                  type="file"
                  accept="image/*"
                  @change="onFileInputChange"
                />
              </div>
            </div>
          </van-cell-group>

          <van-cell-group inset>
            <div class="form-group-title">基本信息</div>
            <van-field v-model="form.name" label="物品名" placeholder="请输入物品名称" required />

            <van-field
              v-model="form.categoryName"
              is-link
              readonly
              label="分类"
              placeholder="选择分类"
              @click="showCategoryPicker = true"
              required
            />
            <van-popup v-model:show="showCategoryPicker" position="bottom">
              <van-picker
                :columns="categoryColumns"
                @confirm="onConfirmCategory"
                @cancel="showCategoryPicker = false"
              />
            </van-popup>

            <van-field
              v-if="currentSubCategories.length > 0"
              v-model="form.subCategoryName"
              is-link
              readonly
              label="子分类"
              placeholder="选择子分类"
              @click="showSubCategoryPicker = true"
            />
            <van-popup v-model:show="showSubCategoryPicker" position="bottom">
              <van-picker
                :columns="subCategoryColumns"
                @confirm="onConfirmSubCategory"
                @cancel="showSubCategoryPicker = false"
              />
            </van-popup>

            <div class="asset-field">
              <span class="asset-field__label required">状态</span>
              <div class="segmented">
                <button
                  v-for="status in statuses"
                  :key="status.value"
                  type="button"
                  :class="{ active: form.statusValue === status.value }"
                  @click="selectStatus(status.value, status.name)"
                >
                  {{ status.name }}
                </button>
              </div>
            </div>
          </van-cell-group>

          <van-cell-group inset>
            <div class="form-group-title">价格与时间</div>
            <van-field v-model="form.price" type="number" label="购入价" placeholder="0.00" required />
            <van-field
              v-model="form.dateStr"
              is-link
              readonly
              label="购入时间"
              placeholder="点击选择日期"
              @click="showCalendar = true"
              required
            />
            <van-calendar
              :min-date="minDate"
              :max-date="maxDate"
              v-model:show="showCalendar"
              @confirm="onConfirmDate"
            />
          </van-cell-group>

          <van-cell-group v-if="form.statusValue === 'sold'" inset class="sold-block">
            <div class="form-group-title form-group-title--sold">卖出信息（必填）</div>
            <van-field
              v-model="form.soldPrice"
              type="number"
              label="卖出价"
              placeholder="0.00"
              required
            />
            <van-field
              v-model="form.soldDateStr"
              is-link
              readonly
              label="卖出时间"
              placeholder="点击选择日期"
              @click="showSoldCalendar = true"
              required
            />
            <van-calendar
              :min-date="soldMinDate"
              :max-date="maxDate"
              v-model:show="showSoldCalendar"
              @confirm="onConfirmSoldDate"
            />
            <div class="field-tip asset-field-tip">
              {{ soldProfitPreview }}
            </div>
          </van-cell-group>

          <van-cell-group v-if="form.statusValue === 'retired'" inset class="retired-block">
            <div class="form-group-title">退役信息（必填）</div>
            <van-field
              v-model="form.retiredDateStr"
              is-link
              readonly
              label="退役时间"
              placeholder="点击选择日期"
              @click="showRetiredCalendar = true"
              required
            />
            <van-calendar
              :min-date="retiredMinDate"
              :max-date="maxDate"
              v-model:show="showRetiredCalendar"
              @confirm="onConfirmRetiredDate"
            />
            <div class="field-tip asset-field-tip">退役后停止记录使用，持有天数按退役时间冻结。</div>
          </van-cell-group>

          <van-cell-group inset>
            <div class="form-group-title">计费方式与备注</div>
            <div class="asset-field">
              <span class="asset-field__label">计费方式</span>
              <div class="segmented">
                <button
                  v-for="option in calcTypeOptions"
                  :key="option.value"
                  type="button"
                  :class="{ active: form.calcType === option.value }"
                  @click="form.calcType = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="field-tip asset-field-tip">
              只有「按次」计费才会出现记录一次与使用记录。
            </div>
            <van-field v-model="form.description" label="描述" type="textarea" placeholder="备注信息" rows="3" autosize />
          </van-cell-group>
        </van-form>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { showToast, showLoadingToast, closeToast, showImagePreview } from 'vant';
import { useAssetStore, type Asset, type AssetCategory, type AssetStatus } from '@/stores/asset';
import { buildDatedObjectKey, ensureUploadInfo, filePath2Name, parseNativeImageFileUploadInfo } from '@/lib/file';
import { getUploadUrl, uploadFile } from '@/service';
import { isTauri } from '@/constants';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useResponsive } from '@/composables/useResponsive';
import { preventBack } from '@/lib/router';
import { formatSignedCurrency } from '@/lib/format';

const { isDesktop } = useResponsive();

const props = defineProps<{
  visible: boolean;
  categories: AssetCategory[];
  statuses: AssetStatus[];
  initialData?: Asset | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void;
  (e: 'save'): void;
}>();

const store = useAssetStore();
const isEdit = computed(() => !!props.initialData);

// Form State
const form = reactive({
  name: '',
  categoryName: '',
  categoryId: '',
  subCategoryName: '',
  subCategoryId: '',
  statusName: '服役中',
  statusValue: 'active',
  price: '',
  dateStr: '',
  purchaseDate: 0,
  soldPrice: '',
  soldDateStr: '',
  soldDate: 0,
  retiredDateStr: '',
  retiredDate: 0,
  calcType: 'count',
  description: '',
  imageKey: '', // Existing image key
});

// Upload State
const fileInputRef = ref<HTMLInputElement | null>(null);
const pendingFile = ref<FileInfoItem | null>(null);
const previewUrl = ref('');
const isSaving = ref(false);

// Pickers State
const showCategoryPicker = ref(false);
const showSubCategoryPicker = ref(false);
const showCalendar = ref(false);
const showSoldCalendar = ref(false);
const showRetiredCalendar = ref(false);
const showImagePreviewState = ref(false);
let imagePreviewInstance: { close: () => void } | null | undefined = null;
const minDate = new Date(2020, 0, 1);
const maxDate = new Date();

preventBack(showCategoryPicker);
preventBack(showSubCategoryPicker);
preventBack(showCalendar);
preventBack(showSoldCalendar);
preventBack(showRetiredCalendar);
preventBack(showImagePreviewState);

// Columns
const categoryColumns = computed(() => props.categories.map(c => ({ text: c.name, value: c.id })));
const currentSubCategories = computed(() => {
  if (!form.categoryId) return [];
  const cat = props.categories.find(c => c.id === form.categoryId);
  return cat ? cat.subCategories : [];
});
const subCategoryColumns = computed(() => currentSubCategories.value.map(s => ({ text: s.name, value: s.id })));
const calcTypeOptions = [
  { label: '按次', value: 'count' },
  { label: '按天', value: 'day' },
  { label: '消耗品', value: 'consumable' },
] as const;
const soldProfitPreview = computed(() => {
  if (form.soldPrice === '' || form.price === '') return '填写后自动计算盈亏';
  const soldPrice = Number(form.soldPrice);
  const price = Number(form.price);
  if (!Number.isFinite(soldPrice) || !Number.isFinite(price)) return '填写后自动计算盈亏';
  return `预计盈亏 ${formatSignedCurrency(soldPrice - price)}`;
});
// 卖出时间不得早于购入时间
const soldMinDate = computed(() => (form.purchaseDate ? new Date(form.purchaseDate) : minDate));
const retiredMinDate = computed(() => (form.purchaseDate ? new Date(form.purchaseDate) : minDate));

// Watchers
watch(() => props.visible, (val) => {
  if (val) {
    resetForm();
    if (props.initialData) {
      loadInitialData(props.initialData);
    }
  }
});

// 切回非卖出状态时清空卖出信息
watch(() => form.statusValue, (val) => {
  if (val !== 'sold') {
    form.soldPrice = '';
    form.soldDateStr = '';
    form.soldDate = 0;
  }
  if (val !== 'retired') {
    form.retiredDateStr = '';
    form.retiredDate = 0;
  }
});

watch(showImagePreviewState, (visible) => {
  if (!visible && imagePreviewInstance) {
    imagePreviewInstance.close();
    imagePreviewInstance = null;
  }
});

const loadInitialData = (data: Asset) => {
  form.name = data.name;
  form.categoryId = data.categoryId;
  form.subCategoryId = data.subCategoryId || '';
  form.statusValue = data.status;
  form.price = String(data.price);
  form.purchaseDate = data.purchaseDate;
  form.soldPrice = data.soldPrice === null || data.soldPrice === undefined ? '' : String(data.soldPrice);
  form.soldDate = data.soldDate || 0;
  form.soldDateStr = data.soldDate ? formatDateStr(new Date(data.soldDate)) : '';
  form.retiredDate = data.retiredDate || 0;
  form.retiredDateStr = data.retiredDate ? formatDateStr(new Date(data.retiredDate)) : '';
  form.calcType = data.calcType;
  form.description = data.description || '';
  form.imageKey = data.image || '';

  // Set names
  const cat = props.categories.find(c => c.id === data.categoryId);
  form.categoryName = cat ? cat.name : '';

  if (data.subCategoryId && cat) {
      const sub = cat.subCategories.find(s => s.id === data.subCategoryId);
      form.subCategoryName = sub ? sub.name : '';
  }

  const status = props.statuses.find(s => s.value === data.status);
  form.statusName = status ? status.name : '';

  const date = new Date(data.purchaseDate);
  form.dateStr = formatDateStr(date);

  // Preview
  if (data.image) {
      if (data.image.startsWith('http')) {
          previewUrl.value = data.image;
      } else {
          // Check if data has 'cover' (the full url generated by backend)
          if ((data as any).cover) {
             previewUrl.value = (data as any).cover;
          } else {
             const cdn = import.meta.env.VITE_BITIFUL_CDN || '';
             previewUrl.value = `${cdn}/${data.image}?style=cover`;
          }
      }
  }
};

const resetForm = () => {
  form.name = '';
  form.categoryName = '';
  form.categoryId = '';
  form.subCategoryName = '';
  form.subCategoryId = '';
  form.statusName = '服役中';
  form.statusValue = 'active';
  form.price = '';
  form.dateStr = '';
  form.purchaseDate = 0;
  form.soldPrice = '';
  form.soldDateStr = '';
  form.soldDate = 0;
  form.retiredDateStr = '';
  form.retiredDate = 0;
  form.calcType = 'count';
  form.description = '';
  form.imageKey = '';

  pendingFile.value = null;
  previewUrl.value = '';
};

const onClose = () => {
  if (isSaving.value) return;
  emit('update:visible', false);
};

// Picker Confirm Handlers
const onConfirmCategory = ({ selectedOptions }: any) => {
  form.categoryName = selectedOptions[0].text;
  form.categoryId = selectedOptions[0].value;
  form.subCategoryName = '';
  form.subCategoryId = '';
  showCategoryPicker.value = false;
};

const onConfirmSubCategory = ({ selectedOptions }: any) => {
  form.subCategoryName = selectedOptions[0].text;
  form.subCategoryId = selectedOptions[0].value;
  showSubCategoryPicker.value = false;
};

const selectStatus = (value: AssetStatus['value'], name: string) => {
  form.statusValue = value;
  form.statusName = name;
};

const formatDateStr = (date: Date) => {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

const onConfirmDate = (date: Date) => {
  form.dateStr = formatDateStr(date);
  form.purchaseDate = date.getTime();
  showCalendar.value = false;
};

const onConfirmSoldDate = (date: Date) => {
  form.soldDateStr = formatDateStr(date);
  form.soldDate = date.getTime();
  showSoldCalendar.value = false;
};

const onConfirmRetiredDate = (date: Date) => {
  form.retiredDateStr = formatDateStr(date);
  form.retiredDate = date.getTime();
  showRetiredCalendar.value = false;
};

// File Handling
const clearImage = () => {
    pendingFile.value = null;
    form.imageKey = '';
    previewUrl.value = '';
};

const handlePreview = () => {
    if (previewUrl.value) {
        showImagePreviewState.value = true;
        imagePreviewInstance = showImagePreview({
            images: [previewUrl.value],
            closeable: true,
            onClose: () => {
                showImagePreviewState.value = false;
                imagePreviewInstance = null;
            }
        }) as unknown as { close: () => void };
    }
};

// Web Upload Selection
const preparePendingFile = async (rawFile: File) => {
  const fileInfoItem = {
    file: rawFile,
    name: rawFile.name,
    lastModified: rawFile.lastModified,
    date: new Date(rawFile.lastModified),
    objectUrl: URL.createObjectURL(rawFile),
  } as FileInfoItem;

  await ensureUploadInfo(fileInfoItem);

  pendingFile.value = fileInfoItem;
  previewUrl.value = fileInfoItem.objectUrl;
};

const onFileInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const rawFile = input.files?.[0];
  if (rawFile) {
    await preparePendingFile(rawFile);
  }
  input.value = '';
};

// Tauri Upload Selection
const handleOpenFile = async () => {
  const selected = await open({
    multiple: false,
    filters: [{
      name: 'Image',
      extensions: ['png', 'jpeg', 'webp', 'gif']
    }]
  });

  if (!selected) return;
  const filePath = selected as string; // Single file

  // Parse info
  const fileInfo = await parseNativeImageFileUploadInfo(filePath);
  if (!fileInfo) {
      showToast('解析文件失败');
      return;
  }

  // Add filePath for Tauri upload
  (fileInfo as any).filePath = filePath;

  pendingFile.value = fileInfo;
  previewUrl.value = fileInfo.objectUrl;
};

const triggerFilePick = () => {
  if (isTauri) {
    void handleOpenFile();
    return;
  }
  fileInputRef.value?.click();
};

const generateAssetKey = (fileInfo: FileInfoItem) => {
  return buildDatedObjectKey('assets', fileInfo)
};

const handleSave = async () => {
  if (isSaving.value) return;

  if (!form.name || !form.categoryId || !form.price || !form.purchaseDate) {
    showToast('请填写必填项');
    return;
  }

  const isSold = form.statusValue === 'sold';
  const isRetired = form.statusValue === 'retired';

  if (isSold) {
    const soldPrice = Number(form.soldPrice);
    if (form.soldPrice === '' || !Number.isFinite(soldPrice) || soldPrice < 0) {
      showToast('请填写卖出价格');
      return;
    }
    if (!form.soldDate) {
      showToast('请选择卖出时间');
      return;
    }
    if (form.soldDate < form.purchaseDate) {
      showToast('卖出时间不能早于购入时间');
      return;
    }
    if (form.soldDate > Date.now()) {
      showToast('卖出时间不能晚于今天');
      return;
    }
  }

  if (isRetired) {
    if (!form.retiredDate) {
      showToast('请选择退役时间');
      return;
    }
    if (form.retiredDate < form.purchaseDate) {
      showToast('退役时间不能早于购入时间');
      return;
    }
    if (form.retiredDate > Date.now()) {
      showToast('退役时间不能晚于今天');
      return;
    }
  }

  isSaving.value = true;
  showLoadingToast({ message: '保存中...', forbidClick: true });

  try {
    let imageKey = form.imageKey;

    // 1. Upload if pending file exists
    if (pendingFile.value) {
        showLoadingToast({ message: '上传图片中...', forbidClick: true });

        const fileInfo = pendingFile.value;
        const key = generateAssetKey(fileInfo);
        const uploadUrl = await getUploadUrl(key);

        if (isTauri && (fileInfo as any).filePath) {
             await invoke('upload_file', {
                key: key,
                path: (fileInfo as any).filePath,
                url: uploadUrl
             });
        } else {
             await uploadFile(fileInfo.file, uploadUrl);
        }
        imageKey = key;
    }

    showLoadingToast({ message: '保存数据中...', forbidClick: true });

    // 2. Save Asset
    const assetData = {
        name: form.name,
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId,
        status: form.statusValue as any,
        price: Number(form.price),
        purchaseDate: form.purchaseDate,
        soldPrice: isSold ? Number(form.soldPrice) : null,
        soldDate: isSold ? form.soldDate : null,
        retiredDate: isRetired ? form.retiredDate : null,
        usageCount: props.initialData ? props.initialData.usageCount : 0,
        description: form.description,
        image: imageKey,
        calcType: form.calcType as any
    };

    if (props.initialData) {
        await store.updateAsset(props.initialData.id, assetData);
    } else {
        await store.addAsset(assetData);
    }

    // 保存完成后先解除锁，再触发父级动作和关闭，避免 close 被保存态拦截。
    isSaving.value = false;
    closeToast();
    showToast('保存成功');
    emit('save');
    onClose();

  } catch (e) {
      closeToast();
      showToast('保存失败');
      console.error(e);
  } finally {
      isSaving.value = false;
  }
};
</script>

<style scoped lang="scss">
.asset-form-popup {
  overflow: hidden;
  background: #f6f7f9;
}

.popup-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f6f7f9;

  :deep(.van-nav-bar) {
    --van-nav-bar-height: 56px;
    background: rgba(255, 255, 255, 0.94);
    border-bottom: 1px solid #eceef1;
    backdrop-filter: saturate(160%) blur(12px);
  }

  :deep(.van-nav-bar__title) {
    max-width: none;
    margin: 0;
    padding: 0 84px 0 44px;
    box-sizing: border-box;
    text-align: left;
  }

  :deep(.van-nav-bar__left) {
    padding: 0 4px 0 12px;
  }

  :deep(.van-nav-bar__right) {
    padding-right: 12px;
  }

  .form-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px 28px;
  }
}

.asset-form-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.1;

  span {
    color: #23262b;
    font-size: 17px;
    font-weight: 600;
  }
}

.asset-save-button {
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  background: #1989fa;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.asset-save-button:disabled {
  opacity: 0.6;
}

.popup-content :deep(.van-cell-group--inset) {
  margin: 0 0 14px;
  overflow: hidden;
  border: 1px solid #eceef1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
}

.form-group-title {
  padding: 12px 16px 6px;
  background: #fff;
  color: #8f949c;
  font-size: 12px;
  line-height: 1.3;
}

.popup-content :deep(.van-cell) {
  padding: 13px 16px;
  background: #fff;
  color: #23262b;
  font-size: 14px;
  border-bottom: 1px solid #eceef1;
}

.popup-content :deep(.van-cell::after) {
  display: none;
}

.popup-content :deep(.van-cell:last-child) {
  border-bottom: 0;
}

.popup-content :deep(.van-field__label) {
  width: 78px;
  margin-right: 12px;
  color: #5c6169;
  font-size: 14px;
}

.popup-content :deep(.van-field__control) {
  color: #23262b;
  font-size: 14px;
  text-align: right;
}

.popup-content :deep(textarea.van-field__control) {
  text-align: left;
}

.popup-content :deep(.van-field__control::placeholder) {
  color: #8f949c;
}

.popup-content :deep(.van-field--error .van-field__control) {
  color: #ee0a24;
}

.asset-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 10px 16px;
  border-top: 1px solid #eceef1;
  background: #fff;
  box-sizing: border-box;
}

.form-group-title + .asset-field {
  border-top: 0;
}

.asset-field__label {
  width: 78px;
  flex: 0 0 auto;
  color: #5c6169;
  font-size: 14px;

  &.required::before {
    content: '*';
    margin-right: 2px;
    color: #ee0a24;
  }
}

.asset-field--upload {
  align-items: flex-start;
  border-top: 0;
}

.segmented {
  display: inline-flex;
  flex: 1;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: #f1f3f6;

  button {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #5c6169;
    font-size: 13px;
    white-space: nowrap;
  }

  button.active {
    background: #fff;
    color: #1989fa;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
  }
}

.sold-block {
  background: #fffaf3;
}

.sold-block .form-group-title {
  background: #fffaf3;
  color: #ff8f1f;
}

.sold-block :deep(.van-cell),
.sold-block .asset-field {
  background: #fffaf3;
}

.retired-block {
  background: #f7f8fa;
}

.retired-block .form-group-title,
.retired-block :deep(.van-cell) {
  background: #f7f8fa;
}

.asset-field-tip {
  padding: 0 16px 12px;
  background: inherit;
  color: #8f949c;
  font-size: 12px;
  line-height: 1.6;
}

@media (min-width: 480px) {
  .popup-content {
    max-height: 90vh;
    display: flex;
    flex-direction: column;

    .form-scroll {
      flex: 1;
      overflow-y: auto;
    }
  }
}

.upload-wrapper {
  display: flex;
  flex: 1;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 58px;
    padding: 0;
    border: 1px dashed #e3e6ea;
    border-radius: 10px;
    background: #f6f7f9;
    color: #8f949c;
  }

  .preview-thumb {
    display: inline-flex;
    padding: 0;
    border: 0;
    border-radius: 10px;
    overflow: hidden;
    background: transparent;
    line-height: 0;
  }

  .upload-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .upload-hint {
    color: #8f949c;
    font-size: 12px;
  }
}

.file-input {
  display: none;
}

.asset-plain-button {
  padding: 7px 11px;
  border: 1px solid #e3e6ea;
  border-radius: 999px;
  background: #fff;
  color: #5c6169;
  font-size: 12px;
}
</style>
