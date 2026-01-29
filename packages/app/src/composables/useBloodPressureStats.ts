import { computed, type Ref } from 'vue';
import type { BloodPressureRecord } from '@/stores/bloodPressure';

export function useBloodPressureStats(filteredRecords: Ref<BloodPressureRecord[]>) {
  const avgSbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const sum = filteredRecords.value.reduce((acc, r) => acc + r.sbp, 0);
    return Math.round(sum / filteredRecords.value.length);
  });

  const avgDbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const sum = filteredRecords.value.reduce((acc, r) => acc + r.dbp, 0);
    return Math.round(sum / filteredRecords.value.length);
  });

  const avgHr = computed(() => {
    if (!filteredRecords.value.length) return 0;
    // 过滤掉为0 的数据
    const validRecords = filteredRecords.value.filter(r => r.heartRate !== 0);
    if (!validRecords.length) return 0;

    const sum = validRecords.reduce((acc, r) => acc + r.heartRate, 0);
    return Math.round(sum / validRecords.length);
  });

  const maxSbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    return Math.max(...filteredRecords.value.map(r => r.sbp));
  });

  const maxDbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    return Math.max(...filteredRecords.value.map(r => r.dbp));
  });

  const minSbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    return Math.min(...filteredRecords.value.map(r => r.sbp));
  });

  const minDbp = computed(() => {
    if (!filteredRecords.value.length) return 0;
    return Math.min(...filteredRecords.value.map(r => r.dbp));
  });

  const minHr = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const validRecords = filteredRecords.value.filter(r => r.heartRate && r.heartRate !== 0);
    if (!validRecords.length) return 0;
    return Math.min(...validRecords.map(r => r.heartRate));
  });

  const maxHr = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const validRecords = filteredRecords.value.filter(r => r.heartRate && r.heartRate !== 0);
    if (!validRecords.length) return 0;
    return Math.max(...validRecords.map(r => r.heartRate));
  });

  const avgBloodOxygen = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const validRecords = filteredRecords.value.filter(r => r.bloodOxygen && r.bloodOxygen !== 0);
    if (!validRecords.length) return 0;

    const sum = validRecords.reduce((acc, r) => acc + (r.bloodOxygen || 0), 0);
    return Math.round(sum / validRecords.length);
  });

  const minBloodOxygen = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const validRecords = filteredRecords.value.filter(r => r.bloodOxygen && r.bloodOxygen !== 0);
    if (!validRecords.length) return 0;
    return Math.min(...validRecords.map(r => r.bloodOxygen || 0));
  });

  const maxBloodOxygen = computed(() => {
    if (!filteredRecords.value.length) return 0;
    const validRecords = filteredRecords.value.filter(r => r.bloodOxygen && r.bloodOxygen !== 0);
    if (!validRecords.length) return 0;
    return Math.max(...validRecords.map(r => r.bloodOxygen || 0));
  });

  return {
    avgSbp,
    avgDbp,
    avgHr,
    maxSbp,
    maxDbp,
    minSbp,
    minDbp,
    minHr,
    maxHr,
    avgBloodOxygen,
    minBloodOxygen,
    maxBloodOxygen
  };
}
