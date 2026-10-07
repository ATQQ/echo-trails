<template>
  <div class="asset-list">
    <van-nav-bar left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #title>
        <div class="asset-nav-title">
          <span>我的资产</span>
          <small>资产 · {{ assets.length }} 件</small>
        </div>
      </template>
      <template #right>
        <div class="nav-actions">
          <van-icon name="label-o" size="18" @click="router.push('/asset/manage')" />
          <van-icon name="plus" size="18" @click="handleAdd" />
        </div>
      </template>
    </van-nav-bar>

    <div class="stats-header">
      <div class="overview-card">
        <div class="overview-cell">
          <div class="label">总资产估值</div>
          <div class="value">{{ formatCurrency(totalValue) }}</div>
          <div class="hint">不含已卖出</div>
        </div>
        <div class="overview-cell">
          <div class="label">日均持有成本</div>
          <div class="value">{{ formatCurrency(dailyCost) }}</div>
          <div class="hint">仅当前持有</div>
        </div>
      </div>

      <div class="status-bar-container">
        <div class="status-text">
          <div class="status-item"><span class="dot active"></span>服役中 {{ activeCount }}</div>
          <div class="status-item"><span class="dot retired"></span>已退役 {{ retiredCount }}</div>
          <div class="status-item"><span class="dot sold"></span>已卖出 {{ soldCount }}</div>
        </div>
        <div class="progress-bar">
          <div class="bar-segment active" :style="{ width: statusPercent.active + '%' }"></div>
          <div class="bar-segment retired" :style="{ width: statusPercent.retired + '%' }"></div>
          <div class="bar-segment sold" :style="{ width: statusPercent.sold + '%' }"></div>
        </div>
      </div>
    </div>

    <div class="filter-content">
      <div class="search-bar">
        <van-icon name="search" size="18" class="search-icon" />
        <input
          v-model="searchQuery"
          class="search-input"
          type="text"
          inputmode="search"
          autocomplete="off"
          placeholder="搜索名称、分类或描述"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear"
          aria-label="清空搜索"
          @click="searchQuery = ''"
        >
          <van-icon name="cross" size="14" />
        </button>
      </div>

      <div class="status-chips">
        <button
          v-for="filter in statusFilters"
          :key="filter.value"
          type="button"
          class="filter-chip"
          :class="{ active: activeStatusFilter === filter.value }"
          @click="activeStatusFilter = filter.value"
        >
          <i v-if="filter.dot" class="chip-dot" :class="filter.dot"></i>
          {{ filter.label }}
        </button>
      </div>

      <div class="cat-tabs">
        <button
          type="button"
          class="cat-tab"
          :class="{ active: activeCategory === 'all' }"
          @click="activeCategory = 'all'"
        >
          全部
        </button>
        <button
          v-for="cat in store.categories"
          :key="cat.id"
          type="button"
          class="cat-tab"
          :class="{ active: activeCategory === cat.id }"
          @click="activeCategory = cat.id"
        >
          {{ cat.name }}
        </button>
      </div>

      <div v-if="currentSubCategories.length" class="subcategory-chips">
        <button
          type="button"
          class="filter-chip small"
          :class="{ active: activeSubCategory === 'all' }"
          @click="activeSubCategory = 'all'"
        >
          全部子类
        </button>
        <button
          v-for="sub in currentSubCategories"
          :key="sub.id"
          type="button"
          class="filter-chip small"
          :class="{ active: activeSubCategory === sub.id }"
          @click="activeSubCategory = sub.id"
        >
          {{ sub.name }}
        </button>
      </div>
      <div v-else class="chip-hint">选择分类可进一步按子类筛选</div>
      <div class="list-container">
        <AssetItem
          v-for="item in filteredAssets"
          :key="item.id"
          :item="item"
          @increment="incrementUsage"
          @edit="handleEdit"
          @delete="handleDelete"
          @click-body="handleBodyClick"
        />
        <van-empty v-if="filteredAssets.length === 0" :description="searchQuery ? '没有找到匹配的资产' : '暂无数据'" />
      </div>
    </div>

    <AssetForm
      v-model:visible="showAssetForm"
      :categories="store.categories"
      :statuses="store.statuses"
      :initial-data="editingAsset"
      @save="onSave"
    />

    <van-dialog
      v-model:show="showIncrementDialog"
      title="记录一次"
      show-cancel-button
      @confirm="confirmIncrement"
    >
      <van-field
        v-model="incrementDescription"
        label="备注"
        placeholder="请输入使用备注（选填）"
        type="textarea"
        rows="2"
        autosize
      />
    </van-dialog>

    <div class="asset-add-button">
      <AddButton @click="handleAdd" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { showConfirmDialog, showToast } from 'vant';
