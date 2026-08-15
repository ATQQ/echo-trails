import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

const BP_LG = 480
const BP_XL = 1280

const width = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)

let listenerAttached = false
const attachGlobalListener = () => {
  if (listenerAttached || typeof window === 'undefined') return
  window.addEventListener('resize', () => {
    width.value = window.innerWidth
  })
  listenerAttached = true
}

export function useResponsive() {
  onMounted(() => {
    attachGlobalListener()
    width.value = window.innerWidth
  })

  onBeforeUnmount(() => {})

  const isMobile = computed(() => width.value < BP_LG)
  const isTablet = computed(() => false)
  const isDesktop = computed(() => width.value >= BP_LG)
  const isLargeDesktop = computed(() => width.value >= BP_XL)

  const columns = computed(() => {
    if (width.value >= BP_XL) return 8
    if (width.value >= 1024) return 6
    if (width.value >= 768) return 5
    if (width.value >= BP_LG) return 4
    return 4
  })

  const albumColumns = computed(() => {
    if (width.value >= BP_XL) return 6
    if (width.value >= 1024) return 5
    if (width.value >= 768) return 4
    if (width.value >= BP_LG) return 3
    return 3
  })

  return {
    width,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    columns,
    albumColumns
  }
}
