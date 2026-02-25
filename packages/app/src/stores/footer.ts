import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface FooterItem {
  icon: string
  text: string
  path: string
  activeIcon?: string
  activeColor?: string
  replace?: boolean
  to?: string // Some items might use 'to' directly if no special handling needed, but we standardize on path
}

export const useFooterStore = defineStore('footer', () => {
  const defaultItems: FooterItem[] = [
    {
      icon: 'home-o',
      text: '全部',
      path: '/home',
      activeIcon: 'wap-home',
      activeColor: '#2196f3',
      replace: false
    },
    {
      icon: 'photo-o',
      text: '相册',
      path: '/',
      activeIcon: 'photo',
      activeColor: '#2196f3',
      replace: true
    },
    {
      icon: 'apps-o',
      text: '发现',
      path: '/discovery',
      activeIcon: 'apps-o',
      activeColor: '#2196f3',
      replace: true
    }
  ]

  const items = ref<FooterItem[]>([])

  // Initialize from localStorage
  const init = () => {
    const saved = localStorage.getItem('footer_menus')
    if (saved) {
      try {
        items.value = JSON.parse(saved)
      } catch (e) {
        items.value = [...defaultItems]
      }
    } else {
      items.value = [...defaultItems]
    }
  }

  init()

  const save = () => {
    localStorage.setItem('footer_menus', JSON.stringify(items.value))
  }

  const addItem = (item: FooterItem) => {
    if (items.value.length >= 5) {
      return false
    }
    if (items.value.some(i => i.path === item.path)) {
      return false
    }

    // Insert before the last item (Discovery) if it exists, otherwise append
    const discoveryIndex = items.value.findIndex(i => i.path === '/discovery')
    if (discoveryIndex > -1) {
      items.value.splice(discoveryIndex, 0, item)
    } else {
      items.value.push(item)
    }
    save()
    return true
  }

  const removeItem = (path: string) => {
    // Prevent removing default items if necessary, but user requirement implies only "Discovery" adds/removes "others".
    // "Fixed: All, Album, Discovery". So we should probably prevent removing those.
    if (['/home', '/', '/discovery'].includes(path)) {
      return false
    }
    
    const index = items.value.findIndex(i => i.path === path)
    if (index > -1) {
      items.value.splice(index, 1)
      save()
      return true
    }
    return false
  }

  const isAdded = (path: string) => {
    return items.value.some(i => i.path === path)
  }

  return {
    items,
    addItem,
    removeItem,
    isAdded
  }
})
