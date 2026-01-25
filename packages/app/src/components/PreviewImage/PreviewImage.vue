<template>
  <div class="preview-image" ref="previewWrapper" :class="{
    'show-detail': showMoreOperate
  }">
    <van-image-preview :close-on-popstate="false" @change="handleChange" v-model:show="show" :images="urls"
      :start-position="start" swipeDuration="100" :showIndex="false" :onClose="handleOnClose" :closeOnClickImage="false"
      transition="zoom">
      <template #cover>
        <!-- 顶部操作栏 -->
        <transition name="van-slide-down">
          <div v-show="showMoreOperate" class="cover-wrapper safe-padding-top">
            <header class="cover-header" @click="show = false">
              <h3>{{ coverDate }}<span class="week-day"> - {{ weekDay }}</span></h3>
              <h4>{{ coverTime }}</h4>
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
              <van-cell title="图片信息" :value="filesize" :label="activeImage.name" />
              <van-cell title="尺寸" :value="fileWH" />
              <van-cell title="格式" :value="fileType" />
            </div>

            <div v-show="!editMode && activeImage.description" class="description-info">
              {{ activeImage.description }}
            </div>
            <div v-show="editMode" class="edit-description">
              <van-field ref="descriptionInput" :border="false" show-word-limit v-model="description" rows="6" autosize
                type="textarea" maxlength="1000" placeholder="照片背后的故事" />
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
        <transition name="van-slide-up">
          <BottomActions v-show="showMoreOperate" :menus="menus" />
        </transition>
      </template>
    </van-image-preview>

    <!-- 选择相册 -->
    <SelectAlbumModal v-model:show="showAlbumSelect" @save="handleSaveAlbumSelect" :current-album-id="album?._id"
      :selected="selectedAlbums" />
  </div>
</template>

<script lang="ts" setup>
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { usePhotoListStore } from '@/composables/photoList';
import { downloadFile, formatSize, generateDownloadFileName } from '@/lib/file';
import { deletePhoto, updateAlbumCover, updateDescription, updateLike, updatePhotoAlbum } from '@/service';
import { useEventListener } from '@vueuse/core';
import dayjs from 'dayjs';
import { showConfirmDialog, showNotify, showLoadingToast, closeToast } from 'vant';
import { computed, ref } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import SelectAlbumModal from '../SelectAlbumModal/SelectAlbumModal.vue';
import BottomActions from '../BottomActions/BottomActions.vue';

const { images = [], start = 0, album, isDelete = false } = defineProps<{
  images: Photo[]
  start?: number
  album?: Album
  isDelete?: boolean
}>()

const show = defineModel("show", { type: Boolean, default: false })


const urls = computed(() => images.map(i => i.preview))

const currentIdx = ref(start)

const previewWrapper = ref<HTMLDivElement>()
const showMoreOperate = ref(true)
const touchStart = ref<Touch>()
const touchTimes = ref(0)
// 查看预览图片细节
const checkImageDetail = (e: TouchEvent) => {
  // 手势滑动过滤
  const { clientX, clientY } = e.changedTouches[0]
  if (touchStart.value?.clientX !== clientX || touchStart.value?.clientY !== clientY) {
    return
  }
  const target = e.target as HTMLImageElement
  if (target.classList.contains('van-image__img')) {
    // 非常快速的双击过滤
    // https://github.com/youzan/vant/blob/eca18a1dad5908eb8a6e989bb45094f7d2e5414f/packages/vant/src/image-preview/ImagePreviewItem.tsx#L278
    touchTimes.value += 1
    setTimeout(() => {
      if (touchTimes.value === 1) {
        showMoreOperate.value = !showMoreOperate.value
      }
      touchTimes.value = 0
    }, 260)
  }
}
useEventListener(previewWrapper, 'touchstart', (e: TouchEvent) => {
  touchStart.value = e.touches[0]
})
useEventListener(previewWrapper, 'touchend', checkImageDetail)

const handleChange = (index: number) => {
  currentIdx.value = index
  editMode.value = false
}

const activeImage = computed(() => images[currentIdx.value] || {})
const coverDate = computed(() => dayjs(activeImage.value.lastModified).format('YYYY年MM月DD日'))
const coverTime = computed(() => dayjs(activeImage.value.lastModified).format('HH:mm'))
const weekDay = computed(() => {
  const weekDayMap = ['日', '一', '二', '三', '四', '五', '六']
  return `星期${weekDayMap[new Date(activeImage.value.lastModified).getDay()]}`
})
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
  if(!fileType) return type
  return `${type} (${fileType})`
})

const showInfoDetail = ref(false)

const showDescription = ref(true)

const editMode = ref(false)
const handleOnClose = () => {
  editMode.value = false
}

const description = ref('')
const descriptionInput = ref<HTMLInputElement>()
const handleEditDescription = () => {
  if (editMode.value) {
    editMode.value = false
    return
  }
  editMode.value = true
  description.value = activeImage.value.description || ''
  setTimeout(() => {
    descriptionInput.value?.focus()
  }, 100)
}
const handleSaveDescription = () => {
  updateDescription(activeImage.value._id, description.value).then(() => {
    editMode.value = false
    showDescription.value = true
    activeImage.value.description = description.value
    showNotify({ type: 'success', message: '更新成功' });
  })
}

