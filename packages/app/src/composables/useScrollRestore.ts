import { onActivated, onDeactivated, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useScrollRestore(containerRef: any) {
  const scrollTop = ref(0)
  let el: HTMLElement | null = null
  let isActive = false

  const handleScroll = (e: Event) => {
    if (!isActive) return
    scrollTop.value = (e.target as HTMLElement).scrollTop
  }

  const restore = async () => {
    await nextTick()
    if (el) {
      el.scrollTop = scrollTop.value
      // Fallback: requestAnimationFrame to ensure it applies after render
      requestAnimationFrame(() => {
        if (el) el.scrollTop = scrollTop.value
      })
    }
  }

  const bind = () => {
    isActive = true
    if (containerRef.value) {
      el = containerRef.value.$el || containerRef.value
      if (el) {
        el.addEventListener('scroll', handleScroll, { passive: true })
      }
    }
  }

  const unbind = () => {
    isActive = false
    if (el) {
      el.removeEventListener('scroll', handleScroll)
    }
  }

  onMounted(() => {
    bind()
  })

  onActivated(() => {
    bind()
    restore()
  })

  onDeactivated(() => {
    unbind()
  })

  onUnmounted(() => {
    unbind()
  })

  onBeforeRouteLeave(() => {
    // no-op
  })

  return {
    scrollTop
  }
}
