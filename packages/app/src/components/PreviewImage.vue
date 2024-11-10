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
        <!-- 编辑description -->
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
        <!-- 底部操作栏 -->
        <transition name="van-slide-up">
          <footer v-show="showMoreOperate" class="cover-footer">
            <div class="footer-item" @click.stop="handleUpdateLike">
              <van-icon :color="activeImage.isLiked ? '#f53f3f' : '#000'"
                :name="activeImage.isLiked ? 'like' : 'like-o'" size="22" />
              <span class="title">我喜欢</span>
            </div>
            <div v-show="showSetCover" class="footer-item" @click.stop="handleSetCover">
              <van-icon name="bookmark-o" size="22" />
              <span class="title">设为封面</span>
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
import { formatSize } from '@/lib/file';
import { getAlbums, updateAlbumCover, updateDescription, updateLike, updatePhotoAlbum } from '@/service';
import { useEventListener } from '@vueuse/core';
import dayjs from 'dayjs';
import { showNotify } from 'vant';
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
    const newValue = [...res.large, ...res.small]
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
      font-weight: lighter;
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
</style>
