<template>
  <div class="asset-detail">
    <van-nav-bar left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #title>
        <div class="asset-page-title">
          <span>资产详情</span>
          <small>{{ statusLabel }} · 完整信息</small>
        </div>
      </template>
    </van-nav-bar>

    <template v-if="asset">
      <div class="detail-hero" @click="previewImage">
        <van-image v-if="imageSrc" :src="imageSrc" width="100%" height="100%" fit="cover" />
        <div v-else class="hero-placeholder">
          <van-icon name="image-o" size="42" />
        </div>
      </div>

      <div class="detail-sheet">
        <div class="title-row">
          <div class="asset-name">{{ asset.name }}</div>
          <span class="status-tag" :class="`status-tag--${asset.status}`">{{ statusLabel }}</span>
        </div>
        <div v-if="asset.description" class="asset-description">{{ asset.description }}</div>

        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">{{ costLabel }}</div>
            <div class="metric-value">{{ costValue }}</div>
          </div>
          <div class="metric">
            <div class="metric-label">持有时长</div>
            <div class="metric-value">{{ asset.daysHeld || 0 }} 天</div>
          </div>
        </div>

        <div v-if="profitValue !== undefined" class="profit-row">
          <span>该笔卖出盈亏</span>
          <strong :class="profitValue >= 0 ? 'profit-up' : 'profit-down'">
            {{ formatSignedCurrency(profitValue) }}
          </strong>
        </div>

        <div class="kv-list">
          <div v-for="row in detailRows" :key="row.label" class="kv-row">
            <span class="kv-label">{{ row.label }}</span>
            <span class="kv-value" :class="{ plain: row.plain }">{{ row.value }}</span>
          </div>
        </div>

        <div v-if="asset.calcType === 'count'" class="usage-section">
          <div class="usage-title">
            <span>使用记录</span>
            <small v-if="usageHistory.length">共 {{ usageHistory.length }} 条</small>
          </div>
          <div v-if="!canRecordUsage" class="usage-readonly-tip">
            {{ asset.status === 'sold' ? '已卖出' : '已退役' }}，使用次数已冻结，仅可查看历史记录。
          </div>
          <van-loading v-if="historyLoading" class="usage-loading">加载中...</van-loading>
          <template v-else>
            <div v-if="usageHistory.length" class="usage-list">
              <div v-for="record in usageHistory" :key="record._id || record.id" class="usage-row">
                <span>{{ formatDateTime(record.createdAt || record.updated_at) }}</span>
                <span>{{ record.description || '无备注' }}</span>
              </div>
            </div>
            <div v-else class="usage-empty">
              {{ canRecordUsage ? '暂无记录，点「记录一次」开始累计使用次数。' : '暂无历史记录。' }}
            </div>
          </template>
        </div>

        <div class="detail-actions">
          <van-button
            v-if="canRecordUsage"
            type="primary"
            plain
            icon="plus"
            @click="openUsageDialog"
          >
            记录一次
          </van-button>
          <van-button type="primary" icon="edit" @click="openEdit">编辑</van-button>
        </div>
        <div class="detail-actions stacked">
          <van-button type="danger" plain icon="delete-o" @click="handleDelete">删除资产</van-button>
        </div>
      </div>
    </template>

    <van-empty v-else description="资产不存在或已删除" />

    <AssetForm
      v-model:visible="showAssetForm"
      :categories="store.categories"
      :statuses="store.statuses"
      :initial-data="asset || null"
      @save="handleSaved"
    />

    <van-dialog
      v-model:show="showUsageDialog"
      title="记录一次"
      show-cancel-button
      @confirm="confirmUsage"
    >
      <van-field
        v-model="usageDescription"
        label="备注"
        placeholder="请输入使用备注（选填）"
        type="textarea"
        rows="2"
        autosize
      />
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showImagePreview, showToast } from 'vant';
import { useAssetStore } from '@/stores/asset';
import { addUsageRecord, getUsageRecords } from '@/service';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { preventBack } from '@/lib/router';
import AssetForm from '@/components/AssetForm/AssetForm.vue';

const route = useRoute();
const router = useRouter();
const store = useAssetStore();

const assetId = computed(() => String(route.params.id || ''));
const asset = computed(() => store.assets.find(item => item.id === assetId.value));

const imageSrc = computed(() => {
  if (!asset.value) return '';
  return (asset.value as any).preview || (asset.value as any).cover || asset.value.image || '';
});

