<template>
  <div class="asset-stats">
    <van-nav-bar left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #title>
        <div class="asset-page-title">
          <span>资产统计</span>
          <small>持有价值与成本结构</small>
        </div>
      </template>
    </van-nav-bar>

    <div class="content">
      <section class="stats-hero">
        <div class="stats-hero__head">
          <span>资产健康概览</span>
          <span class="stats-hero__badge">当前持有</span>
        </div>
        <div class="stats-hero__grid">
          <div class="stats-hero__metric">
            <div class="stats-hero__label">总资产估值</div>
            <div class="stats-hero__value">{{ formatCurrency(totalValue) }}</div>
            <div class="stats-hero__hint">不含已卖出资产</div>
          </div>
          <div class="stats-hero__metric">
            <div class="stats-hero__label">日均持有成本</div>
            <div class="stats-hero__value">{{ formatCurrency(dailyCost) }}</div>
            <div class="stats-hero__hint">仅统计当前持有</div>
          </div>
        </div>
      </section>

      <section class="stats-panel">
        <div class="stats-panel__head">
          <div>
            <h3>资产构成</h3>
            <p>按当前持有资产估值计算，已卖出不计入</p>
          </div>
          <span>{{ categoryStats.length }} 个分类</span>
        </div>

        <div v-if="categoryStats.length" class="donut-layout">
          <div class="stats-donut" :style="{ background: donutBackground }">
            <div class="stats-donut__center">
              <b>{{ donutValue }}</b>
              <span>持有资产</span>
            </div>
          </div>

          <div class="category-list">
            <div v-for="(cat, index) in categoryStats" :key="cat.id" class="category-item">
              <button type="button" class="category-row" @click="toggleCategory(cat.id)">
                <i class="category-color" :style="{ background: categoryColors[index % categoryColors.length] }"></i>
                <span class="category-name">{{ cat.name }}</span>
                <span class="category-percent">{{ cat.percentage.toFixed(1) }}%</span>
                <span class="category-value">{{ formatCurrency(cat.value) }}</span>
                <van-icon
                  name="arrow"
                  class="category-chevron"
                  :class="{ open: expandedId === cat.id }"
                />
              </button>
              <div v-if="expandedId === cat.id" class="subcategory-list">
                <div v-for="sub in cat.subCategories" :key="sub.name" class="subcategory-row">
                  <span>{{ sub.name }}</span>
                  <div class="subcategory-track">
                    <i
                      :style="{
                        width: `${sub.percentage}%`,
                        background: categoryColors[index % categoryColors.length]
                      }"
                    ></i>
                  </div>
                  <b>{{ formatCurrency(sub.value) }}</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="stats-empty">还没有可统计的持有资产</div>
      </section>

      <section class="stats-panel">
        <div class="stats-panel__head">
          <div>
            <h3>资产状态</h3>
            <p>包含全部状态，已卖出单独汇总收益</p>
          </div>
          <span>共 {{ store.assets.length }} 件</span>
        </div>

        <div class="status-list">
          <div
            v-for="stat in statusStats"
            :key="stat.statusKey"
            class="status-card"
            :class="`status-card--${stat.statusKey}`"
          >
            <i class="status-mark" :class="`status-mark--${stat.statusKey}`"></i>
            <div class="status-body">
              <b>{{ stat.name }}</b>
              <span>{{ stat.count }} 件资产</span>
            </div>
            <div class="status-amount">
              <small>{{ stat.amountLabel }}</small>
              <b :class="stat.valueClass">{{ stat.displayValue }}</b>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { useAssetStats } from '@/hooks/useAssetStats';

const router = useRouter();
const store = useAssetStore();
const { totalValue, dailyCost, refreshStats } = useAssetStats();
const expandedId = ref<string | null>(null);
const categoryColors = ['#1989fa', '#10b9a3', '#ff8f1f', '#7a5cff', '#ff5f87', '#4b9cff'];
const donutValue = computed(() => formatCurrency(totalValue.value).replace(/\.00$/, ''));

const loadPage = async () => {
  if (store.assets.length === 0 || store.categories.length === 0) {
    await store.loadData();
  }
  await refreshStats();
};

