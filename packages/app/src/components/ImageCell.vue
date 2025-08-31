<template>
  <div class="image-cell-wrapper">
    <van-image v-if="src" @click="emit('click')"
      @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
      @touchstart="start" @touchend="cancel" @touchmove="cancel"
      fit="cover" position="center" width="100%"
      height="100%" lazy-load :src="src">
      <slot />
      <template v-slot:loading>
        <van-loading type="spinner" size="20" />
      </template>
    </van-image>
    <van-image v-else fit="cover" position="center" width="100%" height="100%"></van-image>
    
    <!-- 重复标识的蓝色小三角 -->
    <div v-if="isRepeat" class="repeat-indicator"></div>
  </div>
</template>

<script lang="ts" setup>
const { src } = defineProps<{
  src: string
  isRepeat?: boolean
}>()

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
</style>
