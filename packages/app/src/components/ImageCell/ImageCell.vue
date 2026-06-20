<template>
  <van-image @click="($event) => emit('click', $event)" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel" fit="cover" position="center" width="100%" height="100%"
    lazy-load :src="cachedSrc" class="image-cell-wrapper" @load="handleLoad" @error="handleError">
    <slot />
    <template v-slot:loading>
      <div class="loading-container placeholder-pure"></div>
    </template>
    
    <template v-slot:error>
      <div class="error-container">
        <van-icon name="photo-fail" size="24" color="#dcdee0" />
      </div>
    </template>
    
    <div v-if="isCacheDebugMode && isUsingCache" class="cache-debug-badge" @click.stop="handleDeleteCache">
      <van-icon name="delete-o" /> 缓存
    </div>

    <img v-if="isLive" class="live-photo-icon" src="/assets/images/live-photo.svg" alt="" />
  </van-image>
</template>

<script lang="ts" setup>
import { useCachedImage, isCacheDebugMode, deleteSingleImageCache } from '@/composables/useCachedImage';
import { toRef, computed } from 'vue';

const props = defineProps<{
  src: string
  cacheKey?: string
  isLive?: boolean
}>()

const { cachedSrc, handleLoadError } = useCachedImage(toRef(props, 'src'), toRef(props, 'cacheKey'))

const isUsingCache = computed(() => {
  return cachedSrc.value && cachedSrc.value.includes('image_cache');
})

const handleDeleteCache = async () => {
  await deleteSingleImageCache(props.src, props.cacheKey);
}

const emit = defineEmits<{
  (e: 'click', event: Event): void,
  (e: 'longpress'): void,
  (e: 'load'): void,
  (e: 'error'): void
}>()

const handleLoad = () => {
  emit('load');
}

const handleError = () => {
  handleLoadError();
  emit('error');
}

let pressTimer: ReturnType<typeof setTimeout> | null = null;

const start = () => {
  if (pressTimer === null) {
    pressTimer = setTimeout(() => {
      emit('longpress');
    }, 500);
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
  transform: translateZ(0);
  will-change: transform;
  
  :deep(.van-image__img) {
    transition: opacity 0.5s ease-out;
    transform: translateZ(0);
    will-change: opacity;
  }
}

.placeholder-pure {
  width: 100%;
  height: 100%;
  background-color: #f2f3f5;
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

.live-photo-icon {
  position: absolute;
  left: 6px;
  bottom: 6px;
  width: 16px;
  height: 16px;
  z-index: 10;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
}
</style>
