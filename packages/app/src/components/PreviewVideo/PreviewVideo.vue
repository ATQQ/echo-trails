<template>
  <van-overlay :show="show" @click="handleOverlayClose" :class="['video-preview-overlay', { 'chrome-visible': showMoreOperate }]" z-index="2000">
    <div class="video-preview-container" @click.self="handleOverlayTap">
      <van-swipe ref="swipeRef" :initial-swipe="start" @change="onChange" :loop="false" class="video-swipe"
        :show-indicators="false" :touchable="!isDesktop">
        <van-swipe-item v-for="(item, index) in images" :key="item._id" class="video-swipe-item" @click.self="handleOverlayTap">
          <div class="video-wrapper" @click.self="handleOverlayTap">
            <video v-if="shouldRender(index)" :ref="(el) => setVideoRef(el, index)" :src="getVideoSrc(item)"
              :controls="isDesktop || showMoreOperate === false"
              playsinline webkit-playsinline preload="metadata" class="video-player"
              :poster="item.cover"
              @click="handleVideoClick"
              @play="handleVideoPlay"
              @pause="handleVideoPause"
              @error="handleVideoError(index, $event)"
              @loadedmetadata="handleVideoLoaded(index)">
              您的浏览器不支持视频播放。
            </video>
            <!-- 桌面端自定义中央播放按钮：仅暂停时展示，点击调用 play() -->
            <button
              v-if="isDesktop && index === currentIdx && !isPlaying"
              class="video-center-play"
              type="button"
              aria-label="播放视频"
              @click.stop="handleCenterPlay"
            >
              <van-icon name="play" size="36" />
            </button>
          </div>
        </van-swipe-item>
      </van-swipe>
      <!-- 移动端：工具条可见时的整层点击拦截，用于点击视频区域隐藏工具条 -->
      <button
        v-show="showMoreOperate && !isDesktop"
        class="video-tap-layer"
        type="button"
        aria-label="隐藏视频工具栏"
        @click.stop="handleVideoTap"
        @pointerup.stop="handleVideoTap"
      ></button>

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
              <van-icon v-show="showSetCover" class="set-cover-icon" @click.stop="handleSetCover" name="bookmark-o"
                size="24" />
              <van-icon @click.stop="handleEditDescription" :name="editMode ? 'chat' : 'chat-o'" class="message-icon"
                size="24" />
              <van-icon @click.stop="showInfoDetail = !showInfoDetail" :name="showInfoDetail ? 'more' : 'more-o'"
                class="more-icon" size="24" />
            </div>

          </header>
          <div v-show="showInfoDetail" class="cover-info">
            <van-cell title="视频信息" :value="filesize" :label="activeItem.name" />
            <van-cell title="分辨率" :value="fileWH" />
            <van-cell title="格式" :value="fileType" />
          </div>

          <div v-show="!editMode && activeItem.description" class="description-info">
            {{ activeItem.description }}
          </div>
          <div v-show="editMode" class="edit-description">
            <van-field ref="descriptionInput" :border="false" show-word-limit v-model="description" rows="6" autosize
              type="textarea" maxlength="1000" placeholder="视频背后的故事" />
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

      <!-- 选择相册 -->
      <SelectAlbumModal v-model:show="showAlbumSelect" @save="handleSaveAlbumSelect" :current-album-id="album?._id"
        :selected="selectedAlbums" />
    </div>
  </van-overlay>
</template>

<script lang="ts" setup>
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { usePhotoListStore } from '@/composables/photoList';
import { downloadFile, formatSize, generateDownloadFileName } from '@/lib/file';
import { deletePhoto, updateAlbumCover, updateDescription, updateLike, updatePhotoAlbum } from '@/service';
import dayjs from 'dayjs';
import { showConfirmDialog, showNotify, showLoadingToast, closeToast } from 'vant';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import SelectAlbumModal from '../SelectAlbumModal/SelectAlbumModal.vue';
import BottomActions from '../BottomActions/BottomActions.vue';
import { preventBack } from '@/lib/router';
import { useEventListener, useMediaQuery } from '@vueuse/core';
import { cacheVideo } from '@/composables/useCachedVideo';
import { isTauri } from '@/constants';

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
const lastVideoTapAt = ref(0)
const lastOverlayTapAt = ref(0)
const isPlaying = ref(false)
const videoRefs = new Map<number, HTMLVideoElement>()
const isDesktop = useMediaQuery('(min-width: 480px)')
const videoUrlMap = ref(new Map<string, string>())
preventBack(showSpeedSheet)

