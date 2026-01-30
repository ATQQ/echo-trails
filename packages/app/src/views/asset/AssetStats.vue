<template>
  <div class="asset-stats">
    <van-nav-bar title="资产统计" left-arrow @click-left="onClickLeft" fixed placeholder />

    <div class="content">
      <!-- 概览卡片 -->
      <div class="overview-card">
        <div class="total-value">
          <div class="label">总资产估值</div>
          <div class="value">{{ formatCurrency(totalValue) }}</div>
        </div>
        <div class="daily-cost">
          <div class="label">日均持有成本</div>
          <div class="value">{{ formatCurrency(dailyCost) }}</div>
        </div>
      </div>

      <!-- 分类统计 -->
      <div class="chart-section">
        <div class="section-title">分类占比</div>
        <div class="chart-container">
           <!-- 这里未来可以放 ECharts 饼图 -->
           <div class="category-list">
              <div v-for="cat in categoryStats" :key="cat.name" class="stat-item">
                  <div class="stat-info">
                      <div class="stat-name">{{ cat.name }}</div>
                      <van-progress :percentage="cat.percentage" :stroke-width="6" :show-pivot="false" color="#1989fa" track-color="#f2f3f5" />
                  </div>
                  <div class="stat-value">{{ formatCurrency(cat.value) }}</div>
              </div>
           </div>
        </div>
      </div>

      <!-- 状态统计 -->
      <div class="chart-section">
        <div class="section-title">资产状态</div>
        <div class="status-grid">
           <div v-for="stat in statusStats" :key="stat.name" class="status-card" :class="stat.statusKey">
               <div class="status-icon">
                   <van-icon :name="getStatusIcon(stat.statusKey)" />
               </div>
               <div class="status-info">
                   <div class="name">{{ stat.name }}</div>
                   <div class="count">{{ stat.count }}件</div>
                   <div class="value">{{ formatCurrency(stat.value) }}</div>
               </div>
           </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';
import { formatCurrency } from '@/lib/format';
import { useAssetStats } from '@/hooks/useAssetStats';

const router = useRouter();
const store = useAssetStore();
const { totalValue, dailyCost, refreshStats } = useAssetStats();

onMounted(() => {
    store.loadData().then(() => {
        refreshStats();
    });
});

const onClickLeft = () => {
  router.push('/discovery');
};

const categoryStats = computed(() => {
  const stats: Record<string, number> = {};
  let total = 0;

  store.assets.forEach(asset => {
    // Correctly resolve category name using ID
    const catName = store.categories.find(c => c.id === asset.categoryId)?.name || '未分类';
    stats[catName] = (stats[catName] || 0) + asset.price;
    total += asset.price;
  });

  return Object.entries(stats)
    .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);
});

const statusStats = computed(() => {
  const stats: Record<string, { value: number, count: number, key: string }> = {};

  store.assets.forEach(asset => {
    const statusObj = store.statuses.find(s => s.value === asset.status);
    const statusName = statusObj?.name || asset.status;
    const statusKey = asset.status;

    if (!stats[statusName]) {
        stats[statusName] = { value: 0, count: 0, key: statusKey };
    }
    stats[statusName].value += asset.price;
    stats[statusName].count += 1;
  });

  return Object.entries(stats).map(([name, data]) => ({
      name,
      value: data.value,
      count: data.count,
      statusKey: data.key
  }));
});

const getStatusIcon = (status: string) => {
    switch(status) {
        case 'active': return 'play-circle-o';
        case 'retired': return 'stop-circle-o';
        case 'sold': return 'gold-coin-o';
        case 'lost': return 'question-o';
        case 'wishlist': return 'star-o';
        default: return 'info-o';
    }
}
</script>

<style scoped lang="scss">
.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}
.asset-stats {
  background-color: #f7f8fa;
  min-height: 100vh;
}
.content {
  padding: 16px;
}

.overview-card {
    background: linear-gradient(135deg, #1989fa, #39b9f8);
    border-radius: 12px;
    padding: 20px;
    color: #fff;
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
    box-shadow: 0 4px 12px rgba(25, 137, 250, 0.3);

    .stat-item {
        flex: 1;
    }

    .label {
        font-size: 13px;
        opacity: 0.9;
        margin-bottom: 8px;
    }

    .value {
        font-size: 20px;
        font-weight: bold;
    }
}

.chart-section {
    background: #fff;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;

    .section-title {
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 16px;
        color: #323233;
        padding-left: 8px;
        border-left: 4px solid #1989fa;
    }
}

.category-list {
    .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;

        .stat-info {
            flex: 1;
            margin-right: 12px;

            .stat-name {
                font-size: 14px;
                color: #323233;
                margin-bottom: 6px;
            }
        }

        .stat-value {
            font-size: 14px;
            font-weight: 500;
            color: #323233;
        }
    }
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;

    .status-card {
        background: #f7f8fa;
        border-radius: 8px;
        padding: 12px;
        display: flex;
        align-items: center;

        .status-icon {
            margin-right: 10px;
            font-size: 24px;
            color: #1989fa;
        }

        .status-info {
            .name {
                font-size: 13px;
                color: #646566;
            }
            .count {
                font-size: 12px;
                color: #969799;
                margin: 2px 0;
            }
            .value {
                font-size: 14px;
                font-weight: 600;
                color: #323233;
            }
        }

        &.active .status-icon { color: #07c160; }
        &.retired .status-icon { color: #ee0a24; }
        &.sold .status-icon { color: #ff976a; }
    }
}
</style>