const handleUpdateLike = () => {
  updateLike(activeImage.value._id).then(() => {
    activeImage.value.isLiked = !activeImage.value.isLiked
  })
}

const showAlbumSelect = ref(false)
const selectedAlbums = ref<string[]>([])

const handleAddAlbum = async () => {
  showAlbumSelect.value = true
  if (activeImage.value.albumId?.length) {
    selectedAlbums.value = [...activeImage.value.albumId]
  } else {
    selectedAlbums.value = []
  }
}

const photoListStore = usePhotoListStore()

const removePhotoFromList = (id: string) => {
  photoListStore?.deletePhoto?.(id)
  // 通知上层刷新相册信息
  albumPhotoStore?.refreshAlbum?.()
  if (photoListStore?.isEmpty?.value) {
    show.value = false
  }
}

const handleSaveAlbumSelect = async (albumIds: string[]) => {
  await updatePhotoAlbum(activeImage.value._id, albumIds)
  activeImage.value.albumId = albumIds
  showAlbumSelect.value = false
  // 判断是否从当前相册移除
  if (album?._id && !albumIds.includes(album?._id)) {
    removePhotoFromList(activeImage.value._id)
  }

  showNotify({ type: 'success', message: '更改成功' });
}

// 设置封面
const route = useRoute()
const albumPhotoStore = useAlbumPhotoStore()
const isAlbumPage = computed(() => albumPhotoStore && route.name === 'album-photo')
const showSetCover = computed(() => isAlbumPage.value && activeImage.value.key !== album?.coverKey)
const handleSetCover = () => {
  if (!album) {
    return
  }
  updateAlbumCover(album?._id, activeImage.value.key).then(() => {
    showNotify({ type: 'success', message: '封面更新成功' });
    // 通知上层封面刷新
    albumPhotoStore?.refreshAlbum?.()
  })
}

// 删除图片
const handleDeleteImage = async () => {
  const confirmed = await showConfirmDialog({
    title: '删除确认',
    message:
      '确定要删除这张照片吗？',
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  if (!confirmed) {
    return;
  }

  deletePhoto(activeImage.value._id).then(() => {
    showNotify({ type: 'success', message: '删除成功' });
    removePhotoFromList(activeImage.value._id)
  })
}

onBeforeRouteLeave((to, from, next) => {
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

const restorePhotos = () => {
  photoListStore?.restorePhotos?.([activeImage.value._id])
}

const downloadImage = () => {
  const toast = showLoadingToast({
    message: '下载中...',
    forbidClick: true,
    duration: 0,
  });

  downloadFile(activeImage.value.preview, generateDownloadFileName(activeImage.value.name, activeImage.value.type))
    .finally(() => {
      closeToast();
    })
}
const menus = computed(() => {
  if (isDelete) {
    return [
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
    {
      icon: activeImage.value.isLiked ? 'like' : 'like-o',
      text: '我喜欢',
      handleClick: handleUpdateLike,
      activeColor: activeImage.value.isLiked ? '#f53f3f' : '#000',
      active: activeImage.value.isLiked
    },
    {
      icon: 'delete-o',
      text: '删除',
      handleClick: handleDeleteImage
    },
    {
      icon: 'star-o',
      text: '添加相册',
      handleClick: handleAddAlbum
    },
    {
      icon: 'down',
      text: '下载',
      handleClick: downloadImage
    }
  ]
})
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

.save-album-select {
  z-index: 3000 !important;
  --van-floating-bubble-icon-size: 20;
  --van-floating-bubble-size: 30px;
  --van-floating-bubble-background: var(--van-success-color);
}
</style>

<style lang="scss" scoped>
.safe-padding-top,
.safe-padding-bottom {
  background-color: var(--safe-area-bg-color);
}

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
  transition: all 0.5s ease;
  background-color: var(--van-image-preview-overlay-background);
  position: relative;

  h3 {
    margin-bottom: 0;
    margin-top: 10px;
    font-weight: 500;

    .week-day {
      color: #999;
      font-size: 12px;
    }
  }

  h4 {
    margin: 6px 0 0 0;
    font-weight: normal;
  }

  .header-actions {
    position: absolute;
    right: 20px;
    top: 36%;
    width: 120px;
    display: flex;
    justify-content: flex-end;
    align-items: center;

    >i {
      margin-left: 24px;
    }
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
  transition: all 0.5s ease;
  padding: var(--van-cell-vertical-padding) var(--van-cell-horizontal-padding);
  overflow: hidden;
  color: var(--van-cell-text-color);
  font-size: var(--van-cell-font-size);
  line-height: var(--van-cell-line-height);
  background: var(--van-image-preview-overlay-background);
}

.cover-footer {
  padding-top: 8px;
  padding-left: 4px;
  padding-right: 4px;
  transition: all 0.5s ease;
  background-color: var(--van-image-preview-overlay-background);
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;

  .footer-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    span.title {
      font-size: 10px;
      margin-top: 5px;
    }
  }
}

.edit-description {
  padding-bottom: 10px;
  background-color: #fff;
}

.edit-btns {
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  padding-bottom: 10px;
}
</style>