const getVideoSrc = (item: any) => {
  if (!item) return ''
  return videoUrlMap.value.get(item._id) || item.url
}

const resolveVideoUrl = async (item: any) => {
  if (!isTauri) return
  if (!item || !item._id || !item.url) return
  if (videoUrlMap.value.has(item._id)) return
  try {
    const result = await cacheVideo(item.url, item._id)
    if (result && result !== item.url) {
      videoUrlMap.value.set(item._id, result)
    }
  } catch (e) {
    console.error('[PreviewVideo] resolveVideoUrl failed', e)
  }
}

watch(() => props.images, () => {
  const item = props.images?.[currentIdx.value]
  if (item) resolveVideoUrl(item)
}, { immediate: true })


watch(() => props.start, (val) => {
  currentIdx.value = val || 0
  // 如果 swipeRef 存在，跳转到指定位置
  if (swipeRef.value && show.value) {
    swipeRef.value.swipeTo(val, { immediate: true })
  }
})

watch(show, (val) => {
  if (val) {
    showMoreOperate.value = true
    isPlaying.value = false
  } else {
    isPlaying.value = false
  }
})

// 只渲染当前视频，避免 v-if 频繁切换导致的 ERR_ABORTED 请求中断
const shouldRender = (index: number) => {
  return index === currentIdx.value
}

const onChange = (index: number) => {
  const prev = activeVideo()
  if (prev && !prev.paused) {
    prev.pause?.()
  }
  currentIdx.value = index
  editMode.value = false
  showInfoDetail.value = false
  isPlaying.value = false
  showMoreOperate.value = true
  const nextItem = props.images?.[index]
  if (nextItem) resolveVideoUrl(nextItem)
  nextTick(() => applyPlaybackRate())
}

const hideControls = () => {
  if (!showMoreOperate.value) return
  showMoreOperate.value = false
  showInfoDetail.value = false
  editMode.value = false
}

const showControls = () => {
  if (showMoreOperate.value) return
  showMoreOperate.value = true
}

const handleVideoPlay = () => {
  isPlaying.value = true
  // 播放时隐藏工具条
  hideControls()
}

const handleVideoPause = () => {
  isPlaying.value = false
  // 暂停时显示工具条
  showControls()
}

const handleVideoError = (index: number, event: Event) => {
  const target = event.target as HTMLVideoElement | null
  const err = target?.error
  console.error('[PreviewVideo] video error', {
    index,
    url: props.images?.[index]?.url,
    type: props.images?.[index]?.type,
    code: err?.code,
    message: err?.message,
  })
  showNotify({ type: 'danger', message: `视频加载失败${err?.code ? ` (code ${err.code})` : ''}` })
}

const handleVideoLoaded = (index: number) => {
  if (index !== currentIdx.value) return
  applyPlaybackRate()
}

// 桌面端点击 <video>（含原生 controls）时不再自行切换 play/pause，避免与 controls 冲突；
// 移动端仍走原有 handleVideoTap 逻辑。
const handleVideoClick = (event: Event) => {
  if (isDesktop.value) {
    event.stopPropagation()
    return
  }
  event.stopPropagation()
  handleVideoTap()
}

// 桌面端自定义中央播放按钮：单向 play，交给原生 controls 处理后续
const handleCenterPlay = () => {
  const video = activeVideo()
  if (!video) return
  const result = video.play?.()
  if (result && typeof result.catch === 'function') {
    result.catch(() => {
      showControls()
    })
  }
}

