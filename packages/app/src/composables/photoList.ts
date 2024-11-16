import { inject, provide } from "vue"
import type { ComputedRef, InjectionKey, Reactive } from "vue"

export interface PhotoListViewStore {
  deletePhoto?: (id: string) => void
  photoList?: Reactive<Photo[]>
  isEmpty?: ComputedRef<boolean>
}

export const photoListKey: InjectionKey<PhotoListViewStore> = Symbol('photoList')

export function providePhotoListStore(store: PhotoListViewStore) {
  provide(photoListKey, store)
}

export function usePhotoListStore() {
  const store = inject(photoListKey)
  return store
}
