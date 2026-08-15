<template>
  <van-overlay :show="show" @click="close" :class="['audio-preview-overlay', { 'chrome-visible': showMoreOperate }]" z-index="2000">
    <div class="audio-preview-container" @click="handleOverlayTap">
      <van-swipe ref="swipeRef" :initial-swipe="start" @change="onChange" :loop="false" class="audio-swipe"
        :show-indicators="false">
        <van-swipe-item v-for="(item, index) in images" :key="item._id" class="audio-swipe-item">
          <div class="audio-wrapper" @click.stop>
            <div class="audio-visual">
              <van-icon name="music-o" :size="isDesktop ? 128 : 96" color="#20242b" />
              <div class="audio-title" v-if="item.name">{{ item.name }}</div>
            </div>
            <audio
              v-if="shouldRender(index)"
              :ref="(el) => setAudioRef(el, index)"
              controls
              preload="metadata"
              class="audio-player"
            >
              <source :src="item.url" :type="item.type || 'audio/mpeg'">
              您的浏览器不支持音频播放。
            </audio>
          </div>
        </van-swipe-item>
      </van-swipe>

      <!-- 顶部操作栏 -->
      <transition name="slide-down">
        <div v-show="showMoreOperate" class="cover-wrapper safe-padding-top" @click.stop>
          <header class="cover-header">
            <div class="header-left">
                <van-icon name="arrow-left" size="24" class="back-icon" @click.stop="close" />
                <div class="header-text">
                    <h3>
                      {{ coverDate }}
                      <span class="week-day"> - {{ weekDay }}</span>
                    </h3>
                    <h4>
                      {{ coverTime }}
                      <span class="lunar-date"> / {{ lunarDate }}</span>
                    </h4>
                </div>
            </div>

            <div class="header-actions">
              <van-icon @click.stop="handleEditDescription" :name="editMode ? 'chat' : 'chat-o'" class="message-icon"
                size="24" />
              <van-icon @click.stop="showInfoDetail = !showInfoDetail" :name="showInfoDetail ? 'more' : 'more-o'"
                class="more-icon" size="24" />
            </div>

          </header>
          <div v-show="showInfoDetail" class="cover-info">
            <van-cell title="音频信息" :value="filesize" :label="activeItem.name" />
            <van-cell title="格式" :value="fileType" />
          </div>

          <div v-show="!editMode && activeItem.description" class="description-info">
            {{ activeItem.description }}
          </div>
          <div v-show="editMode" class="edit-description">
            <van-field ref="descriptionInput" :border="false" show-word-limit v-model="description" rows="6" autosize
              type="textarea" maxlength="1000" placeholder="音频背后的故事" />
            <van-row class="edit-btns">
              <van-col offset="10" span="3">
                <van-button size="mini" type="primary" @click="editMode = false">取消</van-button>
              </van-col>
              <van-col offset="0" span="6">
                <van-button size="mini" type="success" @click="handleSaveDescription">确定</van-button>
              </van-col>
            </van-row>
          </div>

        </div>
      </transition>

      <!-- 底部操作栏 -->
      <transition name="slide-up">
        <div v-show="showMoreOperate" class="bottom-actions-wrapper" @click.stop>
            <BottomActions :menus="menus" />
        </div>
      </transition>

      <van-action-sheet
        v-model:show="showSpeedSheet"
        title="播放速度"
        :actions="speedActions"
        cancel-text="取消"
        close-on-click-action
        @select="handleSpeedSelect"
      />

      <SelectAlbumModal v-model:show="showAlbumSelect" @save="handleSaveAlbumSelect" :current-album-id="album?._id"
        :selected="selectedAlbums" />
    </div>
  </van-overlay>
</template>