const statusLabel = computed(() => {
  if (asset.value?.status === 'sold') return '已卖出';
  if (asset.value?.status === 'retired') return '已退役';
  return '服役中';
});

const calcTypeLabel = computed(() => {
  if (asset.value?.calcType === 'count') return '按次';
  if (asset.value?.calcType === 'day') return '按天';
  return '消耗品';
});

const costLabel = computed(() => {
  if (asset.value?.calcType === 'count') return '单次成本';
  if (asset.value?.calcType === 'day') return '日均成本';
  return '计费方式';
});

const costValue = computed(() => {
  if (!asset.value) return '-';
  if (asset.value.calcType === 'count') return formatCurrency(asset.value.costPerUse || 0);
  if (asset.value.calcType === 'day') return formatCurrency(asset.value.costPerDay || 0);
  return '消耗品';
});

const profitValue = computed(() => {
  if (asset.value?.status !== 'sold') return undefined;
  if (asset.value.soldPrice === null || asset.value.soldPrice === undefined) return undefined;
  return Number(asset.value.soldPrice) - Number(asset.value.price || 0);
});

const detailRows = computed(() => {
  if (!asset.value) return [];
  const current = asset.value;
  const cat = store.categories.find(item => item.id === current.categoryId);
  const sub = cat?.subCategories.find(item => item.id === current.subCategoryId);
  const rows: { label: string; value: string; plain?: boolean }[] = [
    { label: '分类', value: `${cat?.name || '未分类'}${sub ? ` · ${sub.name}` : ''}`, plain: true },
    { label: '购入日期', value: formatDate(current.purchaseDate) },
    { label: '购入价格', value: formatCurrency(current.price) },
    { label: '持有天数', value: `${current.daysHeld || 0} 天` },
    { label: '计费方式', value: calcTypeLabel.value, plain: true },
  ];

  if (current.calcType === 'count') {
    rows.push({ label: '使用次数', value: `${current.usageCount || 0} 次` });
  }
  if (current.status === 'sold') {
    rows.push({
      label: '卖出日期',
      value: current.soldDate ? formatDate(current.soldDate) : '未记录',
      plain: true,
    });
    rows.push({
      label: '卖出价格',
      value: current.soldPrice === null || current.soldPrice === undefined
        ? '未记录'
        : formatCurrency(Number(current.soldPrice)),
    });
  }
  if (current.status === 'retired') {
    rows.push({
      label: '退役日期',
      value: current.retiredDate ? formatDate(current.retiredDate) : '未记录',
      plain: true,
    });
  }
  return rows;
});

const canRecordUsage = computed(
  () => asset.value?.calcType === 'count' && asset.value?.status === 'active'
);

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

const formatDateTime = (timestamp: number | string) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const showImagePreviewState = ref(false);
let imagePreviewInstance: { close: () => void } | null | undefined = null;
const showAssetForm = ref(false);
const showUsageDialog = ref(false);
const usageDescription = ref('');
const usageHistory = ref<any[]>([]);
const historyLoading = ref(false);

preventBack(showAssetForm);
preventBack(showUsageDialog);
preventBack(showImagePreviewState);

watch(showImagePreviewState, visible => {
  if (!visible && imagePreviewInstance) {
    imagePreviewInstance.close();
    imagePreviewInstance = null;
  }
});

const loadAsset = async () => {
  await store.loadData();
};

const loadHistory = async () => {
  if (!asset.value || asset.value.calcType !== 'count') {
    usageHistory.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    usageHistory.value = await getUsageRecords(asset.value.id, {
      targetType: 'asset',
      actionType: 'increment_usage',
    });
  } catch (error) {
    console.error(error);
    usageHistory.value = [];
  } finally {
    historyLoading.value = false;
  }
};

onMounted(async () => {
  await loadAsset();
  await loadHistory();
});

const onClickLeft = () => {
  router.back();
};

const previewImage = () => {
  if (!imageSrc.value) return;
  showImagePreviewState.value = true;
  imagePreviewInstance = showImagePreview({
    images: [imageSrc.value],
    closeable: true,
    onClose: () => {
      showImagePreviewState.value = false;
      imagePreviewInstance = null;
    },
  }) as unknown as { close: () => void };
};

const openEdit = () => {
  showAssetForm.value = true;
};

const openUsageDialog = () => {
  if (!canRecordUsage.value) return;
  usageDescription.value = '';
  showUsageDialog.value = true;
};

