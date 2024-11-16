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
              <div class="header-actions">
                <van-icon v-show="showSetCover" class="set-cover-icon" @click.stop="handleSetCover" name="bookmark-o"
                  size="24" />
                <van-icon @click.stop="handleEditDescription" :name="editMode ? 'chat' : 'chat-o'" class="message-icon"
                  size="24" />
                <van-icon @click.stop="showInfoDetail = !showInfoDetail" :name="showInfoDetail ? 'more' : 'more-o'"
                  class="more-icon" size="24" />
              </div>

            </header>
            <transition name="van-slide-right">
              <div v-show="showInfoDetail" class="cover-info">
                <van-cell title="图片信息" :value="filesize" :label="activeImage.name" />
                <van-cell title="尺寸" :value="fileWH" />
                <van-cell title="格式" :value="fileType" />
              </div>
            </transition>

            <div v-show="!editMode && activeImage.description" class="description-info">
              {{ activeImage.description }}
            </div>
            <div v-show="editMode" class="edit-description">
              <van-field :border="false" show-word-limit :autofocus="true" v-model="description" rows="6" autosize
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
          <footer v-show="showMoreOperate" class="cover-footer">
            <div class="footer-item" @click.stop="handleUpdateLike">
              <van-icon :color="activeImage.isLiked ? '#f53f3f' : '#000'"
                :name="activeImage.isLiked ? 'like' : 'like-o'" size="22" />
              <span class="title">我喜欢</span>
            </div>
            <div class="footer-item" @click.stop="handleDeleteImage">
              <van-icon name="delete-o" size="22" />
              <span class="title">删除</span>
            </div>
            <div class="footer-item">
              <van-icon @click.stop="handleAddAlbum" name="star-o" size="22" />
              <span class="title">添加相册</span>
            </div>
          </footer>
        </transition>
      </template>
    </van-image-preview>

    <!-- 选择相册 -->
    <van-action-sheet v-model:show="showAlbumSelect" title="添加到相册">
      <van-empty v-if="!albumList.length" description="空空如也，快去创建吧" />
      <div v-else class="album-list">
        <van-checkbox-group v-model="selectedAlbums">
          <van-grid :gutter="10" :column-num="2" :border="false">
            <van-grid-item v-for="(album, idx) in albumList" :key="album._id">
              <div class="small-card" @click.stop.prevent="toggleSelectAlbum(idx)">
                <div class="cover">
                  <van-image fit="cover" position="center" width="100%" height="100%" lazy-load :src="album.cover" />
                  <van-checkbox :ref="el => checkboxRefs[idx] = el" :name="album._id" class="selected" />
                </div>
                <div class="title-desc">
                  <h2>{{ album.name }}</h2>
                  <p>{{ album.count }}</p>
                </div>
              </div>
            </van-grid-item>
          </van-grid>
        </van-checkbox-group>
      </div>
    </van-action-sheet>
    <van-floating-bubble @click="handleSaveAlbumSelect" v-if="showAlbumSelect" :gap="16" class="save-album-select"
      axis="xy" icon="success" magnetic="x" />
  </div>
</template>

<script lang="ts" setup>
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { usePhotoListStore } from '@/composables/photoList';
import { formatSize } from '@/lib/file';
import { deletePhoto, getAlbums, updateAlbumCover, updateDescription, updateLike, updatePhotoAlbum } from '@/service';
import { useEventListener } from '@vueuse/core';
import dayjs from 'dayjs';
import { showConfirmDialog, showNotify } from 'vant';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

const { images = [], start = 0, album } = defineProps<{
  images: Photo[]
  start?: number
  album?: Album
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
  if (editMode.value) {
    editMode.value = false
    return
  }
  editMode.value = true
  description.value = activeImage.value.description || ''
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

const albumList = ref<Album[]>([])
const showAlbumSelect = ref(false)
const loadAlbum = () => {
  return getAlbums().then((res) => {
    const newValue: Album[] = []
    if (res.large) {
      newValue.push(...res.large)
    }
    if (res.small) {
      newValue.push(...res.small)
    }
    albumList.value = newValue
  })
}
const selectedAlbums = ref<string[]>([])
const checkboxRefs = ref<any[]>([])
const toggleSelectAlbum = (idx: number) => {
  checkboxRefs.value[idx].toggle()
}
const handleAddAlbum = async () => {
  showAlbumSelect.value = true
  if (activeImage.value.albumId?.length) {
    selectedAlbums.value = [...activeImage.value.albumId]
  } else {
    selectedAlbums.value = []
  }
  loadAlbum()
}

const handleSaveAlbumSelect = async () => {
  const albumIds = selectedAlbums.value
  await updatePhotoAlbum(activeImage.value._id, albumIds)
  activeImage.value.albumId = albumIds
  showAlbumSelect.value = false
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
const photoListStore = usePhotoListStore()
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
    photoListStore?.deletePhoto?.(activeImage.value._id)
    // 通知上层刷新相册信息
    albumPhotoStore?.refreshAlbum?.()
    if (photoListStore?.isEmpty?.value) {
      show.value = false
    }
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

.save-album-select {
  z-index: 3000 !important;
  --van-floating-bubble-icon-size: 20;
  --van-floating-bubble-size: 30px;
  --van-floating-bubble-background: var(--van-success-color);
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
  transition: all 0.5s ease;
  background-color: var(--van-image-preview-overlay-background);
  position: relative;

  h3 {
    margin-bottom: 0;
    margin-top: 10px;
    font-weight: 500;
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
  padding: 4px;
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

.album-list {
  // padding: 10px;
}

.small-card {
  overflow: hidden;

  :deep(.van-image) {
    border-radius: 10px;
    height: 40vw !important;
    width: 40vw !important;
    overflow: hidden;
  }

  .title-desc {
    h2 {
      margin: 2px 0;
      color: #000;
      font-size: 14px;
      font-weight: normal;
    }

    p {
      margin-top: 0;
      font-size: 10px;
      color: #666;
    }
  }

  .cover {
    position: relative;

    .selected {
      position: absolute;

      right: 10px;
      bottom: 10px;
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
