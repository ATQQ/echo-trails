import { ref, onMounted } from 'vue';
import { getAssetStats } from '@/service/asset';

export function useAssetStats(refreshTrigger?: any) {
  const totalValue = ref(0);
  const dailyCost = ref(0);
  const loading = ref(false);

  const fetchStats = async () => {
    loading.value = true;
    try {
      const data = await getAssetStats();
      totalValue.value = data.totalValue;
      dailyCost.value = data.dailyCost;
    } catch (e) {
      console.error('Failed to fetch asset stats', e);
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    fetchStats();
  });

  return {
    totalValue,
    dailyCost,
    loading,
    refreshStats: fetchStats
  };
}
