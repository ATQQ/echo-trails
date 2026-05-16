import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useFamilyStore } from './family';
import { useFamily } from '@/composables/useFamily';
import { getLocalCache, setLocalCache } from '@/lib/storage';
import { fetchBpRecords, addBpRecord, updateBpRecord, deleteBpRecord, type BloodPressureRecord } from '@/service/bloodPressure';

export type { BloodPressureRecord };

export const useBloodPressureStore = defineStore('blood-pressure', () => {
  const records = ref<BloodPressureRecord[]>([]);

  const { refreshFamilies } = useFamily()
  const familyStore = useFamilyStore();

  const fetchRecords = async (startTime?: number, endTime?: number, familyId?: string) => {
    try {
      const fid = familyId || familyStore.currentFamily.familyId || 'default';
      const cacheKey = `bp_records_${fid}_${startTime || 0}_${endTime || 0}`;

      // Optimistic update from cache
      const cached = await getLocalCache(cacheKey);
      if (cached) {
        try {
          records.value = JSON.parse(cached);
        } catch (e) {
          records.value = [];
        }
      } else {
        records.value = [];
      }

      const newData = await fetchBpRecords(fid, startTime, endTime);
      records.value = newData;
      await setLocalCache(cacheKey, JSON.stringify(newData));
    } catch (e) {
      console.error('Failed to fetch blood pressure records', e);
    }
  };

  const addRecord = async (record: Omit<BloodPressureRecord, 'id'>, familyId?: string) => {
    try {
      const fid = familyId || familyStore.currentFamily.familyId || 'default';
      await addBpRecord(record, fid);
      await fetchRecords(undefined, undefined, fid);
      if (records.value.length === 1) {
        await refreshFamilies();
      }
    } catch (e) {
      console.error('Failed to add record', e);
      throw e;
    }
  };

  const removeRecord = async (id: string, familyId?: string) => {
    try {
      await deleteBpRecord(id);
      await fetchRecords(undefined, undefined, familyId);
    } catch (e) {
      console.error('Failed to remove record', e);
      throw e;
    }
  };

  const updateRecord = async (record: Partial<BloodPressureRecord> & { id: string }, familyId?: string) => {
    try {
      await updateBpRecord(record);
      await fetchRecords(undefined, undefined, familyId);
    } catch (e) {
      console.error('Failed to update record', e);
      throw e;
    }
  };

  return {
    records,
    fetchRecords,
    addRecord,
    removeRecord,
    updateRecord,
  };
});
