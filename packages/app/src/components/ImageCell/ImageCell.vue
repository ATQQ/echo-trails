<template>
  <van-image @click="emit('click')" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel" fit="cover" position="center" width="100%" height="100%"
    lazy-load :src="cachedSrc" class="image-cell-wrapper" @load="handleLoad" @error="handleError">
    <slot />
    <!-- 极简加载占位：纯色背景，无动画，避免多图卡顿 -->
    <template v-slot:loading>
      <div class="loading-container placeholder-pure"></div>
    </template>
    
    <template v-slot:error>
      <div class="error-container">
        <van-icon name="photo-fail" size="24" color="#dcdee0" />
      </div>
    </template>
    <!-- 重复标识的蓝色小三角 -->
    <div v-if="isRepeat" class="repeat-indicator"></div>
    
    <!-- 缓存调试标识与删除操作 -->
    <div v-if="isCacheDebugMode && isUsingCache" class="cache-debug-badge" @click.stop="handleDeleteCache">
      <van-icon name="delete-o" /> 缓存
    </div>
  </van-image>
</template>

<script lang="ts" setup>
import { useCachedImage, isCacheDebugMode, deleteSingleImageCache } from '@/composables/useCachedImage';
import { toRef, computed } from 'vue';

const props = defineProps<{
  src: string
  isRepeat?: boolean
  cacheKey?: string
}>()

const cachedSrc = useCachedImage(toRef(props, 'src'), toRef(props, 'cacheKey'))

const isUsingCache = computed(() => {
  return cachedSrc.value && cachedSrc.value.includes('image_cache');
})

const handleDeleteCache = async () => {
  await deleteSingleImageCache(props.src, props.cacheKey);
  // Optional: could force reload the image here, but since it's debug mode, toast is enough
}

const emit = defineEmits<{
  (e: 'click'): void,
  (e: 'longpress'): void,
  (e: 'load'): void,
  (e: 'error'): void
}>()

const handleLoad = () => {
  emit('load');
}

const handleError = () => {
  emit('error');
}

let pressTimer: any = null;

const start = () => {
  if (pressTimer === null) {
    pressTimer = setTimeout(() => {
      emit('longpress');
    }, 500); // 500ms 是长按的触发时间
  }
};

const cancel = () => {
  if (pressTimer !== null) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
};
</script>

<style scoped>
.image-cell-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  /* 开启 GPU 加速，缓解滚动卡顿 */
  transform: translateZ(0);
  will-change: transform;
  
  /* Vant 的 lazyload 默认带 0.3s 的 opacity 动画 */
  /* 这里保证图片加载完成时能自然渐显 */
  :deep(.van-image__img) {
    transition: opacity 0.5s ease-out;
    /* 同样为图片内容开启 GPU 加速 */
    transform: translateZ(0);
    will-change: opacity;
  }
}

.placeholder-bg {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f2f3f5 25%, #e6e8eb 37%, #f2f3f5 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}

.loading-container, .error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.error-container {
  background-color: #f7f8fa;
}

.repeat-indicator {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-left: 16px solid transparent;
  border-top: 16px solid #1989fa;
  z-index: 10;
}

.cache-debug-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 2px;
  z-index: 10;
  cursor: pointer;
}
</style>
