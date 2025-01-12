<template>
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
</template>

<script lang="ts" setup>
import { defineProps } from 'vue'


const { src } = defineProps<{
  src: string
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
