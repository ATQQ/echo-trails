<template>
  <div class="audio-cell-wrapper" @click="emit('click')" @mousedown="start" @mouseup="cancel" @mouseleave="cancel"
    @touchstart="start" @touchend="cancel" @touchmove="cancel">
    <div class="audio-placeholder">
      <van-icon name="music-o" size="32" color="#fff" />
    </div>

    <div class="audio-info">
      <div class="audio-name">{{ displayName }}</div>
    </div>

    <div class="play-mask">
      <van-icon name="play-circle-o" size="28" color="#fff" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  src: string
  name?: string
}>()

const displayName = computed(() => {
  if (props.name) return props.name
  if (!props.src) return ''
  try {
    const decoded = decodeURIComponent(props.src)
    const parts = decoded.split(/[\\/]/)
    return parts[parts.length - 1] || ''
  } catch (_) {
    return ''
  }
})

const emit = defineEmits<{
  (e: 'click'): void,
  (e: 'longpress'): void
}>()


let pressTimer: any = null;

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
.audio-cell-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, #6a89cc 0%, #4a69bd 100%);
  color: #fff;
}

.audio-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, calc(-50% - 8px));
  opacity: 0.85;
}

.audio-info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
  color: #fff;
  font-size: 11px;
  line-height: 1.3;
  z-index: 2;
}

.audio-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.play-mask {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  pointer-events: none;
  opacity: 0.85;
}
</style>