import { useAssetStore, type Asset } from '@/stores/asset';
import { preventBack } from '@/lib/router';
import { addUsageRecord } from '@/service';
import AddButton from '@/components/AddButton/AddButton.vue';
import AssetItem from '@/components/AssetItem/AssetItem.vue';
import AssetForm from '@/components/AssetForm/AssetForm.vue';
import { formatCurrency } from '@/lib/format';
import { useAssetStats } from '@/hooks/useAssetStats';

const router = useRouter();
const store = useAssetStore();
const { assets, categories } = storeToRefs(store);
const { totalValue, dailyCost, refreshStats } = useAssetStats(store);

const activeCategory = ref('all');
const activeStatusFilter = ref('all');
const activeSubCategory = ref('all');
const searchQuery = ref('');

const loadPage = async () => {
  await store.loadData();
  await refreshStats();
};

onActivated(loadPage);

watch(activeCategory, () => {
  activeSubCategory.value = 'all';
});

const activeCount = computed(() => assets.value.filter(a => a.status === 'active').length);
const retiredCount = computed(() => assets.value.filter(a => a.status === 'retired').length);
const soldCount = computed(() => assets.value.filter(a => a.status === 'sold').length);
const statusPercent = computed(() => {
  const total = assets.value.length || 1;
  return {
    active: (activeCount.value / total) * 100,
    retired: (retiredCount.value / total) * 100,
    sold: (soldCount.value / total) * 100,
  };
});

const statusFilters = computed(() => [
  { label: '全部', value: 'all', dot: '' },
  ...store.statuses.map(status => ({
    label: status.name,
    value: status.value,
    dot: status.value === 'active' ? 'active' : status.value === 'retired' ? 'retired' : 'sold',
  })),
]);

const currentSubCategories = computed(() => {
  if (activeCategory.value === 'all') return [];
  return categories.value.find(cat => cat.id === activeCategory.value)?.subCategories || [];
});

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return assets.value
    .filter(item => {
      const cat = categories.value.find(c => c.id === item.categoryId);
      const sub = cat?.subCategories.find(s => s.id === item.subCategoryId);

      if (activeStatusFilter.value !== 'all' && item.status !== activeStatusFilter.value) return false;
      if (activeCategory.value !== 'all' && item.categoryId !== activeCategory.value) return false;
      if (
        activeCategory.value !== 'all'
        && activeSubCategory.value !== 'all'
        && item.subCategoryId !== activeSubCategory.value
      ) {
        return false;
      }

      if (!query) return true;
      return [
        item.name,
        item.description || '',
        cat?.name || '',
        sub?.name || '',
      ].some(value => value.toLowerCase().includes(query));
    })
    .map(item => {
      const cat = categories.value.find(c => c.id === item.categoryId);
      const sub = cat?.subCategories.find(s => s.id === item.subCategoryId);
      return { ...item, categoryName: cat?.name, subCategoryName: sub?.name };
    });
});

const onClickLeft = () => {
  router.back();
};

const showIncrementDialog = ref(false);
const incrementDescription = ref('');
const currentIncrementId = ref('');
preventBack(showIncrementDialog);

const incrementUsage = (id: string) => {
  const asset = assets.value.find(item => item.id === id);
  if (!asset || asset.calcType !== 'count' || asset.status !== 'active') return;
  currentIncrementId.value = id;
  incrementDescription.value = '';
  showIncrementDialog.value = true;
};

const confirmIncrement = async () => {
  if (!currentIncrementId.value) return;
  const asset = assets.value.find(item => item.id === currentIncrementId.value);
  if (!asset || asset.calcType !== 'count' || asset.status !== 'active') {
    showIncrementDialog.value = false;
    return;
  }

  try {
    await addUsageRecord({
      targetId: currentIncrementId.value,
      targetType: 'asset',
      actionType: 'increment_usage',
      description: incrementDescription.value,
    });
    await store.updateAsset(currentIncrementId.value, { usageCount: asset.usageCount + 1 });
    await store.loadData();
    await refreshStats();
    showToast('记录成功');
    showIncrementDialog.value = false;
  } catch (error) {
    console.error(error);
    showToast('操作失败');
  }
};

const showAssetForm = ref(false);
const editingAsset = ref<Asset | null>(null);
preventBack(showAssetForm);

const handleAdd = () => {
  editingAsset.value = null;
  showAssetForm.value = true;
};

const handleEdit = (item: Asset) => {
  editingAsset.value = item;
  showAssetForm.value = true;
};

