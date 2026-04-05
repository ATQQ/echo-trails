<template>
  <van-popup :show="visible" @update:show="emit('update:visible', $event)" round position="bottom"
    class="safe-padding-top" :style="{ height: '100%' }" @closed="handleClosed">
    <div class="popup-content">
      <h2 class="popup-title">{{ editId ? '编辑相册' : '添加相册' }}</h2>
      <EditAlbumCard @submit="onSubmit" @cancel="handleCancel" :data="formData" btn-type="primary" />
    </div>
  </van-popup>
</template>

<script lang="ts" setup>
import { reactive, watch, toRef } from 'vue';
import { createAlbum, updateAlbum } from '@/service';
import { showToast } from 'vant';
import EditAlbumCard from './EditAlbumCard.vue';
import { preventBack } from '@/lib/router';

interface Album {
  _id: string;
  name: string;
  description: string;
  style: string;
  tags?: string[];
  [key: string]: any;
}

const props = defineProps<{
  visible: boolean;
  editId?: string;
  initialData?: Partial<Album>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'success'): void;
}>();

const formData = reactive({
  name: '',
  description: '',
  isLarge: false,
  tags: [] as string[]
});

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      if (props.editId && props.initialData) {
        formData.name = props.initialData.name || '';
        formData.description = props.initialData.description || '';
        formData.isLarge = props.initialData.style === 'large';
        formData.tags = [...(props.initialData.tags || [])];
      } else {
        // Reset for new
        formData.name = '';
        formData.description = '';
        formData.isLarge = false;
        formData.tags = [];
      }
    }
  }
);

const handleClosed = () => {
  formData.name = '';
  formData.description = '';
  formData.isLarge = false;
  formData.tags = [];
};

const onSubmit = () => {
  if (props.editId) {
    updateAlbum(props.editId, formData).then(async () => {
      showToast('修改成功');
      emit('update:visible', false);
      emit('success');
    });
  } else {
    createAlbum(formData.name, formData.description, formData.isLarge, formData.tags).then(async () => {
      showToast('创建成功');
      emit('update:visible', false);
      emit('success');
    });
  }
}
const handleCancel = () => {
  emit('update:visible', false);
};

const visibleRef = toRef(props, 'visible');
preventBack(visibleRef);

</script>

<style scoped>
.popup-content {
  padding: 16px;
  padding-bottom: env(safe-area-inset-bottom);
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #333;
}
</style>
