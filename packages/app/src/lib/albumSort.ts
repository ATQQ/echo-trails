export type AlbumSortType = 'time' | 'time_asc' | 'tag'

export function getAlbumSortType(): AlbumSortType {
  const stored = localStorage.getItem('all_album_sort_type') as AlbumSortType | null
  if (stored === 'time' || stored === 'time_asc' || stored === 'tag') {
    return stored
  }
  return 'tag'
}

export function sortAlbums(albums: Album[], sortType: AlbumSortType = getAlbumSortType()): Album[] {
  if (!albums?.length) return []

  const list = [...albums]

  return list.sort((a, b) => {
    if (a.count === 0 && b.count !== 0) return 1
    if (a.count !== 0 && b.count === 0) return -1
    if (a.count === 0 && b.count === 0) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    }

    if (sortType === 'tag') {
      const tagA = a.tags?.[0] || ''
      const tagB = b.tags?.[0] || ''

      if (tagA && !tagB) return -1
      if (!tagA && tagB) return 1

      const tagCompare = tagA.localeCompare(tagB, 'zh-CN')
      if (tagCompare !== 0) return tagCompare
    }

    const timeA = new Date(a.createdAt || 0).getTime()
    const timeB = new Date(b.createdAt || 0).getTime()

    if (sortType === 'time_asc') {
      return timeA - timeB
    }

    return timeB - timeA
  })
}