<script lang="ts" setup>
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { usePhotoListStore } from '@/composables/photoList';
import { downloadFile, formatSize, generateDownloadFileName } from '@/lib/file';
import { deletePhoto, updateDescription, updatePhotoAlbum } from '@/service';
import dayjs from 'dayjs';
import { showConfirmDialog, showNotify, showLoadingToast, closeToast } from 'vant';
import { computed, nextTick, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import SelectAlbumModal from '../SelectAlbumModal/SelectAlbumModal.vue';
import BottomActions from '../BottomActions/BottomActions.vue';
import { preventBack } from '@/lib/router';
import { useEventListener, useMediaQuery } from '@vueuse/core';

const props = defineProps<{
  images: any[]
  start?: number
  album?: any
  isDelete?: boolean
}>()

const show = defineModel("show", { type: Boolean, default: false })

const currentIdx = ref(props.start || 0)
const swipeRef = ref()
const showMoreOperate = ref(true)
const showSpeedSheet = ref(false)
const playbackRate = ref(1)
const audioRefs = new Map<number, HTMLAudioElement>()
const isDesktop = useMediaQuery('(min-width: 480px)')
let speedSheetJustClosedAt = 0
preventBack(showSpeedSheet)

watch(showSpeedSheet, (val, oldVal) => {
  if (oldVal && !val) speedSheetJustClosedAt = Date.now()
})

watch(() => props.start, (val) => {
  currentIdx.value = val || 0
  if (swipeRef.value && show.value) {
    swipeRef.value.swipeTo(val, { immediate: true })
  }
})

const shouldRender = (index: number) => {
  return Math.abs(index - currentIdx.value) <= 1
}

const onChange = (index: number) => {
  // 切换时暂停前一个
  activeAudio()?.pause?.()
  currentIdx.value = index
  editMode.value = false
  showInfoDetail.value = false
  nextTick(() => applyPlaybackRate())
}

const setAudioRef = (el: Element | any, index: number) => {
  if (el instanceof HTMLAudioElement) {
    audioRefs.set(index, el)
    el.playbackRate = playbackRate.value
    return
  }
  audioRefs.delete(index)
}

const activeAudio = () => audioRefs.get(currentIdx.value)

const applyPlaybackRate = () => {
  const audio = activeAudio()
  if (audio) {
    audio.playbackRate = playbackRate.value
  }
}

const togglePlayback = () => {
  const audio = activeAudio()
  if (!audio) return
  if (audio.paused) {
    const result = audio.play?.()
    if (result && typeof result.catch === 'function') {
      result.catch(() => {})
    }
  } else {
    audio.pause?.()
  }
}

const handleOverlayTap = (event: Event) => {
  if ((event.target as HTMLElement)?.closest?.('.van-action-sheet, .van-popup:not(.audio-preview-overlay)')) return
  if (!isDesktop.value) return
  if (isDesktopBusy()) return
  event.stopPropagation()
  close()
}

const openSpeedSheet = () => {
  showSpeedSheet.value = true
  showMoreOperate.value = true
}

const speedActions = computed(() => {
  return [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map(rate => ({
    name: rate === 1 ? '正常速度' : `${rate}x`,
    value: rate,
    color: playbackRate.value === rate ? '#1989fa' : undefined
  }))
})

const handleSpeedSelect = (action: { value: number }) => {
  playbackRate.value = action.value
  applyPlaybackRate()
  speedSheetJustClosedAt = Date.now()
}

const activeItem = computed(() => props.images[currentIdx.value] || {})

import { getLunarDate } from '@/lib/lunar';

const coverDate = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('YYYY年MM月DD日') : '')
const coverTime = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('HH:mm') : '')
const weekDay = computed(() => {
  if (!activeItem.value.lastModified) return ''
  const weekDayMap = ['日', '一', '二', '三', '四', '五', '六']
  const date = new Date(activeItem.value.lastModified);
  return `星期${weekDayMap[date.getDay()]}`
})
const lunarDate = computed(() => {
  if (!activeItem.value.lastModified) return ''
  const date = new Date(activeItem.value.lastModified);
  return getLunarDate(date);
})
const filesize = computed(() => formatSize(activeItem.value.size))
const fileType = computed(() => {
  const { type, fileType } = activeItem.value
  if(!fileType) return type
  return `${type} (${fileType})`
})

const showInfoDetail = ref(false)
const editMode = ref(false)
const description = ref('')
const descriptionInput = ref<HTMLInputElement>()

const handleEditDescription = () => {
  if (editMode.value) {
    editMode.value = false
    return
  }
  editMode.value = true
  description.value = activeItem.value.description || ''
  setTimeout(() => {
    descriptionInput.value?.focus()
  }, 100)
}

const handleSaveDescription = () => {
  updateDescription(activeItem.value._id, description.value).then(() => {
    editMode.value = false
    activeItem.value.description = description.value
    showNotify({ type: 'success', message: '更新成功' });
  })
}

const showAlbumSelect = ref(false)
const selectedAlbums = ref<string[]>([])

const photoListStore = usePhotoListStore()
const albumPhotoStore = useAlbumPhotoStore()

const removePhotoFromList = (id: string) => {
  photoListStore?.deletePhoto?.(id)
  albumPhotoStore?.refreshAlbum?.()
  if (photoListStore?.isEmpty?.value) {
    show.value = false
  }
}

const handleSaveAlbumSelect = async (albumIds: string[]) => {
  await updatePhotoAlbum(activeItem.value._id, albumIds)
  activeItem.value.albumId = albumIds
  showAlbumSelect.value = false
  if (props.album?._id && !albumIds.includes(props.album?._id)) {
    removePhotoFromList(activeItem.value._id)
  }

  showNotify({ type: 'success', message: '更改成功' });
}

const handleDeleteImage = async () => {
  const confirmed = await showConfirmDialog({
    title: '删除确认',
    message: '确定要删除这个音频吗？',
  })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) {
    return;
  }

  deletePhoto(activeItem.value._id).then(() => {
    showNotify({ type: 'success', message: '删除成功' });
    removePhotoFromList(activeItem.value._id)
  })
}

const restorePhotos = () => {
  photoListStore?.restorePhotos?.([activeItem.value._id])
}

