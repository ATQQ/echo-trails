<template>
  <div class="asset-timeline">
    <van-nav-bar left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #title>
        <div class="asset-page-title">
          <span>资产时间线</span>
          <small>按购入年份回溯</small>
        </div>
      </template>
    </van-nav-bar>

    <div class="timeline-content">
      <div class="timeline-hint">按购入年份分组，卖出项带橙色标记</div>
      <div v-if="sortedAssets.length > 0" class="timeline-container">
        <div class="timeline">
          <div v-for="(group, year) in groupedAssets" :key="year" class="year-group">
            <div class="year-label">{{ year }}</div>
            <div
              v-for="asset in group"
              :key="asset.id"
              class="timeline-item"
              :data-status="asset.status"
              @click="openDetail(asset)"
            >
              <div class="timeline-card">
                <div class="card-header">
                  <div class="asset-name">{{ asset.name }}</div>
                  <div class="asset-price">{{ formatCurrency(asset.price) }}</div>
                  <span class="status-tag" :class="`status-tag--${asset.status}`">
                    {{ statusLabel(asset) }}
                  </span>
                </div>
                <div class="card-meta">
                  <span class="category-tag">
                    {{ getCategoryName(asset) }}
                  </span>
                  <span>{{ dateMeta(asset) }}</span>
                </div>
                <div v-if="asset.status === 'sold' && profitOf(asset) !== undefined" class="sold-summary">
                  <span>卖出 {{ formatCurrency(Number(asset.soldPrice)) }}</span>
                  <b :class="profitOf(asset)! >= 0 ? 'profit-up' : 'profit-down'">
                    盈亏 {{ formatSignedCurrency(profitOf(asset)!) }}
                  </b>
                </div>
                <div v-if="asset.description" class="desc">{{ asset.description }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <van-empty v-else description="暂无资产记录" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore, type Asset } from '@/stores/asset';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';

const router = useRouter();
const assetStore = useAssetStore();

const sortedAssets = computed(() => assetStore.assetsByDate);

const groupedAssets = computed(() => {
  const groups: Record<string, Asset[]> = {};
  sortedAssets.value.forEach(asset => {
    const year = new Date(asset.purchaseDate).getFullYear().toString();
    if (!groups[year]) groups[year] = [];
    groups[year].push(asset);
  });
  return groups;
});

onActivated(() => {
  if (assetStore.assets.length === 0 || assetStore.categories.length === 0) {
    assetStore.loadData();
  }
});

const onClickLeft = () => {
  router.back();
};

const openDetail = (asset: Asset) => {
  router.push(`/asset/detail/${asset.id}`);
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

const dateMeta = (asset: Asset) => {
  const parts = [`购入 ${formatDate(asset.purchaseDate)}`, `持有 ${asset.daysHeld || 0} 天`];
  if (asset.status === 'sold') {
    parts.splice(1, 0, `卖出 ${asset.soldDate ? formatDate(asset.soldDate) : '未记录'}`);
  } else if (asset.status === 'retired') {
    parts.splice(1, 0, `退役 ${asset.retiredDate ? formatDate(asset.retiredDate) : '未记录'}`);
  }
  return parts.join(' · ');
};

const getCategoryName = (asset: Asset) => {
  const category = assetStore.categories.find(item => item.id === asset.categoryId);
  const subCategory = category?.subCategories.find(item => item.id === asset.subCategoryId);
  return `${category?.name || '未分类'}${subCategory ? ` / ${subCategory.name}` : ''}`;
};

const statusLabel = (asset: Asset) => {
  if (asset.status === 'sold') return '已卖出';
  if (asset.status === 'retired') return '已退役';
  return '服役中';
};

const profitOf = (asset: Asset) => {
  if (asset.status !== 'sold') return undefined;
  if (asset.soldPrice === null || asset.soldPrice === undefined) return undefined;
  return Number(asset.soldPrice) - Number(asset.price || 0);
};
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-timeline {
  min-height: 100vh;
  background: #f6f7f9;
}

.timeline-content {
  padding: 14px;
}

.timeline-hint {
  margin-bottom: 8px;
  color: #8f949c;
  font-size: 12px;
}

.timeline {
  position: relative;
  padding-left: 26px;

  &::before {
    content: '';
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 7px;
    width: 2px;
    background: #e3e6ea;
  }
}

.year-label {
  margin: 18px 0 10px;
  color: #23262b;
  font-size: 15px;
  font-weight: 600;

  &:first-child {
    margin-top: 4px;
  }
}

.timeline-item {
  position: relative;
  margin-bottom: 12px;

  &::before {
    content: '';
    position: absolute;
    top: 18px;
    left: -24px;
    width: 10px;
    height: 10px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #1989fa;
    box-shadow: 0 0 0 2px #e3e6ea;
  }

  &[data-status='sold']::before {
    background: #ff8f1f;
  }

  &[data-status='retired']::before {
    background: #8f949c;
  }
}

.timeline-card {
  padding: 12px;
  background: #fff;
  border: 1px solid #eceef1;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;

  .asset-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: #23262b;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asset-price {
    font-family: 'DIN Alternate', 'SF Mono', ui-monospace, Menlo, monospace;
    color: #23262b;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.status-tag {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;

  &--active {
    background: #e8f8ef;
    color: #07c160;
  }

  &--retired {
    background: #f1f3f6;
    color: #8f949c;
  }

  &--sold {
    background: #fff4e8;
    color: #ff8f1f;
  }
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
  color: #8f949c;
  font-size: 12px;
}

.category-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f3f6;
  color: #5c6169;
}

.sold-summary {
  display: flex;
  gap: 12px;
  margin-top: 7px;
  color: #5c6169;
  font-size: 12px;

  .profit-up {
    color: #ee0a24;
  }

  .profit-down {
    color: #07c160;
  }
}

.desc {
  margin-top: 7px;
  color: #5c6169;
  font-size: 12px;
  line-height: 1.55;
}

@include desktop {
  .asset-timeline {
    min-height: 100%;
  }

  .timeline-content {
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    padding: 14px 18px 24px;
    box-sizing: border-box;
  }
}
</style>
