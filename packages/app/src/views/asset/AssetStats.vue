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
              <div v-for="cat in categoryStats" :key="cat.id" class="stat-item-wrapper" @click="toggleCategory(cat.id)">
                  <div class="stat-item">
                      <div class="stat-info">
                          <div class="stat-header">
                            <div class="stat-name">
                                {{ cat.name }}
                                <van-icon :name="expandedId === cat.id ? 'arrow-up' : 'arrow-down'" class="expand-icon" />
                            </div>
                            <div class="stat-pct">{{ cat.percentage.toFixed(2) }}%</div>
                          </div>
                          <van-progress :percentage="cat.percentage" :stroke-width="6" :show-pivot="false" color="#1989fa" track-color="#f2f3f5" />
                      </div>
                      <div class="stat-value">{{ formatCurrency(cat.value) }}</div>
                  </div>
                  
                  <!-- 子分类列表 -->
                  <div v-if="expandedId === cat.id" class="sub-category-list" @click.stop>
                      <template v-if="cat.subCategories.length > 0">
                        <div v-for="sub in cat.subCategories" :key="sub.name" class="sub-stat-item">
                            <div class="sub-stat-info">
                                <div class="sub-stat-name">{{ sub.name }}</div>
                                <van-progress :percentage="sub.percentage" :stroke-width="4" :show-pivot="false" color="#39b9f8" track-color="#f2f3f5" />
                            </div>
                            <div class="sub-stat-right">
                                <div class="sub-stat-value">{{ formatCurrency(sub.value) }}</div>
                                <div class="sub-stat-pct">{{ sub.percentage.toFixed(2) }}%</div>
                            </div>
                        </div>
                      </template>
                      <div v-else class="no-sub-data">
                          暂无子分类数据
                      </div>
                  </div>
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
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';
import { formatCurrency } from '@/lib/format';
import { useAssetStats } from '@/hooks/useAssetStats';

const router = useRouter();
const store = useAssetStore();
const { totalValue, dailyCost, refreshStats } = useAssetStats();

const expandedId = ref<string | null>(null);

onMounted(() => {
    store.loadData().then(() => {
        refreshStats();
    });
});

const onClickLeft = () => {
  router.push('/discovery');
};

const toggleCategory = (id: string) => {
    expandedId.value = expandedId.value === id ? null : id;
};

const categoryStats = computed(() => {
  const statsMap = new Map<string, {
    id: string;
    name: string;
    value: number;
    subStats: Map<string, number>;
  }>();

  let totalValue = 0;

  store.assets.forEach(asset => {
    const category = store.categories.find(c => c.id === asset.categoryId);
    const catId = category?.id || 'unknown';
    const catName = category?.name || '未分类';
    const subId = asset.subCategoryId || 'other';

    if (!statsMap.has(catId)) {
      statsMap.set(catId, {
        id: catId,
        name: catName,
        value: 0,
        subStats: new Map()
      });
    }

    const catStat = statsMap.get(catId)!;
    catStat.value += asset.price;
    catStat.subStats.set(subId, (catStat.subStats.get(subId) || 0) + asset.price);

    totalValue += asset.price;
  });

  return Array.from(statsMap.values()).map(cat => {
    const finalSubCategories: {name: string, value: number, percentage: number}[] = [];
    const otherSub = { name: '其它', value: 0, percentage: 0 };
    
    Array.from(cat.subStats.entries()).forEach(([subId, val]) => {
        let isOther = false;
        let name = '';
        
        if (subId === 'other') {
            isOther = true;
        } else {
            const category = store.categories.find(c => c.id === cat.id);
            const subCat = category?.subCategories?.find(s => s.id === subId);
            if (subCat) {
                name = subCat.name;
            } else {
                isOther = true;
            }
        }
        
        if (isOther) {
            otherSub.value += val;
        } else {
            finalSubCategories.push({
                name,
                value: val,
                percentage: cat.value > 0 ? (val / cat.value) * 100 : 0
            });
        }
    });
    
    if (otherSub.value > 0) {
        otherSub.percentage = cat.value > 0 ? (otherSub.value / cat.value) * 100 : 0;
        finalSubCategories.push(otherSub);
    }
    
    finalSubCategories.sort((a, b) => b.value - a.value);

    return {
      id: cat.id,
      name: cat.name,
      value: cat.value,
      percentage: totalValue > 0 ? (cat.value / totalValue) * 100 : 0,
      subCategories: finalSubCategories
    };
  }).sort((a, b) => b.value - a.value);
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
    .stat-item-wrapper {
        margin-bottom: 12px;
        
        &:last-child {
            margin-bottom: 0;
        }
    }

    .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;

        .stat-info {
            flex: 1;
            margin-right: 12px;

            .stat-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;

                .stat-name {
                    font-size: 14px;
                    color: #323233;
                    display: flex;
                    align-items: center;

                    .expand-icon {
                        margin-left: 4px;
                        font-size: 12px;
                        color: #969799;
                    }
                }
                
                .stat-pct {
                    font-size: 12px;
                    color: #969799;
                }
            }
        }

        .stat-value {
            font-size: 14px;
            font-weight: 500;
            color: #323233;
            min-width: 60px;
            text-align: right;
        }
    }

    .sub-category-list {
        background-color: #f7f8fa;
        padding: 12px;
        border-radius: 8px;
        margin-top: 8px;
        
        .sub-stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            
            &:last-child {
                margin-bottom: 0;
            }
            
            .sub-stat-info {
                flex: 1;
                margin-right: 12px;
                
                .sub-stat-name {
                    font-size: 13px;
                    color: #646566;
                    margin-bottom: 4px;
                }
            }
            
            .sub-stat-right {
                text-align: right;
                min-width: 60px;
                
                .sub-stat-value {
                    font-size: 13px;
                    color: #323233;
                }
                
                .sub-stat-pct {
                    font-size: 11px;
                    color: #969799;
                }
            }
        }

        .no-sub-data {
            text-align: center;
            color: #969799;
            font-size: 12px;
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
