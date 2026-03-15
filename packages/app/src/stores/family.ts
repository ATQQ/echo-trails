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

        // 1. Try to keep current selection
        const currentInNewList = familyList.value.find(f => f.familyId === currentFamily.value.familyId);

        if (currentInNewList) {
          currentFamily.value = currentInNewList;
        } else {
          // 2. Fallback to localStorage
          const saved = localStorage.getItem('currentPerson');
          if (saved) {
            const foundSaved = familyList.value.find(f => f.familyId === saved);
            if (foundSaved) {
              currentFamily.value = foundSaved;
            } else {
              currentFamily.value = { familyId: 'default', name: '默认' };
            }
          } else {
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
