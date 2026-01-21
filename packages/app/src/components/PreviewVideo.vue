<template>
  <van-overlay :show="show" @click="close" :class="['video-preview-overlay', { 'white-bg': showMoreOperate }]" z-index="2000">
    <div class="video-preview-container" @click.stop="toggleControls">
      <van-swipe ref="swipeRef" :initial-swipe="start" @change="onChange" :loop="false" class="video-swipe"
        :show-indicators="false">
        <van-swipe-item v-for="(item, index) in images" :key="item._id" class="video-swipe-item">
          <div class="video-wrapper">
            <!-- 阻止点击冒泡到 container，避免与 toggleControls 冲突，或者让 container 处理 -->
            <!-- 这里 video 使用 controls，点击 video 内部可能会被原生控件拦截。
                 为了能切换 UI 显隐，我们可以在 video 上层放一个透明遮罩，或者依赖点击空白处。
                 但在移动端，点击 video 往往是播放/暂停。
                 策略：点击 video 区域不做处理（交给原生控件或 video 自身交互），
                 点击非 video 区域（如果 video 没填满）切换 UI。
                 或者：接受点击 video 可能会导致 UI 切换不灵敏。

                 PreviewImage 是通过监听 touch 事件来判断点击的。

                 这里简化处理：点击 container 切换。
            -->
            <video v-if="shouldRender(index)" controls playsinline webkit-playsinline class="video-player"
              :poster="item.cover" @click.stop>
              <source :src="item.url" :type="item.type || 'video/mp4'">
              您的浏览器不支持视频播放。
            </video>
          </div>
        </van-swipe-item>
      </van-swipe>

      <!-- 顶部操作栏 -->
      <transition name="slide-down">
        <div v-show="showMoreOperate" class="cover-wrapper safe-padding-top" @click.stop>
          <header class="cover-header" @click="close">
            <div class="header-left">
                <van-icon name="arrow-left" size="24" class="back-icon" />
                <div class="header-text">
                    <h3>{{ coverDate }}<span class="week-day"> - {{ weekDay }}</span></h3>
                    <h4>{{ coverTime }}</h4>
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

      <!-- 选择相册 -->
      <SelectAlbumModal v-model:show="showAlbumSelect" @save="handleSaveAlbumSelect" :current-album-id="album?._id"
        :selected="selectedAlbums" />
    </div>
  </van-overlay>
</template>

<script lang="ts" setup>
import { useAlbumPhotoStore } from '@/composables/albumphoto';
import { usePhotoListStore } from '@/composables/photoList';
import { downloadFile, formatSize } from '@/lib/file';
import { deletePhoto, updateAlbumCover, updateDescription, updateLike, updatePhotoAlbum } from '@/service';
import dayjs from 'dayjs';
import { showConfirmDialog, showNotify } from 'vant';
import { computed, ref, watch } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import SelectAlbumModal from './SelectAlbumModal.vue';
import BottomActions from './BottomActions.vue';

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

watch(() => props.start, (val) => {
  currentIdx.value = val || 0
  // 如果 swipeRef 存在，跳转到指定位置
  if (swipeRef.value && show.value) {
    swipeRef.value.swipeTo(val, { immediate: true })
  }
})

// 只渲染当前、前一个和后一个视频，避免性能问题
const shouldRender = (index: number) => {
  return Math.abs(index - currentIdx.value) <= 1
}

const onChange = (index: number) => {
  currentIdx.value = index
  editMode.value = false
  // 切换视频时，最好重置UI显示状态或保持不变，这里保持不变
}

const toggleControls = () => {
    showMoreOperate.value = !showMoreOperate.value
}

const activeItem = computed(() => props.images[currentIdx.value] || {})

// Information Computed Props
const coverDate = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('YYYY年MM月DD日') : '')
const coverTime = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('HH:mm') : '')
const weekDay = computed(() => {
  if (!activeItem.value.lastModified) return ''
  const weekDayMap = ['日', '一', '二', '三', '四', '五', '六']
  return `星期${weekDayMap[new Date(activeItem.value.lastModified).getDay()]}`
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
    activeItem.value.isLiked = !activeItem.value.isLiked
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
  downloadFile(activeItem.value.preview || activeItem.value.url, activeItem.value.name)
}

const close = () => {
  show.value = false
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

const menus = computed(() => {
  if (props.isDelete) {
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
  --van-image-preview-overlay-background: rgba(0,0,0,0.5); // 默认半透明黑

  &.white-bg {
      background-color: #fff;
      --van-image-preview-overlay-background: #fff; // 激活时为白
  }
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
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
}

.cover-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    pointer-events: none; // 让点击穿透，除非点在子元素上
}

.cover-wrapper > * {
    pointer-events: auto;
}

.cover-header {
  padding: 10px;
  transition: all 0.5s ease;
  background: var(--van-image-preview-overlay-background); // 保持一致
  color: #333; // 白色背景下文字改为深色
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  .header-left {
      display: flex;
      align-items: center;
      .back-icon {
          padding: 10px 10px 10px 0;
          margin-right: 5px;
          color: #333;
      }
      .header-text {
          h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 500;
            color: #333;

            .week-day {
                font-size: 12px;
                opacity: 0.8;
                color: #999;
            }
          }

          h4 {
            margin: 4px 0 0 0;
            font-size: 12px;
            font-weight: normal;
            opacity: 0.8;
            color: #666;
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
      color: #333;
    }
  }
}

.cover-info {
    background: transparent; // 白色背景下无需额外背景
    margin: 10px;
    border-radius: 8px;
    overflow: hidden;
    :deep(.van-cell) {
        background: transparent;
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
  background: transparent;
  margin-top: auto;
}

.edit-description {
  padding: 10px;
  background-color: #fff;
  margin: 10px;
  border-radius: 8px;
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
}

// 适配 BottomActions 在深色背景下的显示，如果需要的话。
// BottomActions 组件内部可能有自己的样式。如果它是白底的，在视频上会显示白底条。
// PreviewImage 是白底的。这里为了“一致”，我们也应该接受白底，或者让 BottomActions 透明。
// 通常视频应用底部操作栏是透明或半透明的。
// 但为了严格的“功能一致”，我们先直接引用。

</style>
