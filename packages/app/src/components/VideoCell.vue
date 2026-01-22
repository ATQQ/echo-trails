<template>
  <div class="video-cell-wrapper" @click="emit('click')" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel">
    <!-- 如果有封面则显示封面，否则显示默认背景 -->
    <van-image v-if="cover" fit="cover" position="center" width="100%" height="100%" :lazy-load="!isBase64"
      :src="cover">
      <slot />
      <template v-slot:loading>
        <van-loading type="spinner" size="20" />
      </template>
    </van-image>
    <div v-else class="video-placeholder">
      <van-icon name="video-o" size="32" color="#999" />
    </div>

    <!-- 播放图标遮罩 -->
    <div class="play-mask">
      <van-icon name="play-circle-o" size="24" color="#fff" />
    </div>

    <!-- 重复标识 -->
    <div v-if="isRepeat" class="repeat-indicator"></div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  src: string
  cover?: string
  isRepeat?: boolean
}>()

const isBase64 = computed(() => props.cover?.startsWith('data:'))

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
.video-cell-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #f7f8fa;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #eee;
}

.play-mask {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  pointer-events: none;
  /* 让点击穿透 */
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
</style>
