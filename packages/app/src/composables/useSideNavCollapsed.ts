import { ref, watch } from 'vue'

const STORAGE_KEY = 'side-nav-collapsed'

const readInitial = (): boolean => {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === null) return true
  return stored === '1' || stored === 'true'
}

const collapsed = ref<boolean>(readInitial())

if (typeof window !== 'undefined') {
  watch(collapsed, (value) => {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  })
}

export function useSideNavCollapsed() {
  const toggle = () => {
    collapsed.value = !collapsed.value
  }
  const setCollapsed = (value: boolean) => {
    collapsed.value = value
  }
  return { collapsed, toggle, setCollapsed }
}
