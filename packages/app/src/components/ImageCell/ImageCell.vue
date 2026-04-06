<template>
  <van-image @click="emit('click')" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel" fit="cover" position="center" width="100%" height="100%"
    lazy-load :src="cachedSrc" class="image-cell-wrapper">
    <slot />
    <template v-slot:loading>
      <div class="loading-container">
        <van-loading type="spinner" size="20" />
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
  (e: 'longpress'): void
}>()


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

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f7f8fa;
  width: 100%;
  height: 100%;
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
