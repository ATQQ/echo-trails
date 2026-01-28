import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getFamilyList, type FamilyMember } from '@/service/family';

export const useFamilyStore = defineStore('family', () => {
  const familyList = ref<FamilyMember[]>([]);
  const currentFamily = ref<FamilyMember>({ familyId: 'default', name: '默认' });

  const fetchFamilyList = async () => {
    try {
      const res = await getFamilyList();
      if (res.code === 0) {
        familyList.value = res.data;
        
        // Restore selection from local storage if exists
        const saved = localStorage.getItem('currentPerson');
        if (saved) {
            const found = familyList.value.find(f => f.familyId === saved);
            if (found) {
                currentFamily.value = found;
            } else if (saved === 'default') {
                currentFamily.value = { familyId: 'default', name: '默认' };
            }
        }
      }
    } catch (e) {
      console.error('Failed to fetch family list', e);
    }
  };
  
  const setCurrentFamily = (family: FamilyMember) => {
      currentFamily.value = family;
      localStorage.setItem('currentPerson', family.familyId);
  }

  return {
    familyList,
    currentFamily,
    fetchFamilyList,
    setCurrentFamily
  };
});
