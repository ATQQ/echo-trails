<template>
  <van-form class="card-margin" @submit="() => emit('submit')">
    <van-cell-group inset>
      <van-field required v-model="addData.name" name="相册名" label="相册名" placeholder="请输入相册名"
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
    </van-cell-group>
    <div style="margin: 16px;">
      <van-button size="small" round block :type="btnType" native-type="submit">
        提交
      </van-button>
    </div>
  </van-form>
</template>

<script lang="ts" setup>
const { btnType = 'success' } = defineProps<{
  btnType?: 'success' | 'primary'
}>()

const addData = defineModel<{
  name: string
  description: string
  isLarge: boolean
}>("data", {
  type: Object, default: {
    name: "",
    description: "",
    isLarge: false,
  }
})

const emit = defineEmits<{
  (e: 'submit'): void
}>()
</script>

<style lang="scss" scoped></style>
