import { inject, provide } from "vue"
import type { InjectionKey } from "vue"

export interface AlbumPhotoViewStore {
  refreshAlbum: () => void
}

export const albumPhotoKey: InjectionKey<AlbumPhotoViewStore> = Symbol('albumPhoto')

export function provideAlbumPhotoStore(store: AlbumPhotoViewStore) {
  provide(albumPhotoKey, store)
}

export function useAlbumPhotoStore() {
  const store = inject(albumPhotoKey)
  return store
}
