<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

const props = withDefaults(defineProps<{
  title: string;
  message: string;
  time?: string;
  icon?: string;
  duration?: number; // 0 for persistent
  show: boolean;
}>(), {
  time: '现在',
  duration: 5000,
  show: false
});

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'click'): void;
}>();

let timer: any = null;

const startTimer = () => {
  if (timer) clearTimeout(timer);
  if (props.duration > 0) {
    timer = setTimeout(() => {
      emit('update:show', false);
    }, props.duration);
  }
};

const stopTimer = () => {
  if (timer) clearTimeout(timer);
};

watch(() => props.show, (val) => {
  if (val) {
    startTimer();
  } else {
    stopTimer();
  }
});

onMounted(() => {
  if (props.show) startTimer();
});

onUnmounted(() => {
  stopTimer();
});

const handleClick = () => {
  emit('click');
  // emit('update:show', false); // Optional: close on click? Let parent decide or user
};
</script>

<template>
  <Transition name="slide-down">
    <div v-if="show" class="notification-banner-container">
      <div class="notification-banner" @click="handleClick">
        <div class="header">
          <div class="header-left">
            <div class="icon-wrapper">
              <slot name="icon">
                <img v-if="icon" :src="icon" alt="icon" />
                <div v-else class="default-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="5" fill="#007AFF"/>
                    <path d="M12 7V17M12 17L8 13M12 17L16 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </slot>
            </div>
            <span class="title">{{ title }}</span>
          </div>
          <span class="time">{{ time }}</span>
        </div>
        <div class="content">
          {{ message }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.notification-banner-container {
  position: fixed;
  top: calc(var(--safe-area-top) + 12px);
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  pointer-events: none; // Allow clicks to pass through empty areas
  padding: 0 12px;
}

.notification-banner {
  pointer-events: auto;
  width: 100%;
  max-width: 380px; // Limit width on large screens
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 22px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;

      .icon-wrapper {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 4px;
        }

        .default-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;

          svg {
            display: block;
          }
        }
      }

      .title {
        font-size: 13px;
        font-weight: 600;
        color: #1d1d1f;
        opacity: 0.9;
      }
    }

    .time {
      font-size: 12px;
      color: #86868b;
    }
  }

  .content {
    font-size: 15px;
    color: #1d1d1f;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: 400;
  }

  &:active {
    transform: scale(0.96);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    background: rgba(255, 255, 255, 0.9);
  }
}

// Transitions
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-30px) scale(0.9);
}
</style>
