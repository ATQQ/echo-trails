<template>
  <van-form class="card-margin" @submit="() => emit('submit')">
    <van-cell-group inset>
      <van-field required v-model="addData.name" name="名称" label="名称" placeholder="请输入相册名"
        :rules="[{ required: true, message: '请填写相册名' }]">
        <template #left-icon></template>
      </van-field>
      <van-field v-model="addData.description" autosize show-word-limit rows="5" maxlength="100" type="textarea"
        name="描述" label="描述" placeholder="描述" />
      <van-field name="switch" label="大卡片">
        <template #input>
          <van-switch v-model="addData.isLarge" />
        </template>
      </van-field>
      <!-- tags -->
      <van-field v-model="tagsInput" name="标签" label="标签" placeholder="请输入标签，空格分隔" />
    </van-cell-group>
    <div style="margin: 16px;">
      <van-button size="small" round block :type="btnType" native-type="submit">
        提交
      </van-button>
    </div>
  </van-form>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';

const { btnType = 'success' } = defineProps<{
  btnType?: 'success' | 'primary'
}>()

const addData = defineModel<{
  name: string
  description: string
  isLarge: boolean
  tags?: string[]
}>("data", {
  type: Object, default: {
    name: "",
    description: "",
    isLarge: false,
    tags: []
  }
})

const tagsInput = ref('')

watch(() => addData.value.tags, (newTags) => {
  tagsInput.value = newTags?.join(' ') || ''
}, { immediate: true })

watch(tagsInput, (val) => {
  addData.value.tags = val.trim().split(/\s+/).filter(Boolean)
})

const emit = defineEmits<{
  (e: 'submit'): void
}>()
</script>
