<template>
  <div class="edit-folder-form">
    <van-form @submit="() => emit('submit')">
      <div class="form-section">
        <div class="section-label">基本信息</div>
        <van-field required v-model="formData.name" name="名称" label="名称" placeholder="请输入文件夹名称"
          :rules="[{ required: true, message: '请填写文件夹名称' }]" />
        <van-field v-model="formData.description" autosize show-word-limit rows="3" maxlength="100" type="textarea"
          name="描述" label="描述" placeholder="请输入描述信息（可选）" />
      </div>

      <div v-if="showDelete" class="delete-section">
        <van-button class="delete-btn" size="large" round block plain type="danger" @click="() => emit('delete')">
          删除文件夹
        </van-button>
        <p class="delete-hint">删除后该文件夹内的相册将变为未分类</p>
      </div>

      <div class="submit-btn-container">
        <van-button size="large" round block type="primary" native-type="submit">
          保存
        </van-button>
        <van-button class="cancel-btn" size="large" round block plain type="default" @click="() => emit('cancel')">
          取消
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script lang="ts" setup>
import { reactive } from 'vue';

const props = defineProps<{
  showDelete?: boolean
}>()

const formData = defineModel<{
  name: string
  description: string
}>("data", {
  type: Object,
  default: () => ({ name: '', description: '' })
})

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'cancel'): void
  (e: 'delete'): void
}>()
</script>

<style scoped>
.edit-folder-form {
  padding-bottom: 20px;
}
.form-section {
  margin-bottom: 24px;
}
.section-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  margin-bottom: 12px;
  padding: 0 4px;
}
.delete-section {
  margin: 32px 0 16px;
}
.delete-btn {
  border: 1px solid #ee0a24;
  color: #ee0a24;
}
.delete-hint {
  font-size: 12px;
  color: #969799;
  text-align: center;
  margin: 8px 0 0;
}
.submit-btn-container {
  margin: 32px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cancel-btn {
  border: none;
  background: transparent;
  color: #999;
}
</style>
