<template>
  <div
    v-if="albumHomeMemorials.length"
    class="memorial-title-text"
    @click="handleClick"
  >
    <div class="flip-viewport">
      <Transition :name="transitionName">
        <div :key="currentItem.id" class="flip-item">
          <span class="memorial-line">
            {{ currentItem.displayTitle || currentItem.name }}{{ getLabel(currentItem) }}<span class="memorial-number">{{ getDays(currentItem) }}</span>天
          </span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useMemorialStore } from '@/stores/memorial';
import { useMemorialCalc } from '@/composables/useMemorialCalc';

const ROTATE_INTERVAL = 4000;

const router = useRouter();
const store = useMemorialStore();
const { albumHomeMemorials } = storeToRefs(store);
const { getDays, getLabel } = useMemorialCalc();

const currentIndex = ref(0);
const transitionName = ref('flip-up');
let rotateTimer: ReturnType<typeof setInterval> | null = null;

const currentItem = computed(() => {
  const list = albumHomeMemorials.value;
  if (!list.length) return list[0];
  return list[currentIndex.value % list.length];
});

const clearRotateTimer = () => {
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
};

const startRotateTimer = () => {
  clearRotateTimer();
  if (albumHomeMemorials.value.length <= 1) return;

  rotateTimer = setInterval(() => {
    transitionName.value = 'flip-up';
    currentIndex.value = (currentIndex.value + 1) % albumHomeMemorials.value.length;
  }, ROTATE_INTERVAL);
};

watch(
  albumHomeMemorials,
  (list) => {
    if (!list.length) {
      currentIndex.value = 0;
      clearRotateTimer();
      return;
    }
    if (currentIndex.value >= list.length) {
      currentIndex.value = 0;
    }
    startRotateTimer();
  },
  { immediate: true },
);

onMounted(() => {
  startRotateTimer();
});

onUnmounted(() => {
  clearRotateTimer();
});

const handleClick = () => {
  router.push('/memorial');
};
</script>

<style scoped lang="scss">
.memorial-title-text {
  width: 100%;
  cursor: pointer;
  user-select: none;
}

.flip-viewport {
  position: relative;
  height: 24px;
  overflow: hidden;
}

.flip-item {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.memorial-line {
  display: inline-block;
  max-width: 100%;
  font-size: 13px;
  font-weight: 400;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.memorial-number {
  font-size: 16px;
  font-weight: 600;
  padding: 0 6px;
}

.flip-up-enter-active,
.flip-up-leave-active {
  transition: transform 0.45s ease, opacity 0.45s ease;
}

.flip-up-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.flip-up-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
