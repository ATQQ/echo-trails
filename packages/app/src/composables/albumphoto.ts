import { inject, provide } from "vue"
import type { InjectionKey } from "vue"
import { useRoute } from "vue-router"

export interface AlbumPhotoViewStore {
  refreshAlbum: () => void
}

export const albumPhotoKey: InjectionKey<AlbumPhotoViewStore> = Symbol('albumPhoto')

export function provideAlbumPhotoStore(store: AlbumPhotoViewStore) {
  provide(albumPhotoKey, store)
}

export function useAlbumPhotoStore() {
  const route = useRoute()
  if (route.name?.toString().includes('album')) {
    return inject(albumPhotoKey)
  }
}
