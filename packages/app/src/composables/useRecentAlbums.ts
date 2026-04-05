import { ref } from 'vue'

const RECENT_ALBUMS_KEY = 'recent_albums'

export function useRecentAlbums() {
  const recentAlbums = ref<string[]>(
    JSON.parse(localStorage.getItem(RECENT_ALBUMS_KEY) || '[]')
  )

  const addRecent = (albumId: string) => {
    let list = [...recentAlbums.value]
    // Remove if already exists
    list = list.filter(id => id !== albumId)
    // Add to front
    list.unshift(albumId)
    // Keep max 50
    if (list.length > 50) {
      list = list.slice(0, 50)
    }
    recentAlbums.value = list
    localStorage.setItem(RECENT_ALBUMS_KEY, JSON.stringify(list))
  }

  const getRecentIndex = (albumId: string) => {
    const idx = recentAlbums.value.indexOf(albumId)
    return idx === -1 ? Infinity : idx
  }

  return {
    recentAlbums,
    addRecent,
    getRecentIndex
  }
}