// 点击视频区域：切换 play/pause（同时联动工具条）
const handleVideoTap = () => {
  const now = Date.now()
  if (now - lastVideoTapAt.value < 180) return
  lastVideoTapAt.value = now

  if (isDesktopBusy()) return

  const video = activeVideo()
  if (!video) return

  if (video.paused) {
    const result = video.play?.()
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        showControls()
      })
    }
  } else {
    video.pause?.()
  }
}

const togglePlayback = () => {
  handleVideoTap()
}

// 点击遮罩（视频外区域）：仅切换工具条，不影响播放
const handleOverlayTap = (event?: Event) => {
  if (isDesktopBusy()) return
  if (event && event.target instanceof HTMLVideoElement) return
  const now = Date.now()
  if (now - lastOverlayTapAt.value < 180) return
  lastOverlayTapAt.value = now
  if (showMoreOperate.value) {
    hideControls()
  } else {
    showControls()
  }
}

const handleOverlayClose = () => {
  if (isDesktop.value) return
  close()
}

const setVideoRef = (el: Element | any, index: number) => {
  if (el instanceof HTMLVideoElement) {
    videoRefs.set(index, el)
    el.playbackRate = playbackRate.value
    return
  }
  videoRefs.delete(index)
}

const activeVideo = () => videoRefs.get(currentIdx.value)

const applyPlaybackRate = () => {
  const video = activeVideo()
  if (video) {
    video.playbackRate = playbackRate.value
  }
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
}

const activeItem = computed(() => props.images[currentIdx.value] || {})

import { getLunarDate } from '@/lib/lunar';

// Information Computed Props
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
const fileWH = computed(() => {
  const { width, height } = activeItem.value
  return `${width} x ${height}`
})
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

const handleUpdateLike = () => {
  updateLike(activeItem.value._id).then(() => {
    const nextLiked = !activeItem.value.isLiked
    activeItem.value.isLiked = nextLiked
    photoListStore?.updateLiked?.(activeItem.value._id, nextLiked)
  })
}

const showAlbumSelect = ref(false)
const selectedAlbums = ref<string[]>([])

const handleAddAlbum = async () => {
  showAlbumSelect.value = true
  if (activeItem.value.albumId?.length) {
    selectedAlbums.value = [...activeItem.value.albumId]
  } else {
    selectedAlbums.value = []
  }
}

const photoListStore = usePhotoListStore()
const albumPhotoStore = useAlbumPhotoStore()

const removePhotoFromList = (id: string) => {
  photoListStore?.deletePhoto?.(id)
  // 通知上层刷新相册信息
  albumPhotoStore?.refreshAlbum?.()
  if (photoListStore?.isEmpty?.value) {
    show.value = false
  }
}

const handleSaveAlbumSelect = async (albumIds: string[]) => {
  await updatePhotoAlbum(activeItem.value._id, albumIds)
  activeItem.value.albumId = albumIds
  showAlbumSelect.value = false
  // 判断是否从当前相册移除
  if (props.album?._id && !albumIds.includes(props.album?._id)) {
    removePhotoFromList(activeItem.value._id)
  }

  showNotify({ type: 'success', message: '更改成功' });
}

// 设置封面
const route = useRoute()
const isAlbumPage = computed(() => albumPhotoStore && route.name === 'album-photo')
const showSetCover = computed(() => isAlbumPage.value && activeItem.value.key !== props.album?.coverKey)
const handleSetCover = () => {
  if (!props.album) {
    return
  }
  updateAlbumCover(props.album?._id, activeItem.value.key).then(() => {
    showNotify({ type: 'success', message: '封面更新成功' });
    // 通知上层封面刷新
    albumPhotoStore?.refreshAlbum?.()
  })
}