onActivated(loadPage);

const onClickLeft = () => {
  router.back();
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

  let total = 0;
  store.assets.forEach(asset => {
    if (asset.status === 'sold') return;
    const category = store.categories.find(item => item.id === asset.categoryId);
    const catId = category?.id || 'unknown';
    const catName = category?.name || '未分类';
    const subId = asset.subCategoryId || 'other';

    if (!statsMap.has(catId)) {
      statsMap.set(catId, {
        id: catId,
        name: catName,
        value: 0,
        subStats: new Map(),
      });
    }

    const catStat = statsMap.get(catId)!;
    catStat.value += asset.price;
    catStat.subStats.set(subId, (catStat.subStats.get(subId) || 0) + asset.price);
    total += asset.price;
  });

  return Array.from(statsMap.values())
    .map(cat => {
      const subCategories: { name: string; value: number; percentage: number }[] = [];
      const other = { name: '其它', value: 0, percentage: 0 };

      cat.subStats.forEach((value, subId) => {
        const category = store.categories.find(item => item.id === cat.id);
        const subCategory = category?.subCategories.find(item => item.id === subId);
        if (!subCategory) {
          other.value += value;
          return;
        }
        subCategories.push({
          name: subCategory.name,
          value,
          percentage: cat.value > 0 ? (value / cat.value) * 100 : 0,
        });
      });

      if (other.value > 0) {
        other.percentage = cat.value > 0 ? (other.value / cat.value) * 100 : 0;
        subCategories.push(other);
      }

      return {
        id: cat.id,
        name: cat.name,
        value: cat.value,
        percentage: total > 0 ? (cat.value / total) * 100 : 0,
        subCategories: subCategories.sort((a, b) => b.value - a.value),
      };
    })
    .sort((a, b) => b.value - a.value);
});

