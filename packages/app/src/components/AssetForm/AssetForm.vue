<template>
  <van-popup
    :show="visible"
    @update:show="$emit('update:visible', $event)"
    position="bottom"
    :style="{ height: '100%' }"
    class="safe-padding-top"
  >
    <div class="popup-content">
      <van-nav-bar
        :title="isEdit ? '编辑资产' : '添加资产'"
        right-text="保存"
        left-arrow
        @click-left="onClose"
        @click-right="handleSave"
      />
      <div class="form-scroll">
        <van-form>
          <van-cell-group inset title="基本信息">
            <van-field name="uploader" label="图片">
              <template #input>
                 <div class="upload-wrapper">
                    <template v-if="previewUrl">
                        <div class="preview-box">
                             <van-image
                                width="80"
                                height="80"
                                fit="cover"
                                :src="previewUrl"
                                radius="4"
                                @click="handlePreview"
                             />
                             <div class="delete-icon" @click.stop="clearImage">
                                <van-icon name="cross" color="#fff" size="12" />
                             </div>
                        </div>
                    </template>
                    <template v-else>
                         <van-button v-if="isTauri" icon="plus" type="default" class="upload-btn" @click="handleOpenFile" />
                         <van-uploader v-else v-model="fileList" :max-count="1" :after-read="afterRead" />
                    </template>
                 </div>
              </template>
            </van-field>

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

            <van-field
              v-model="form.statusName"
              is-link
              readonly
              label="状态"
              placeholder="选择状态"
              @click="showStatusPicker = true"
              required
            />
            <van-popup v-model:show="showStatusPicker" position="bottom">
              <van-picker
                :columns="statusColumns"
                @confirm="onConfirmStatus"
                @cancel="showStatusPicker = false"
              />
            </van-popup>

            <van-field v-model="form.price" type="number" label="金额" placeholder="0.00" required />

            <van-field
              v-model="form.dateStr"
              is-link
              readonly
              label="购入时间"
              placeholder="点击选择日期"
              @click="showCalendar = true"
              required
            />
            <van-calendar :min-date="minDate" v-model:show="showCalendar" @confirm="onConfirmDate" />

            <van-field label="计费方式" readonly>
              <template #input>
                <van-radio-group v-model="form.calcType" direction="horizontal">
                  <van-radio name="count">按次</van-radio>
                  <van-radio name="day">按天</van-radio>
                  <van-radio name="consumable">消耗品</van-radio>
                </van-radio-group>
              </template>
            </van-field>

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
import { ensureUploadInfo, filePath2Name, parseNativeImageFileUploadInfo } from '@/lib/file';
import { getUploadUrl, uploadFile } from '@/service';
import { isTauri } from '@/constants';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

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
  calcType: 'count',
  description: '',
  imageKey: '', // Existing image key
});

// Upload State
const fileList = ref<any[]>([]);
const pendingFile = ref<FileInfoItem | null>(null);
const previewUrl = ref('');

// Pickers State
const showCategoryPicker = ref(false);
const showSubCategoryPicker = ref(false);
const showStatusPicker = ref(false);
const showCalendar = ref(false);
const minDate = new Date(2020, 0, 1);
const maxDate = new Date();

// Columns
const categoryColumns = computed(() => props.categories.map(c => ({ text: c.name, value: c.id })));
const currentSubCategories = computed(() => {
  if (!form.categoryId) return [];
  const cat = props.categories.find(c => c.id === form.categoryId);
  return cat ? cat.subCategories : [];
});
const subCategoryColumns = computed(() => currentSubCategories.value.map(s => ({ text: s.name, value: s.id })));
const statusColumns = computed(() => props.statuses.map(s => ({ text: s.name, value: s.value })));

// Watchers
watch(() => props.visible, (val) => {
  if (val) {
    resetForm();
    if (props.initialData) {
      loadInitialData(props.initialData);
    }
  }
});

const loadInitialData = (data: Asset) => {
  form.name = data.name;
  form.categoryId = data.categoryId;
  form.subCategoryId = data.subCategoryId || '';
  form.statusValue = data.status;
  form.price = String(data.price);
  form.purchaseDate = data.purchaseDate;
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
  form.dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

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
  form.calcType = 'count';
  form.description = '';
  form.imageKey = '';

  fileList.value = [];
  pendingFile.value = null;
  previewUrl.value = '';
};

const onClose = () => {
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

const onConfirmStatus = ({ selectedOptions }: any) => {
  form.statusName = selectedOptions[0].text;
  form.statusValue = selectedOptions[0].value;
  showStatusPicker.value = false;
};

const onConfirmDate = (date: Date) => {
  form.dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  form.purchaseDate = date.getTime();
  showCalendar.value = false;
};

// File Handling
const clearImage = () => {
    pendingFile.value = null;
    form.imageKey = '';
    previewUrl.value = '';
    fileList.value = [];
};

const handlePreview = () => {
    if (previewUrl.value) {
        showImagePreview([previewUrl.value]);
    }
};

// Web Upload Selection
const afterRead = async (file: any) => {
    const rawFile = file.file;
    // Prepare info but don't upload yet
    const fileInfoItem = {
      file: rawFile,
      name: rawFile.name,
      lastModified: rawFile.lastModified,
      date: new Date(rawFile.lastModified),
      objectUrl: file.objectUrl || URL.createObjectURL(rawFile)
    } as FileInfoItem;

    // We can do ensureUploadInfo here to get dimensions/md5 early if we want,
    // but for deferred upload we can wait or do it now.
    // Doing it now is better for UX (fail early if invalid).
    await ensureUploadInfo(fileInfoItem);

    pendingFile.value = fileInfoItem;
    previewUrl.value = fileInfoItem.objectUrl;
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

const generateAssetKey = (fileInfo: FileInfoItem) => {
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const second = fileInfo.date.getSeconds().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()
  const { operator = 'unknow', username = 'unknow' } = JSON.parse(localStorage.getItem('userInfo') || '{}')

  const keySuffix = `${username}/${operator}/${year}-${month}-${day}/${hour}-${minute}-${second}-${uploadTime}-${fileInfo.name}`
  return `assets/${keySuffix}`
};

const handleSave = async () => {
  if (!form.name || !form.categoryId || !form.price || !form.purchaseDate) {
    showToast('请填写必填项');
    return;
  }

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

    closeToast();
    showToast('保存成功');
    emit('save');
    onClose();

  } catch (e) {
      closeToast();
      showToast('保存失败');
      console.error(e);
  }
};
</script>

<style scoped lang="scss">
.popup-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;

  .form-scroll {
    flex: 1;
    overflow-y: auto;
    padding-top: 10px;
  }
}

.upload-wrapper {
    display: flex;
    align-items: center;

    .upload-btn {
        width: 80px;
        height: 80px;
        border-radius: 4px;
        background: #f7f8fa;
        border: 1px dashed #dcdee0;
    }

    .preview-box {
        position: relative;
        display: inline-block;

        .delete-icon {
            position: absolute;
            top: -6px;
            right: -6px;
            width: 18px;
            height: 18px;
            background: rgba(0,0,0,0.5);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
        }
    }
}
</style>
