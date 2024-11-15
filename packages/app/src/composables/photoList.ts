import { inject, provide } from "vue"
import type { InjectionKey, Reactive } from "vue"

export interface PhotoListViewStore {
  deletePhoto?: (id: string) => void
  photoList?: Reactive<Photo[]>
}

export const photoListKey: InjectionKey<PhotoListViewStore> = Symbol('photoList')

export function providePhotoListStore(store: PhotoListViewStore) {
  provide(photoListKey, store)
}

export function usePhotoListStore() {
  const store = inject(photoListKey)
  return store
}
