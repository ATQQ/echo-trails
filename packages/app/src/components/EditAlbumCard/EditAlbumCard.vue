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
      <van-field name="标签" label="标签">
        <template #input>
          <div class="tags-editor">
            <van-tag
              v-for="(tag, index) in addData.tags"
              :key="index"
              closeable
              size="medium"
              type="primary"
              class="tag-item"
              @close="removeTag(index)"
            >
              {{ tag }}
            </van-tag>
            <input
              v-model="newTag"
              class="tag-input"
              placeholder="输入标签(空格/回车确认)"
              @keydown.enter.prevent="addTag"
              @keydown.space.prevent="addTag"
              @blur="addTag"
            />
          </div>
        </template>
      </van-field>
      <div v-if="suggestedTags.length" class="suggested-tags-wrapper">
        <span class="suggest-label">推荐标签：</span>
        <van-tag
          v-for="tag in suggestedTags"
          :key="tag"
          plain
          type="primary"
          class="suggest-tag"
          @click="addSuggestedTag(tag)"
        >
          {{ tag }}
        </van-tag>
      </div>
    </van-cell-group>
    <div style="margin: 16px;">
      <van-button size="small" round block :type="btnType" native-type="submit">
        提交
      </van-button>
    </div>
  </van-form>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { getAlbums } from '@/service';

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

const emit = defineEmits<{
  (e: 'submit'): void
}>()

const newTag = ref('')
const allTags = ref<string[]>([])

onMounted(() => {
  getAlbums().then(res => {
    const tags = new Set<string>()
    const all = [...(res.large || []), ...(res.small || [])]
    all.forEach(album => {
      album.tags?.forEach(tag => tags.add(tag))
    })
    allTags.value = Array.from(tags)
  })
})

const suggestedTags = computed(() => {
  return allTags.value.filter(tag => !(addData.value.tags || []).includes(tag)).slice(0, 10)
})

const addTag = () => {
  const input = newTag.value.trim()
  if (input) {
    if (!addData.value.tags) {
      addData.value.tags = []
    }
    const tags = input.split(/\s+/).filter(Boolean)
    tags.forEach(tag => {
      if (!addData.value.tags!.includes(tag)) {
        addData.value.tags!.push(tag)
      }
    })
  }
  newTag.value = ''
}

const addSuggestedTag = (tag: string) => {
  if (!addData.value.tags) {
    addData.value.tags = []
  }
  if (!addData.value.tags.includes(tag)) {
    addData.value.tags.push(tag)
  }
}

const removeTag = (index: number) => {
  addData.value.tags?.splice(index, 1)
}
</script>

<style scoped>
.tags-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.tag-item {
  margin-right: 4px;
}
.tag-input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  min-width: 120px;
  font-size: 14px;
}
.tag-input::placeholder {
  color: #c8c9cc;
}
.suggested-tags-wrapper {
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #ebedf0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.suggest-label {
  font-size: 12px;
  color: #969799;
}
.suggest-tag {
  cursor: pointer;
}
</style>
