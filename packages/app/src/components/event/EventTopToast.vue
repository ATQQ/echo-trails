<template>
  <Teleport to="body">
    <Transition name="ev-toast">
      <div v-if="show" class="ev-scope toast-layer">
        <div
          class="toast"
          :class="{ 'toast--error': type === 'error' }"
          role="status"
          aria-live="polite"
        >
          <span class="toast__text">{{ message }}</span>
          <button v-if="actionText" type="button" class="toast__action" @click="emit('action')">
            {{ actionText }}
          </button>
          <span
            v-if="duration > 0"
            :key="nonce"
            class="toast__bar is-running"
            :style="{ animationDuration: `${duration}ms` }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';

const props = withDefaults(defineProps<{
  show: boolean;
  message: string;
  type?: 'info' | 'error' | 'success';
  actionText?: string;
  /** 自动关闭时长（ms），0 表示不自动关闭 */
  duration?: number;
  /** 变化时重播倒计时进度条 */
  nonce?: number;
}>(), {
  type: 'info',
  actionText: '',
  duration: 0,
  nonce: 0,
});

const emit = defineEmits<{ action: []; close: [] }>();

let timer: ReturnType<typeof setTimeout> | null = null;

const stopTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

watch(
  () => [props.show, props.nonce, props.duration] as const,
  () => {
    stopTimer();
    if (props.show && props.duration > 0) {
      timer = setTimeout(() => emit('close'), props.duration);
    }
  },
  { immediate: true },
);

onBeforeUnmount(stopTimer);
</script>

<style lang="scss">
.ev-toast-enter-active,
.ev-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ev-toast-enter-from,
.ev-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .ev-toast-enter-active,
  .ev-toast-leave-active {
    transition: opacity 0.15s ease;
  }

  .ev-toast-enter-from,
  .ev-toast-leave-to {
    transform: none;
  }

  .toast-layer .toast__bar {
    display: none;
  }
}
</style>