// 删除视频
const handleDeleteImage = async () => {
  const confirmed = await showConfirmDialog({
    title: '删除确认',
    message: '确定要删除这个视频吗？',
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
  activeVideo()?.pause?.()
  show.value = false
}

const isDesktopBusy = () => editMode.value || showSpeedSheet.value || showAlbumSelect.value

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
    // {
    //   icon: activeItem.value.isLiked ? 'like' : 'like-o',
    //   text: '我喜欢',
    //   handleClick: handleUpdateLike,
    //   activeColor: activeItem.value.isLiked ? '#f53f3f' : '#000',
    //   active: activeItem.value.isLiked
    // },
    {
      icon: 'delete-o',
      text: '删除',
      handleClick: handleDeleteImage
    },
    // {
    //   icon: 'star-o',
    //   text: '添加相册',
    //   handleClick: handleAddAlbum
    // },
    {
      icon: 'down',
      text: '下载',
      handleClick: downloadImage
    }
  ]
})

</script>

<style scoped lang="scss">
// 自定义过渡动画
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

// 确保默认状态
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

.video-preview-overlay {
  background-color: #000;
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s ease;
  --video-chrome-bg: #fff;
  --video-chrome-text: #20242b;
  --video-chrome-subtext: #7d8795;
}

.video-preview-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.show-detail {
  // 当显示操作栏时，让 overlay 背景变白
  // 但注意 .video-preview-overlay 是父级，这里我们在子级上加 class 只能控制子级样式
  // 或者通过 :class 控制 overlay 的样式。
  // 不过 PreviewImage 是通过 ::v-deep 控制 van-image-preview__overlay。
  // 这里我们是自己写的 van-overlay。
  // 实际上 van-overlay 的背景色是在 .video-preview-overlay 设置的。
  // 我们可以通过 js 控制 overlay 的 style，或者...
  // 由于 video-preview-container 是 overlay 的 slot 内容，无法直接改变父级样式。
  // 简单方案：overlay 背景设为透明，而在 container 里放一个 absolute 的背景层，或者...
  // 其实 PreviewImage 的实现里 .show-detail 是加在 wrapper 上的，然后修改了 CSS 变量 --van-image-preview-overlay-background

  // 对于视频，背景变白可能导致视频画面上下黑边变白条（如果视频没填满）。
  // 但用户要求“默认底色为白色”。
}

// 修正：我们需要把 show-detail 类加在 overlay 或者动态绑定 style。
// 鉴于 Template 结构，我们在 van-overlay 上直接绑定 class 可能更方便，但 van-overlay 的 slot 是内容。
// 我们可以把 .video-preview-overlay 改为 :class="['video-preview-overlay', { 'white-bg': showMoreOperate }]"

.video-swipe {
  width: 100%;
  height: 100%;
}

.video-swipe-item {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
  object-fit: contain;
}

.video-tap-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: pointer;
  background: transparent;
}

.video-center-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 6;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  padding-left: 4px;

  &:hover {
    background: rgba(0, 0, 0, 0.72);
    transform: translate(-50%, -50%) scale(1.05);
  }

  &:active {
    transform: translate(-50%, -50%) scale(0.96);
  }
}

.cover-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    pointer-events: none; // 让点击穿透，除非点在子元素上
    background: var(--video-chrome-bg);
    box-sizing: border-box;
}

.cover-wrapper > * {
    pointer-events: auto;
}

.cover-header {
  padding: 10px;
  transition: all 0.5s ease;
  background: transparent;
  color: var(--video-chrome-text);
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
          color: var(--video-chrome-text);
      }
      .header-text {
          min-width: 0;
          h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 500;
            color: var(--video-chrome-text);

            .week-day, .lunar-date {
                font-size: 12px;
                opacity: 0.8;
                color: var(--video-chrome-subtext);
            }
          }

          h4 {
            margin: 4px 0 0 0;
            font-size: 12px;
            font-weight: normal;
            opacity: 0.8;
            color: var(--video-chrome-subtext);

            .lunar-date {
              color: var(--video-chrome-subtext);
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
      color: var(--video-chrome-text);
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

// 适配 BottomActions 在深色背景下的显示，如果需要的话。
// BottomActions 组件内部可能有自己的样式。如果它是白底的，在视频上会显示白底条。
// PreviewImage 是白底的。这里为了“一致”，我们也应该接受白底，或者让 BottomActions 透明。
// 通常视频应用底部操作栏是透明或半透明的。
// 但为了严格的“功能一致”，我们先直接引用。

</style>