const donutBackground = computed(() => {
  if (categoryStats.value.length === 0) {
    return 'conic-gradient(#eef0f3 0 100%)';
  }
  let cursor = 0;
  const segments = categoryStats.value.map((cat, index) => {
    const start = cursor;
    cursor += cat.percentage;
    const color = categoryColors[index % categoryColors.length];
    return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return `conic-gradient(${segments.join(', ')})`;
});

const statusStats = computed(() => {
  return store.statuses.map(status => {
    const items = store.assets.filter(asset => asset.status === status.value);
    const value = items.reduce((sum, asset) => sum + Number(asset.price || 0), 0);
    const soldProfit = items.reduce((sum, asset) => {
      if (asset.soldPrice === null || asset.soldPrice === undefined) return sum;
      return sum + Number(asset.soldPrice) - Number(asset.price || 0);
    }, 0);
    const hasSoldProfit = status.value === 'sold'
      && items.some(asset => asset.soldPrice !== null && asset.soldPrice !== undefined);

    return {
      statusKey: status.value,
      name: status.name,
      count: items.length,
      amountLabel: status.value === 'sold' ? '卖出盈亏' : '资产原值',
      displayValue: status.value === 'sold'
        ? hasSoldProfit
          ? formatSignedCurrency(soldProfit)
          : '未记录'
        : formatCurrency(value),
      valueClass: hasSoldProfit ? (soldProfit >= 0 ? 'num-up' : 'num-down') : '',
    };
  });
});
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-stats {
  min-height: 100vh;
  background: #f6f7f9;
  padding-bottom: var(--footer-area-height);
}

.content {
  padding: 14px;
}

.stats-hero {
  position: relative;
  overflow: hidden;
  margin-bottom: 14px;
  padding: 18px;
  background: #202730;
  border: 1px solid #303946;
  border-radius: 16px;
  box-shadow: 0 14px 30px rgba(32, 39, 48, 0.16);
  color: #fff;

  &::after {
    content: '';
    position: absolute;
    top: -54px;
    right: -42px;
    width: 150px;
    height: 150px;
    border: 26px solid rgba(255, 255, 255, 0.035);
    border-radius: 50%;
    pointer-events: none;
  }
}

.stats-hero__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.stats-hero__badge {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 10px;
}

.stats-hero__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 16px;
}

.stats-hero__metric + .stats-hero__metric {
  padding-left: 16px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.stats-hero__metric {
  min-width: 0;
}

.stats-hero__label {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}

.stats-hero__value {
  overflow: hidden;
  margin-top: 7px;
  color: #fff;
  font-size: 21px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-hero__metric:last-child .stats-hero__value {
  font-size: 19px;
}

.stats-hero__hint {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 10px;
}

.stats-panel {
  margin-bottom: 14px;
  padding: 16px;
  background: #fff;
  border: 1px solid #eceef1;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
}

.stats-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: #23262b;
    font-size: 15px;
  }

  p {
    margin: 4px 0 0;
    color: #8f949c;
    font-size: 11px;
  }

  > span {
    flex: 0 0 auto;
    color: #8f949c;
    font-size: 11px;
  }
}

.donut-layout {
  display: grid;
  gap: 16px;
}

.stats-donut {
  position: relative;
  width: 126px;
  height: 126px;
  margin: 0 auto;
  border-radius: 50%;

  &::after {
    content: '';
    position: absolute;
    inset: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 1px #eceef1;
  }
}

.stats-donut__center {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  b {
    max-width: 88px;
    overflow: hidden;
    color: #23262b;
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    margin-top: 3px;
    color: #8f949c;
    font-size: 10px;
  }
}

.category-item {
  border-bottom: 1px solid #f2f3f5;

  &:last-child {
    border-bottom: 0;
  }
}

.category-row {
  display: grid;
  grid-template-columns: 8px minmax(44px, 1fr) 46px 76px 16px;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.category-color {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.category-name {
  overflow: hidden;
  color: #5c6169;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-percent {
  color: #8f949c;
  font-size: 12px;
  text-align: right;
}

.category-value {
  color: #23262b;
  font-size: 12px;
  text-align: right;
}

.category-chevron {
  color: #8f949c;
  transition: transform 0.2s ease;

  &.open {
    transform: rotate(90deg);
  }
}

.subcategory-list {
  padding: 0 0 10px 16px;
}

.subcategory-row {
  display: grid;
  grid-template-columns: minmax(52px, 1fr) minmax(54px, 90px) 68px;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  color: #8f949c;
  font-size: 11px;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > b {
    color: #5c6169;
    font-size: 11px;
    text-align: right;
  }
}

.subcategory-track {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #f1f3f6;

  i {
    display: block;
    height: 100%;
    border-radius: 999px;
  }
}

.stats-empty {
  padding: 30px 10px;
  color: #8f949c;
  font-size: 13px;
  text-align: center;
}

.status-list {
  display: grid;
  gap: 9px;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: #f6f7f9;

  &--active {
    background: #f2fbf6;
    border-color: #e1f5e9;
  }

  &--retired {
    background: #f6f7f9;
    border-color: #eceef1;
  }

  &--sold {
    background: #fff8ef;
    border-color: #ffedd8;
  }
}

.status-mark {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;

  &--active {
    background: #07c160;
  }

  &--retired {
    background: #8f949c;
  }

  &--sold {
    background: #ff8f1f;
  }
}

.status-body {
  min-width: 0;
  flex: 1;

  b {
    display: block;
    color: #23262b;
    font-size: 13px;
  }

  span {
    display: block;
    margin-top: 3px;
    color: #8f949c;
    font-size: 11px;
  }
}

.status-amount {
  flex: 0 0 auto;
  text-align: right;

  small {
    display: block;
    color: #8f949c;
    font-size: 10px;
  }

  b {
    display: block;
    margin-top: 4px;
    color: #23262b;
    font-size: 14px;
    white-space: nowrap;

    &.num-up {
      color: #ee0a24;
    }

    &.num-down {
      color: #07c160;
    }
  }
}

@include desktop {
  .asset-stats {
    min-height: 100%;
  }

  .content {
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    padding: 14px 18px 24px;
    box-sizing: border-box;
  }

  .donut-layout {
    grid-template-columns: 126px minmax(0, 1fr);
    gap: 22px;
    align-items: center;
  }

  .stats-donut {
    margin: 0;
  }
}
</style>
