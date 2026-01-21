<template>
  <van-overlay :show="show" @click="close" class="video-preview-overlay" z-index="2000">
    <div class="video-preview-container">
      <van-swipe ref="swipeRef" :initial-swipe="start" @change="onChange" :loop="false" class="video-swipe"
        :show-indicators="false">
        <van-swipe-item v-for="(item, index) in images" :key="item._id" class="video-swipe-item">
          <div class="video-wrapper" @click.stop>
            <video v-if="shouldRender(index)" controls playsinline webkit-playsinline class="video-player"
              :poster="item.cover">
              <source :src="item.url" :type="item.type || 'video/mp4'">
              您的浏览器不支持视频播放。
            </video>
          </div>
        </van-swipe-item>
      </van-swipe>

      <!-- 顶部信息 -->
      <transition name="van-slide-down">
        <div v-show="showControls" class="video-header safe-padding-top">
          <div class="header-content">
            <van-icon name="arrow-left" size="24" @click.stop="close" />
            <div class="header-info">
              <h3>{{ coverDate }}</h3>
              <h4>{{ coverTime }}</h4>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </van-overlay>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';

const props = defineProps<{
  images: any[]
  start?: number
  album?: any
  isDelete?: boolean
}>()

const show = defineModel("show", { type: Boolean, default: false })

const currentIdx = ref(props.start || 0)
const swipeRef = ref()
const showControls = ref(true)

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
  // 暂停其他视频? (Vue list rendering might handle this if we use v-if, 
  // but better to explicitly pause if we had refs. 
  // With v-if, DOM is removed, so video stops.)
}

const activeItem = computed(() => props.images[currentIdx.value] || {})
const coverDate = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('YYYY年MM月DD日') : '')
const coverTime = computed(() => activeItem.value.lastModified ? dayjs(activeItem.value.lastModified).format('HH:mm') : '')

const close = () => {
  show.value = false
}

</script>

<style scoped lang="scss">
.video-preview-overlay {
  background-color: #000;
  display: flex;
  flex-direction: column;
}

.video-preview-container {
  width: 100%;
  height: 100%;
  position: relative;
}

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

.video-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent);
  color: #fff;
  z-index: 10;
  pointer-events: none;

  /* allow clicking back button */
  .header-content {
    display: flex;
    align-items: center;
    pointer-events: auto;

    .van-icon {
      padding: 10px;
      margin-right: 10px;
    }

    .header-info {
      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }

      h4 {
        margin: 4px 0 0 0;
        font-size: 12px;
        font-weight: normal;
        opacity: 0.8;
      }
    }
  }
}

.safe-padding-top {
  padding-top: max(env(safe-area-inset-top), 20px);
}
</style>