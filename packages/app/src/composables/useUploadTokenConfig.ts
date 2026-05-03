import { useLocalStorage } from '@vueuse/core';

export const isNativeUploadTokenEnabled = useLocalStorage('isNativeUploadTokenEnabled', false);
