import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/lib/request';
import { useFamilyStore } from './family';
import { useFamily } from '@/composables/useFamily';

export interface BloodPressureRecord {
  id: string;
  sbp: number; // 收缩压 (High)
  dbp: number; // 舒张压 (Low)
  heartRate: number; // 脉搏
  bloodOxygen?: number; // 血氧饱和度
  timestamp: number;
  note?: string;
}

export const useBloodPressureStore = defineStore('blood-pressure', () => {
  const records = ref<BloodPressureRecord[]>([]);
  const { refreshFamilies } = useFamily()
  const familyStore = useFamilyStore();

  const fetchRecords = async (startTime?: number, endTime?: number, familyId?: string) => {
    try {
      const fid = familyId || familyStore.currentFamily.familyId || 'default';
      const searchParams: any = { familyId: fid };
      if (startTime && endTime) {
        searchParams.startTime = startTime;
        searchParams.endTime = endTime;
      }
      const res: any = await api.get('blood-pressure/list', {
        searchParams
      }).json();

      if (res.code === 0) {
        records.value = res.data.map((item: any) => ({
          id: item._id,
          sbp: item.sbp,
          dbp: item.dbp,
          heartRate: item.heartRate,
          bloodOxygen: item.bloodOxygen,
          timestamp: new Date(item.date).getTime(),
          note: item.note
        }));
      }
    } catch (e) {
      console.error('Failed to fetch blood pressure records', e);
    }
  };

  const addRecord = async (record: Omit<BloodPressureRecord, 'id'>, familyId?: string) => {
    try {
      const fid = familyId || familyStore.currentFamily.familyId || 'default';
      const res: any = await api.post('blood-pressure/add', {
        json: {
          ...record,
          date: new Date(record.timestamp),
          familyId: fid
        }
      }).json();

      if (res.code === 0) {
        // We should fetch records for the same familyId we just added to
        await fetchRecords(undefined, undefined, fid);
        if (records.value.length === 1) {
          await refreshFamilies();
        }
      }
    } catch (e) {
      console.error('Failed to add record', e);
      throw e;
    }
  };

  const removeRecord = async (id: string, familyId?: string) => {
    try {
      const res: any = await api.post('blood-pressure/delete', {
        json: { id }
      }).json();

      if (res.code === 0) {
        await fetchRecords(undefined, undefined, familyId);
      }
    } catch (e) {
      console.error('Failed to remove record', e);
      throw e;
    }
  };

  const updateRecord = async (record: Partial<BloodPressureRecord> & { id: string }, familyId?: string) => {
    try {
      const res: any = await api.post('blood-pressure/update', {
        json: {
          ...record,
          date: record.timestamp ? new Date(record.timestamp) : undefined
        }
      }).json();

      if (res.code === 0) {
        await fetchRecords(undefined, undefined, familyId);
      }
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
