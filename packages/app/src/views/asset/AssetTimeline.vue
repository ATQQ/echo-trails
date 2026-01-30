<template>
  <div class="asset-timeline">
    <van-nav-bar title="资产时间线" left-arrow @click-left="onClickLeft" fixed placeholder />

    <div class="timeline-content">
      <div v-if="sortedAssets.length > 0" class="timeline-container">
        <div v-for="(group, year) in groupedAssets" :key="year" class="year-group">
           <div class="year-label">{{ year }}</div>
           <div class="timeline-items">
               <div v-for="asset in group" :key="asset.id" class="timeline-item">
                   <div class="time-column">
                       <div class="date">{{ formatDateShort(asset.purchaseDate) }}</div>
                   </div>
                   <div class="content-card">
                       <div class="card-header">
                           <div class="asset-name">{{ asset.name }}</div>
                           <div class="asset-price">{{ formatCurrency(asset.price) }}</div>
                       </div>
                       <div class="card-body">
                           <van-tag plain type="primary" v-if="getCategoryName(asset.categoryId)">
                               {{ getCategoryName(asset.categoryId) }}
                           </van-tag>
                           <div v-if="asset.description" class="desc">{{ asset.description }}</div>
                       </div>
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
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore, type Asset } from '@/stores/asset';
import { formatCurrency } from '@/lib/format';

const router = useRouter();
const assetStore = useAssetStore();

const sortedAssets = computed(() => assetStore.assetsByDate);

const groupedAssets = computed(() => {
    const groups: Record<string, Asset[]> = {};
    sortedAssets.value.forEach(asset => {
        const year = new Date(asset.purchaseDate).getFullYear().toString();
        if (!groups[year]) {
            groups[year] = [];
        }
        groups[year].push(asset);
    });
    return groups;
});

const onClickLeft = () => {
  router.push('/discovery');
};

const formatDateShort = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}-${d.getDate()}`;
};

const getCategoryName = (id: string) => {
    return assetStore.categories.find(c => c.id === id)?.name;
};
</script>

<style scoped lang="scss">
.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-timeline {
  background-color: #f7f8fa;
  min-height: 100vh;
}

.timeline-content {
  padding: 16px;
}

.year-group {
    margin-bottom: 24px;

    .year-label {
        font-size: 20px;
        font-weight: bold;
        color: #323233;
        margin-bottom: 12px;
        padding-left: 8px;
        position: sticky;
        top: 60px; /* Adjust based on navbar height */
        z-index: 1;
        background: transparent;
        /* Glassmorphism effect if supported, else just transparent or bg color */
        text-shadow: 2px 2px 0px #f7f8fa;
    }
}

.timeline-items {
    position: relative;
    padding-left: 16px;
    border-left: 2px solid #ebedf0;
    margin-left: 8px;
}

.timeline-item {
    position: relative;
    margin-bottom: 20px;
    padding-left: 20px;

    &::before {
        content: '';
        position: absolute;
        left: -5px; /* (2px border / 2) - (8px dot / 2) approx */
        top: 16px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #1989fa;
        border: 2px solid #fff;
        box-shadow: 0 0 0 2px #ebedf0;
    }

    .time-column {
        position: absolute;
        left: -50px; /* Adjust based on layout preference, or keep inside */
        top: 12px;
        display: none; /* Hidden for this layout style, keeping date inside card or above */
    }

    /* Alternative layout: Date above card */
    .date {
        font-size: 12px;
        color: #969799;
        margin-bottom: 4px;
    }

    .content-card {
        background: #fff;
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        transition: transform 0.2s;

        &:active {
            transform: scale(0.98);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;

            .asset-name {
                font-size: 16px;
                font-weight: bold;
                color: #323233;
            }

            .asset-price {
                font-size: 16px;
                font-weight: 600;
                color: #ee0a24; /* Price highlight color */
            }
        }

        .card-body {
            .desc {
                font-size: 13px;
                color: #646566;
                margin-top: 6px;
                line-height: 1.4;
            }
        }
    }
}
</style>
