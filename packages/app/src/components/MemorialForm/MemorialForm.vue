<template>
  <div class="memorial-form">
    <van-nav-bar :title="isEdit ? '编辑纪念日' : '添加纪念日'" left-text="取消" right-text="保存" @click-left="$emit('close')"
      @click-right="save" />

    <div class="form-content">
      <van-cell-group inset>
        <van-field name="uploader" label="封面图片">
          <template #input>
            <div class="cover-section">
              <div class="upload-wrapper">
                <template v-if="previewUrl">
                  <div class="preview-box">
                    <van-image width="80" height="80" fit="cover" :src="previewUrl" radius="4" @click="handlePreview" />
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

              <!-- Preset Covers -->
              <div class="preset-covers" v-if="presetCovers.length">
                <div class="preset-title">推荐封面</div>
                <div class="preset-list">
                  <div v-for="url in presetCovers" :key="url" class="preset-item"
                    :class="{ active: previewUrl === url }" @click="selectPreset(url)">
                    <van-image :src="url" width="50" height="50" fit="cover" radius="4" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </van-field>

        <van-field v-model="form.name" label="名称" placeholder="例如：生日、结婚纪念日" required />

        <van-field v-model="form.displayTitle" label="展示标题" placeholder="例如：我们在一起已经" label-width="5em" />

        <van-cell title="起始日期" :value="formatDate(form.date)" is-link @click="showDatePicker = true" required />

        <van-cell title="结束日期" :value="form.endDate ? formatDate(form.endDate) : '未设置'" is-link
          @click="showEndDatePicker = true" />

        <van-field v-model="form.description" label="描述" type="textarea" placeholder="写点什么..." rows="2" autosize />

        <van-cell center title="计数类型">
          <template #right-icon>
            <van-radio-group v-model="form.type" direction="horizontal">
              <van-radio name="cumulative">累计天数</van-radio>
              <van-radio name="countdown">每年倒数</van-radio>
            </van-radio-group>
          </template>
        </van-cell>

        <!-- <van-cell center title="使用农历">
          <template #right-icon>
            <van-switch v-model="form.isLunar" size="20" />
          </template>
        </van-cell> -->

        <van-cell center title="置顶显示">
          <template #right-icon>
            <van-switch v-model="form.isPinned" size="20" />
          </template>
        </van-cell>
      </van-cell-group>

      <div class="delete-btn-container" v-if="isEdit">
        <van-button type="danger" block plain @click="handleDelete">删除纪念日</van-button>
      </div>
    </div>

    <!-- Date Picker -->
    <van-popup v-model:show="showDatePicker" position="bottom">
      <van-date-picker v-model="datePickerValue" title="选择日期" :min-date="minDate" :max-date="maxDate"
        @confirm="onDateConfirm" @cancel="showDatePicker = false" />
    </van-popup>

    <van-popup v-model:show="showEndDatePicker" position="bottom">
      <van-date-picker v-model="endDatePickerValue" title="选择结束日期" :min-date="minDate" :max-date="maxDate"
        @confirm="onEndDateConfirm" @cancel="showEndDatePicker = false" />
      <div style="padding: 10px">
        <van-button block type="default" @click="clearEndDate">清除结束日期</van-button>
      </div>
    </van-popup>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useMemorialStore, type MemorialDay } from '@/stores/memorial';
import { showToast, showConfirmDialog, showLoadingToast, closeToast, showImagePreview } from 'vant';
import dayjs from 'dayjs';
import { ensureUploadInfo, filePath2Name, parseNativeImageFileUploadInfo } from '@/lib/file';
import { getUploadUrl, uploadFile } from '@/service';
import { isTauri } from '@/constants';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  initialData?: MemorialDay
}>();

const emit = defineEmits(['close', 'save', 'delete']);

const store = useMemorialStore();
const { presetCovers } = storeToRefs(store);

const isEdit = computed(() => !!props.initialData);

const form = reactive<Omit<MemorialDay, 'id' | 'createdAt'>>({
  name: '',
  date: dayjs().format('YYYY-MM-DD'),
  endDate: undefined,
  description: '',
  displayTitle: '',
  type: 'cumulative',
  isLunar: false,
  isPinned: false,
  coverImage: ''
});

const showDatePicker = ref(false);
const showEndDatePicker = ref(false);
const datePickerValue = ref<string[]>([]);
const endDatePickerValue = ref<string[]>([]);

// Upload State
const fileList = ref<any[]>([]);
const pendingFile = ref<FileInfoItem | null>(null);
const previewUrl = ref('');

const minDate = new Date(1900, 0, 1);
const maxDate = new Date(2100, 11, 31);

onMounted(() => {
  if (props.initialData) {
    Object.assign(form, props.initialData);
    if (form.coverImage) {
      previewUrl.value = form.coverImage;
    }
  }
  datePickerValue.value = form.date.split('-');
  if (form.endDate) {
    endDatePickerValue.value = form.endDate.split('-');
  } else {
    endDatePickerValue.value = dayjs().format('YYYY-MM-DD').split('-');
  }
});

const formatDate = (dateStr: string) => {
  return dateStr;
};

const onDateConfirm = ({ selectedValues }: { selectedValues: string[] }) => {
  form.date = selectedValues.join('-');
  showDatePicker.value = false;
};

const onEndDateConfirm = ({ selectedValues }: { selectedValues: string[] }) => {
  form.endDate = selectedValues.join('-');
  showEndDatePicker.value = false;
};

const clearEndDate = () => {
  form.endDate = undefined;
  showEndDatePicker.value = false;
};

// File Handling
const clearImage = () => {
  pendingFile.value = null;
  form.coverImage = '';
  previewUrl.value = '';
  fileList.value = [];
};

const handlePreview = () => {
  if (previewUrl.value) {
    showImagePreview([previewUrl.value]);
  }
};

const selectPreset = (url: string) => {
  pendingFile.value = null; // Clear pending upload if any
  fileList.value = [];
  previewUrl.value = url;
  form.coverImage = url; // Directly use preset URL
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
  return `memorial/${keySuffix}`
};


const save = async () => {
  if (!form.name) {
    showToast('请输入名称');
    return;
  }

  try {
    if (pendingFile.value) {
      showLoadingToast({ message: '上传封面中...', forbidClick: true });

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

      const cdn = import.meta.env.VITE_BITIFUL_CDN || '';
      form.coverImage = `${cdn}/${key}`;
    }
    // If pendingFile is null, form.coverImage might be a preset URL or empty

    emit('save', { ...form });
  } catch (e) {
    console.error(e);
    showToast('保存失败');
  } finally {
    closeToast();
  }
};

const handleDelete = () => {
  showConfirmDialog({
    title: '确认删除',
    message: '确认删除该纪念日吗？'
  }).then(() => {
    emit('delete', props.initialData?.id);
  }).catch(() => { });
};

</script>

<style scoped lang="scss">
.memorial-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
}

.form-content {
  flex: 1;
  overflow-y: auto;
  padding-top: 16px;
}

.delete-btn-container {
  padding: 30px 16px;
}

.cover-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
      background: rgba(0, 0, 0, 0.5);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
  }
}

.preset-covers {
  .preset-title {
    font-size: 12px;
    color: #999;
    margin-bottom: 8px;
  }

  .preset-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 8px;

    .preset-item {
      border: 2px solid transparent;
      border-radius: 6px;
      line-height: 0; /* Fix extra height issue with images */

      &.active {
        border-color: #1989fa;
      }
    }
  }
}
</style>
