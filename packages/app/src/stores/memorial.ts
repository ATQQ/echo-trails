import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getMemorials, createMemorial, updateMemorial as apiUpdateMemorial, deleteMemorial as apiDeleteMemorial, getMemorialCovers } from '@/service';

export interface MemorialDay {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  description?: string;
  displayTitle?: string;
  type: 'cumulative' | 'countdown';
  isLunar: boolean;
  isPinned: boolean;
  coverImage?: string;
  createdAt: number;
}

export const useMemorialStore = defineStore('memorial', () => {
  const memorials = ref<MemorialDay[]>([]);
  const presetCovers = ref<string[]>([]);

  const init = async () => {
    try {
        const [data, covers] = await Promise.all([getMemorials(), getMemorialCovers()]);
        memorials.value = data;
        presetCovers.value = covers;
    } catch (e) {
        console.error('Failed to fetch memorials', e);
    }
  };

  const addMemorial = async (memorial: Omit<MemorialDay, 'id' | 'createdAt'>) => {
    const newMemorial = await createMemorial(memorial);
    await init(); // Refresh list to get processed fields
    return newMemorial;
  };

  const updateMemorial = async (id: string, updates: Partial<MemorialDay>) => {
    await apiUpdateMemorial(id, updates);
    await init();
  };

  const deleteMemorial = async (id: string) => {
    await apiDeleteMemorial(id);
    await init();
  };

  const pinnedMemorials = computed(() => memorials.value.filter(m => m.isPinned));
  const otherMemorials = computed(() => memorials.value.filter(m => !m.isPinned));

  return {
    memorials,
    presetCovers,
    pinnedMemorials,
    otherMemorials,
    init,
    addMemorial,
    updateMemorial,
    deleteMemorial
  };
});
