<template>
  <div
    ref="containerRef"
    class="auto-scroll-text"
    :class="[`mode-${scrollMode}`, { measuring: isMeasuring }]"
    :style="containerStyle"
  >
    <span ref="textRef" class="auto-scroll-text-inner">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  maxLines?: number
  maxHeight?: number
}>(), {
  maxLines: 2,
  maxHeight: 40,
})

const containerRef = ref<HTMLElement | null>(null)
const textRef = ref<HTMLElement | null>(null)
const scrollMode = ref<'static' | 'horizontal' | 'vertical'>('static')
const scrollDistance = ref(0)
const isMeasuring = ref(false)

const containerStyle = computed(() => {
  if (scrollMode.value === 'vertical' && scrollDistance.value > 0) {
    return {
      '--scroll-distance': `-${scrollDistance.value}px`,
      '--scroll-duration': `${Math.max(4, scrollDistance.value / 18)}s`,
    }
  }
  if (scrollMode.value === 'horizontal' && scrollDistance.value > 0) {
    return {
      '--scroll-distance': `-${scrollDistance.value}px`,
      '--scroll-duration': `${Math.max(5, scrollDistance.value / 24)}s`,
    }
  }
  return {}
})

const measure = async () => {
  await nextTick()
  const container = containerRef.value
  const textEl = textRef.value
  if (!container || !textEl || !props.text.trim()) {
    scrollMode.value = 'static'
    scrollDistance.value = 0
    return
  }

  scrollMode.value = 'static'
  scrollDistance.value = 0
  isMeasuring.value = true
  await nextTick()

  const lineHeight = Number.parseFloat(getComputedStyle(textEl).lineHeight) || 18
  const maxHeight = props.maxHeight || lineHeight * props.maxLines
  const fullHeight = textEl.scrollHeight
  isMeasuring.value = false

  const overflowHeight = fullHeight - maxHeight

  if (overflowHeight > 2) {
    scrollMode.value = 'vertical'
    scrollDistance.value = overflowHeight
    return
  }

  await nextTick()
  if (textEl.scrollWidth > container.clientWidth + 1) {
    scrollMode.value = 'horizontal'
    scrollDistance.value = textEl.scrollWidth - container.clientWidth
  }
}

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measure()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

watch(() => props.text, measure)
</script>

<style scoped lang="scss">
.auto-scroll-text {
  overflow: hidden;
  max-height: 40px;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1.45;
  text-align: right;
}

.auto-scroll-text-inner {
  display: inline-block;
  max-width: 100%;
  word-break: break-word;
}

.mode-static .auto-scroll-text-inner {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.measuring .auto-scroll-text-inner {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.mode-horizontal .auto-scroll-text-inner {
  white-space: nowrap;
  animation: horizontal-scroll var(--scroll-duration, 6s) linear infinite;
}

.mode-vertical .auto-scroll-text-inner {
  animation: vertical-scroll var(--scroll-duration, 6s) ease-in-out infinite;
}

@keyframes horizontal-scroll {
  0%, 18% {
    transform: translateX(0);
  }
  45%, 63% {
    transform: translateX(var(--scroll-distance, 0));
  }
  100% {
    transform: translateX(0);
  }
}

@keyframes vertical-scroll {
  0%, 16% {
    transform: translateY(0);
  }
  48%, 64% {
    transform: translateY(var(--scroll-distance, 0));
  }
  100% {
    transform: translateY(0);
  }
}
</style>