const downloadImage = () => {
  const toast = showLoadingToast({
    message: '下载中...',
    forbidClick: true,
    duration: 0,
  });

  downloadFile(activeItem.value.url, generateDownloadFileName(activeItem.value.name, activeItem.value.type), false)
    .finally(() => {
      closeToast();
    })
}

const close = () => {
  showSpeedSheet.value = false
  activeAudio()?.pause?.()
  show.value = false
}

const isDesktopBusy = () => editMode.value || showSpeedSheet.value || showAlbumSelect.value || (Date.now() - speedSheetJustClosedAt < 400)

const WHEEL_THROTTLE_MS = 260
let lastWheelAt = 0

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!show.value) return
  if (isDesktopBusy()) return
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    swipeRef.value?.prev?.()
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    swipeRef.value?.next?.()
    return
  }
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    togglePlayback()
  }
})

useEventListener(document, 'wheel', (e: WheelEvent) => {
  if (!show.value) return
  if (isDesktopBusy()) return
  if (!e.deltaY) return
  const now = Date.now()
  if (now - lastWheelAt < WHEEL_THROTTLE_MS) return
  lastWheelAt = now
  if (e.deltaY > 0) {
    swipeRef.value?.next?.()
  } else {
    swipeRef.value?.prev?.()
  }
})

onBeforeRouteLeave((to, from, next) => {
  if (showSpeedSheet.value) {
    showSpeedSheet.value = false
    next(false)
    return false
  }
  if (showAlbumSelect.value) {
    showAlbumSelect.value = false
    next(false)
    return false
  }
  if (show.value) {
    show.value = false
    next(false)
    return false
  }
  next()
})

const menus = computed(() => {
  const speedMenu = {
    icon: 'clock-o',
    text: playbackRate.value === 1 ? '倍速' : `${playbackRate.value}x`,
    handleClick: openSpeedSheet,
    color: playbackRate.value === 1 ? undefined : '#1989fa'
  }

  if (props.isDelete) {
    return [
      speedMenu,
      {
        icon: 'replay',
        text: '恢复',
        handleClick: restorePhotos
      },
      {
        icon: 'down',
        text: '下载',
        handleClick: downloadImage
      }
    ]
  }
  return [
    speedMenu,
    {
      icon: 'delete-o',
      text: '删除',
      handleClick: handleDeleteImage
    },
    {
      icon: 'down',
      text: '下载',
      handleClick: downloadImage
    }
  ]
})

</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-enter-to,
.slide-up-leave-from {
  transform: translateY(0);
  opacity: 1;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  transform: translateY(0);
  opacity: 1;
}

.audio-preview-overlay {
  background: #fff;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  --audio-chrome-bg: #fff;
  --audio-chrome-text: #20242b;
  --audio-chrome-subtext: #7d8795;
}

.audio-preview-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.audio-swipe {
  width: 100%;
  height: 100%;
}

.audio-swipe-item {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.audio-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 32px;
  padding: 40px 20px;
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
}

.audio-visual {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #20242b;
  gap: 20px;
  max-width: 90%;

  .audio-title {
    font-size: 15px;
    line-height: 1.6;
    text-align: center;
    color: #20242b;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.audio-player {
  width: min(90%, 640px);
  outline: none;
}

.cover-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    pointer-events: none;
    background: var(--audio-chrome-bg);
    box-sizing: border-box;
}

.cover-wrapper > * {
    pointer-events: auto;
}

.cover-header {
  padding: 10px;
  transition: all 0.5s ease;
  background: transparent;
  color: var(--audio-chrome-text);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  backdrop-filter: blur(12px);

  .header-left {
      display: flex;
      align-items: center;
      min-width: 0;
      .back-icon {
          padding: 10px 10px 10px 0;
          margin-right: 5px;
          color: var(--audio-chrome-text);
      }
      .header-text {
          min-width: 0;
          h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 500;
            color: var(--audio-chrome-text);

            .week-day, .lunar-date {
                font-size: 12px;
                opacity: 0.8;
                color: var(--audio-chrome-subtext);
            }
          }

          h4 {
            margin: 4px 0 0 0;
            font-size: 12px;
            font-weight: normal;
            opacity: 0.8;
            color: var(--audio-chrome-subtext);

            .lunar-date {
              color: var(--audio-chrome-subtext);
            }
          }
      }
  }

  .header-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: 5px;

    .van-icon {
      margin-left: 20px;
      color: var(--audio-chrome-text);
    }
  }
}

.cover-info {
    background: #fff;
    overflow: hidden;
    :deep(.van-cell) {
        color: #333;
        .van-cell__title, .van-cell__value, .van-cell__label {
            color: #333;
        }
    }
}

.description-info {
  transition: all 0.5s ease;
  padding: 10px 16px;
  overflow: hidden;
  color: #333;
  font-size: 14px;
  line-height: 1.5;
  background: #fff;
  margin-top: auto;
}

.edit-description {
  padding: 10px;
  background-color: #fff;
}

.edit-btns {
  margin-top: 10px;
}

.bottom-actions-wrapper {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;

    :deep(.footer-nav) {
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
    }
}
</style>
