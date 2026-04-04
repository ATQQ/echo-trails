<template>
  <van-image @click="emit('click')" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel" fit="cover" position="center" width="100%" height="100%"
    lazy-load :src="cachedSrc" class="image-cell-wrapper image-fade-in">
    <slot />
    <template v-slot:loading>
      <div class="loading-container">
        <van-loading type="spinner" size="20" />
      </div>
    </template>
    <!-- 重复标识的蓝色小三角 -->
    <div v-if="isRepeat" class="repeat-indicator"></div>
  </van-image>
</template>

<script lang="ts" setup>
import { useCachedImage } from '@/composables/useCachedImage';
import { toRef } from 'vue';

const props = defineProps<{
  src: string
  isRepeat?: boolean
  cacheKey?: string
}>()

const cachedSrc = useCachedImage(toRef(props, 'src'), toRef(props, 'cacheKey'))

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

.image-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
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
</style>
