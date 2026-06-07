<template>
  <van-popup :show="visible" @update:show="emit('update:visible', $event)" round position="bottom"
    class="safe-padding-top" :style="{ height: '100%' }">
    <div class="popup-content">
      <h2 class="popup-title">{{ editId ? '编辑文件夹' : '新建文件夹' }}</h2>
      <FolderEditCard
        @submit="onSubmit"
        @cancel="handleCancel"
        @delete="handleDelete"
        :data="formData"
        :show-delete="!!editId"
      />
    </div>
  </van-popup>
</template>

<script lang="ts" setup>
import { reactive, watch, toRef } from 'vue';
import { createAlbumFolder, updateAlbumFolder, deleteAlbumFolder } from '@/service';
import { showToast, showConfirmDialog } from 'vant';
import FolderEditCard from './FolderEditCard.vue';
import { preventBack } from '@/lib/router';

const props = defineProps<{
  visible: boolean
  editId?: string
  initialData?: { name?: string, description?: string, _id?: string }
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>();

const formData = reactive({
  name: '',
  description: '',
});

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      if (props.editId && props.initialData) {
        formData.name = props.initialData.name || '';
        formData.description = props.initialData.description || '';
      } else {
        formData.name = '';
        formData.description = '';
      }
    }
  }
);

const onSubmit = async () => {
  if (!formData.name.trim()) {
    showToast('请填写文件夹名称');
    return;
  }
  try {
    if (props.editId) {
      await updateAlbumFolder(props.editId, {
        name: formData.name.trim(),
        description: formData.description,
      });
      showToast('修改成功');
    } else {
      await createAlbumFolder(formData.name.trim(), formData.description);
      showToast('创建成功');
    }
    emit('update:visible', false);
    emit('success');
  } catch (e: any) {
    showToast(e?.message || '操作失败');
  }
}

const handleCancel = () => {
  emit('update:visible', false);
}

const handleDelete = () => {
  if (!props.editId) return;
  showConfirmDialog({
    title: '删除文件夹',
    message: '删除后该文件夹内的相册将变为未分类，确定删除吗？',
  }).then(async () => {
    try {
      await deleteAlbumFolder(props.editId!);
      showToast('已删除');
      emit('update:visible', false);
      emit('success');
    } catch (e: any) {
      showToast(e?.message || '删除失败');
    }
  }).catch(() => {});
}

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
