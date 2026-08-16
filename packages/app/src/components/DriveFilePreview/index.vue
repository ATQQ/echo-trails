<template>
  <van-overlay
    :show="show"
    class="drive-file-preview"
    :class="{ 'is-mac': isMacDesktop }"
    :z-index="3000"
    :lock-scroll="true"
  >
    <div class="drive-file-preview-shell" @click.stop>
      <header class="drive-file-preview-header">
        <van-icon name="arrow-left" size="22" class="back" @click="close" />
        <span class="title">{{ item?.name || '预览' }}</span>
      </header>
      <div class="drive-file-preview-body">
        <div v-if="loading" class="drive-file-preview-status">
          <van-loading size="24px" vertical>加载中...</van-loading>
        </div>
        <div v-else-if="error" class="drive-file-preview-status">
          <van-empty :description="error" />
        </div>
        <OpenFileViewer
          v-else-if="source"
          class-name="drive-ofv"
          :file="source"
          :file-name="item?.name"
          :mime-type="item?.mimeType"
          width="100%"
          height="100%"
          fit="contain"
          locale="zh-CN"
          theme="light"
          :toolbar="true"
          fallback="download"
          :plugins="drivePreviewPlugins"
          @error="onPreviewError"
        />
      </div>
    </div>
  </van-overlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showToast } from 'vant'
import { OpenFileViewer } from '@open-file-viewer/vue'
import '@open-file-viewer/core/style.css'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { isTauri } from '@/constants'
import { preventBack } from '@/lib/router'
import { getDownloadUrl, type DriveFileItem } from '@/service/driveFile'
import { drivePreviewPlugins } from './plugins'
import './style.css'

const props = defineProps<{
  show: boolean
  item: DriveFileItem | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value),
})

preventBack(visible)

const isMacDesktop = isTauri && /Mac/i.test(navigator.userAgent)

const source = ref<string | File | null>(null)
const loading = ref(false)
const error = ref('')
let loadSeq = 0

const isStreamable = (item: DriveFileItem) => {
  const mime = item.mimeType || ''
  return mime.startsWith('video/') || mime.startsWith('audio/') || mime.startsWith('image/')
}

const resolvePreviewSource = async (item: DriveFileItem) => {
  const url = await getDownloadUrl(item)
  if (isStreamable(item) || !isTauri) return url
  const res = await tauriFetch(url)
  const blob = await res.blob()
  return new File([blob], item.name, { type: item.mimeType || blob.type })
}

const close = () => {
  visible.value = false
}

const onPreviewError = (err: Error) => {
  console.error('[Drive] preview failed:', err)
  showToast(err.message || '预览失败')
}

watch(
  () => [props.show, props.item?.id] as const,
  async ([show]) => {
    if (!show || !props.item) {
      loadSeq += 1
      source.value = null
      error.value = ''
      loading.value = false
      return
    }
    const item = props.item
    loadSeq += 1
    const seq = loadSeq
    loading.value = true
    error.value = ''
    source.value = null
    try {
      const next = await resolvePreviewSource(item)
      if (seq !== loadSeq) return
      source.value = next
    } catch (e) {
      if (seq !== loadSeq) return
      error.value = e instanceof Error ? e.message : '无法预览'
      showToast(error.value)
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  },
  { immediate: true },
)
</script>