const handleBodyClick = (item: Asset) => {
  router.push(`/asset/detail/${item.id}`);
};

const handleDelete = (id: string) => {
  showConfirmDialog({
    title: '确认删除',
    message: '删除后无法恢复，确认删除吗？',
  })
    .then(async () => {
      await store.deleteAsset(id);
      await refreshStats();
      showToast('删除成功');
    })
    .catch(() => {});
};

const onSave = async () => {
  await loadPage();
};
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-nav-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.1;

  span {
    color: #23262b;
    font-size: 17px;
    font-weight: 600;
  }

  small {
    color: #8f949c;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
  }
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 14px;

  .van-icon:last-child {
    color: #1989fa;
  }
}

.asset-list {
  background-color: #f6f7f9;
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: var(--footer-area-height);
}

.stats-header {
  padding: 14px 14px 10px;
}

.overview-card {
  display: flex;
  overflow: hidden;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid #eceef1;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);

  .overview-cell {
    flex: 1;
    min-width: 0;
    padding: 16px;

    + .overview-cell {
      border-left: 1px solid #f2f3f5;
    }
  }

  .label {
    color: #8f949c;
    font-size: 12px;
  }

  .value {
    overflow: hidden;
    margin-top: 7px;
    color: #23262b;
    font-family: 'DIN Alternate', 'SF Mono', ui-monospace, Menlo, monospace;
    font-size: 20px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    margin-top: 5px;
    color: #a3a8af;
    font-size: 11px;
  }
}

.status-bar-container {
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #eceef1;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);

  .status-text {
    display: flex;
    justify-content: space-between;
    margin-bottom: 9px;
    color: #5c6169;
    font-size: 12px;
  }

  .status-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;

    &.active {
      background: #07c160;
    }

    &.retired {
      background: #8f949c;
    }

    &.sold {
      background: #ff8f1f;
    }
  }
}

.progress-bar {
  display: flex;
  height: 6px;
  overflow: hidden;
  background: #f1f3f6;
  border-radius: 999px;
}

.bar-segment {
  height: 100%;

  &.active {
    background: #07c160;
  }

  &.retired {
    background: #8f949c;
  }

  &.sold {
    background: #ff8f1f;
  }
}

.filter-content {
  padding: 0 14px 20px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 42px;
  margin-bottom: 12px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 11px;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);

  &:focus-within {
    border-color: rgba(25, 137, 250, 0.28);
    box-shadow: 0 0 0 3px rgba(25, 137, 250, 0.1);
  }
}

.search-icon {
  flex: 0 0 auto;
  color: #8f949c;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #23262b;
  font-size: 14px;

  &::placeholder {
    color: #8f949c;
  }
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #f1f3f6;
  color: #8f949c;
}

.status-chips,
.subcategory-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 11px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 7px 14px;
  border: 1px solid #e3e6ea;
  border-radius: 999px;
  background: #fff;
  color: #5c6169;
  font-size: 13px;

  &.active {
    border-color: rgba(25, 137, 250, 0.28);
    background: rgba(25, 137, 250, 0.1);
    color: #1989fa;
    font-weight: 500;
  }

  &.small {
    padding: 5px 11px;
    font-size: 12px;
  }
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.active {
    background: #07c160;
  }

  &.retired {
    background: #8f949c;
  }

  &.sold {
    background: #ff8f1f;
  }
}

.cat-tabs {
  display: flex;
  gap: 22px;
  overflow-x: auto;
  margin-bottom: 11px;
  border-bottom: 1px solid #f2f3f5;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.cat-tab {
  position: relative;
  flex: 0 0 auto;
  padding: 6px 2px 11px;
  border: 0;
  background: transparent;
  color: #5c6169;
  font-size: 14px;
  white-space: nowrap;

  &.active {
    color: #1989fa;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      border-radius: 2px;
      background: #1989fa;
    }
  }
}

.chip-hint {
  padding: 1px 2px 12px;
  color: #8f949c;
  font-size: 12px;
}

.list-container {
  padding-top: 2px;
}

.asset-add-button {
  :deep(.add-btn) {
    right: 16px;
    bottom: calc(var(--footer-area-height) + 16px);
    width: 52px;
    height: 52px;
    background: #1989fa;
    box-shadow: 0 8px 20px rgba(25, 137, 250, 0.4);
  }
}

@include desktop {
  .stats-header,
  .filter-content {
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .stats-header {
    padding: 14px 18px 10px;
  }

  .filter-content {
    padding: 0 18px 24px;
  }

  .asset-add-button {
    display: none;
  }
}
</style>
