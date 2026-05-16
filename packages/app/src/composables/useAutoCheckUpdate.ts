import { useLocalStorage } from '@vueuse/core';

export const isAutoCheckUpdateEnabled = useLocalStorage('isAutoCheckUpdateEnabled', true);
