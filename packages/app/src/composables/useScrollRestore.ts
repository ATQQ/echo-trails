import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useScrollRestore(containerRef: any) {
  const scrollTop = ref(0)
  let el: HTMLElement | null = null

  const handleScroll = (e: Event) => {
    scrollTop.value = (e.target as HTMLElement).scrollTop
  }

  const restore = () => {
    if (el) {
      el.scrollTop = scrollTop.value
    }
  }

  const bind = () => {
    if (containerRef.value) {
      el = containerRef.value.$el || containerRef.value
      if (el) {
        el.addEventListener('scroll', handleScroll, { passive: true })
      }
    }
  }

  const unbind = () => {
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
    if (el) {
      scrollTop.value = el.scrollTop
    }
    unbind()
  })

  onUnmounted(() => {
    unbind()
  })

  onBeforeRouteLeave(() => {
    if (el) {
      scrollTop.value = el.scrollTop
    }
  })

  return {
    scrollTop
  }
}
