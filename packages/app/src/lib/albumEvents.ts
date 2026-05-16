export const ALBUMS_CHANGED_EVENT = 'albums-changed'

export interface AlbumsChangedDetail {
  source?: string
}

export const notifyAlbumsChanged = (source?: string) => {
  window.dispatchEvent(new CustomEvent<AlbumsChangedDetail>(ALBUMS_CHANGED_EVENT, {
    detail: { source }
  }))
}

export const onAlbumsChanged = (handler: (detail: AlbumsChangedDetail) => void) => {
  const listener = (event: Event) => {
    handler((event as CustomEvent<AlbumsChangedDetail>).detail || {})
  }

  window.addEventListener(ALBUMS_CHANGED_EVENT, listener)

  return () => {
    window.removeEventListener(ALBUMS_CHANGED_EVENT, listener)
  }
}