const confirmUsage = async () => {
  if (!asset.value || !canRecordUsage.value) return;
  try {
    await addUsageRecord({
      targetId: asset.value.id,
      targetType: 'asset',
      actionType: 'increment_usage',
      description: usageDescription.value,
    });
    await store.updateAsset(asset.value.id, { usageCount: asset.value.usageCount + 1 });
    await loadAsset();
    await loadHistory();
    showUsageDialog.value = false;
    showToast('记录成功');
  } catch (error) {
    console.error(error);
    showToast('操作失败');
  }
};

const handleSaved = () => {
  // 先关闭编辑弹层，避免 preventBack 的路由守卫拦截跳转
  showAssetForm.value = false;
  // 保存成功后回到列表页，列表激活时会自行重新拉取数据
  router.replace('/asset/list');
};

const handleDelete = () => {
  if (!asset.value) return;
  const id = asset.value.id;
  showConfirmDialog({
    title: '确认删除',
    message: '删除后无法恢复，确认删除吗？',
  })
    .then(async () => {
      await store.deleteAsset(id);
      showToast('删除成功');
      router.back();
    })
    .catch(() => {});
};
</script>

<style scoped lang="scss">
@use '@/styles/breakpoints.scss' as *;

.van-nav-bar__placeholder > :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-detail {
  min-height: 100vh;
  background: #f6f7f9;
  padding-bottom: var(--footer-area-height);
}

:deep(.van-nav-bar__title) {
  max-width: none;
  margin: 0;
  padding: 0 84px 0 44px;
  box-sizing: border-box;
  text-align: left;
}

.asset-page-title {
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

.detail-hero {
  height: 220px;
  overflow: hidden;
  background: #f1f3f6;
}

.hero-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a3a8af;
}

.detail-sheet {
  position: relative;
  z-index: 2;
  margin-top: -20px;
  padding: 18px 16px 30px;
  background: #fff;
  border-radius: 16px 16px 0 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .asset-name {
    min-width: 0;
    flex: 1;
    color: #23262b;
    font-size: 19px;
    font-weight: 600;
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

.asset-description {
  margin-top: 8px;
  color: #5c6169;
  font-size: 13px;
  line-height: 1.6;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0;
}

.metric {
  padding: 12px;
  background: #f6f7f9;
  border-radius: 10px;

  .metric-label {
    color: #8f949c;
    font-size: 12px;
  }

  .metric-value {
    overflow: hidden;
    margin-top: 6px;
    color: #23262b;
    font-family: 'DIN Alternate', 'SF Mono', ui-monospace, Menlo, monospace;
    font-size: 18px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.profit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f2f3f5;
  color: #5c6169;
  font-size: 14px;

  .profit-up {
    color: #ee0a24;
  }

  .profit-down {
    color: #07c160;
  }
}

.kv-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #f2f3f5;
  font-size: 14px;

  &:last-child {
    border-bottom: 0;
  }

  .kv-label {
    flex: 0 0 auto;
    color: #5c6169;
  }

  .kv-value {
    min-width: 0;
    color: #23262b;
    font-family: 'DIN Alternate', 'SF Mono', ui-monospace, Menlo, monospace;
    font-weight: 500;
    text-align: right;
    word-break: break-all;

    &.plain {
      font-weight: 400;
    }
  }
}

.usage-section {
  margin-top: 18px;
}

.usage-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #23262b;
  font-size: 14px;
  font-weight: 600;

  small {
    color: #8f949c;
    font-size: 12px;
    font-weight: 400;
  }
}

.usage-readonly-tip,
.usage-empty {
  color: #8f949c;
  font-size: 12px;
  line-height: 1.7;
}

.usage-readonly-tip {
  margin-bottom: 6px;
}

.usage-loading {
  display: flex;
  justify-content: center;
  padding: 18px 0;
}

.usage-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid #f2f3f5;
  color: #5c6169;
  font-size: 13px;

  span:first-child {
    flex: 0 0 auto;
  }

  span:last-child {
    min-width: 0;
    text-align: right;
  }
}

.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;

  .van-button {
    flex: 1;
    height: 40px;
    border-radius: 8px;
    font-size: 13px;
  }

  &.stacked {
    margin-top: 10px;
  }
}

@include desktop {
  .asset-detail {
    min-height: 100%;
  }

  .detail-hero,
  .detail-sheet {
    max-width: 860px;
    margin-right: auto;
    margin-left: auto;
  }

  .detail-sheet {
    margin-top: -18px;
  }
}
</style>
