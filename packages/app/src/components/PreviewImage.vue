<template>
  <div class="preview-image" ref="previewWrapper" :class="{
    'show-detail': showMoreOperate
  }">
    <van-image-preview @change="handleChange" v-model:show="show" :images="urls" :start-position="start"
      swipeDuration="100" :showIndex="false" :onClose="handleOnClose" :closeOnClickImage="false" transition="zoom">
      <template #cover>
        <!-- 顶部操作栏 -->
        <transition name="van-slide-down">
          <div v-show="showMoreOperate" class="cover-wrapper">
            <header class="cover-header" @click="show = false">
              <h3>{{ coverDate }}</h3>
              <h4>{{ coverTime }}</h4>
              <van-icon @click.stop="showInfoDetail = !showInfoDetail" :name="showInfoDetail ? 'more' : 'more-o'"
                class="more-icon" size="24" />
              <van-icon @click.stop="showDescription = !showDescription" :name="showDescription ? 'chat' : 'chat-o'"
                class="message-icon" size="24" />
            </header>
            <transition name="van-slide-right">
              <div v-show="showInfoDetail" class="cover-info">
                <van-cell title="图片信息" :value="filesize" :label="activeImage.name" />
                <van-cell title="尺寸" :value="fileWH" />
                <van-cell title="格式" :value="fileType" />
              </div>
            </transition>
            <transition name="van-fade">
              <div v-show="showDescription && !editMode && activeImage.description" class="description-info">
                {{ activeImage.description }}
              </div>
            </transition>
            <transition name="van-fade">
              <van-field show-word-limit v-show="editMode" v-model="description" rows="6" autosize label=""
                type="textarea" maxlength="1000" placeholder="照片背后的故事" />
            </transition>
          </div>
        </transition>
        <!-- 底部操作栏 -->
        <transition name="van-fade">
          <div v-show="showMoreOperate">
            <div v-show="!editMode" class="edit-btn icon-btn" @click="handleEditDescription">
              <van-icon name="edit" size="18" />
            </div>
            <div v-show="editMode" class="cancel-btn icon-btn" @click="editMode = false">
              <van-icon name="cross" size="18" />
            </div>
            <div v-show="editMode" class="save-btn icon-btn" @click="handleSaveDescription">
              <van-icon name="success" size="18" />
            </div>
          </div>
        </transition>
      </template>
    </van-image-preview>
  </div>
</template>

<script lang="ts" setup>
import { formatSize } from '@/lib/file';
import { updateDescription } from '@/service';
import { useEventListener } from '@vueuse/core';
import dayjs from 'dayjs';
import { showToast } from 'vant';
import { computed, ref } from 'vue';

const { images = [], start = 0 } = defineProps<{
  images: Photo[]
  start?: number
}>()

const show = defineModel("show", { type: Boolean, default: false })


const urls = computed(() => images.map(i => i.preview))

const currentIdx = ref(start)

const previewWrapper = ref<HTMLDivElement>()
const showMoreOperate = ref(true)
const touchStart = ref(0)
// 查看预览图片细节
const checkImageDetail = (e: TouchEvent) => {
  // 只处理短时间点击
  if (e.timeStamp - touchStart.value > 100) {
    return
  }
  // https://vant.pro/vant/#/zh-CN/advanced-usage%23zhuo-mian-duan-gua-pei
  const target = e.target as HTMLImageElement
  if (target.classList.contains('van-image__img')) {
    showMoreOperate.value = !showMoreOperate.value
  }
}
useEventListener(previewWrapper, 'touchstart', (e: TouchEvent) => {
  touchStart.value = e.timeStamp
})
useEventListener(previewWrapper, 'touchend', checkImageDetail)

const handleChange = (index: number) => {
  currentIdx.value = index
  editMode.value = false
}

const activeImage = computed(() => images[currentIdx.value])
const coverDate = computed(() => dayjs(activeImage.value.lastModified).format('YYYY年MM月DD日'))
const coverTime = computed(() => dayjs(activeImage.value.lastModified).format('HH:mm'))
const filesize = computed(() => {
  const size = formatSize(activeImage.value.size)
  return size
})
const fileWH = computed(() => {
  const { width, height } = activeImage.value
  return `${width} x ${height}px`
})

const fileType = computed(() => {
  const { type, fileType } = activeImage.value
  return `${type} (${fileType})`
})

const showInfoDetail = ref(false)

const showDescription = ref(true)

const editMode = ref(false)
const handleOnClose = () => {
  // TODO：重置
  editMode.value = false
}

const description = ref('')
const handleEditDescription = () => {
  editMode.value = true
  description.value = activeImage.value.description || ''
}
const handleSaveDescription = () => {
  updateDescription(activeImage.value._id, description.value).then(() => {
    editMode.value = false
    showDescription.value = true
    activeImage.value.description = description.value
    showToast('更新成功!')
  })
}
</script>

<style lang="scss">
.zoom-enter-active,
.zoom-leave-active {
  transition: transform 0.5s ease;
}

.zoom-enter,
.zoom-leave-to {
  transform: scale(0);
}

.zoom-enter-to,
.zoom-leave {
  transform: scale(1);
}
</style>

<style lang="scss" scoped>
.preview-image :deep(.van-image-preview__overlay) {
  transition: all 0.3s ease;
}

.preview-image :deep(.van-image-preview__cover) {
  right: 0;
}

.show-detail {
  --van-image-preview-overlay-background: #fff;
}

.cover-header {
  padding: 10px;
  transition: all 0.3s ease;
  background-color: var(--van-image-preview-overlay-background);
  position: relative;

  h3 {
    margin-bottom: 0;
    margin-top: 10px;
    font-weight: normal
  }

  h4 {
    margin: 6px 0 0 0;
    font-weight: lighter;
  }

  .more-icon {
    position: absolute;
    right: 20px;
    top: 36%;
  }

  .message-icon {
    position: absolute;
    right: 60px;
    top: 36%;
  }
}

.icon-btn {
  position: fixed;
  right: 20px;
  padding: 8px;
  border-radius: 50%;
  color: #fff;
}

.edit-btn {
  bottom: 60px;
  background-color: var(--van-primary-color);
}

.save-btn {
  bottom: 100px;
  background-color: var(--van-success-color);
}

.cancel-btn {
  bottom: 60px;
  background-color: var(--van-danger-color);
}

.description-info {
  padding: var(--van-cell-vertical-padding) var(--van-cell-horizontal-padding);
  overflow: hidden;
  color: var(--van-cell-text-color);
  font-size: var(--van-cell-font-size);
  line-height: var(--van-cell-line-height);
  background: var(--van-cell-background);
}
</style>
