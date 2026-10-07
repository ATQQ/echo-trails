<template>
  <van-swipe-cell class="asset-swipe-cell">
    <article class="asset-item" @click="$emit('click-body', item)">
      <button
        type="button"
        class="item-image"
        aria-label="预览图片"
        @click.stop="previewImage"
      >
        <van-image
          width="58"
          height="58"
          radius="10"
          :src="imageSrc"
          fit="cover"
        />
      </button>
      <div class="item-info">
        <div class="item-header">
          <div class="item-name">{{ item.name }}</div>
          <span class="item-status" :class="`item-status--${item.status}`">{{ statusLabel }}</span>
        </div>
        <div class="item-meta">
          <span v-if="categoryText">{{ categoryText }}</span>
          <span>
            购入 {{ formatDateValue(item.purchaseDate) }}<template
              v-if="item.status === 'retired' && item.retiredDate"
            > · 退役 {{ formatDateValue(item.retiredDate) }}</template>
          </span>
        </div>
      </div>
      <div class="item-side">
        <div class="item-number" :class="metricClass">
          <span>{{ metricValue }}</span>
          <small>{{ metricLabel }}</small>
        </div>
        <button
          v-if="item.calcType === 'count' && item.status === 'active'"
          type="button"
          class="quick-use"
          aria-label="记录一次"
          @click.stop="$emit('increment', item.id)"
        >
          <van-icon name="plus" size="17" />
        </button>
      </div>
    </article>
    <template #right>
      <van-button square text="编辑" type="primary" class="swipe-btn" @click.stop="$emit('edit', item)" />
      <van-button square text="删除" type="danger" class="swipe-btn" @click.stop="$emit('delete', item.id)" />
    </template>
  </van-swipe-cell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Asset } from '@/stores/asset';
import { showImagePreview } from 'vant';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { preventBack } from '@/lib/router';

// Extend Asset type to include cover if it comes from backend
interface ExtendedAsset extends Asset {
  cover?: string;
  categoryName?: string;
  subCategoryName?: string;
  preview?: string;
}

const props = defineProps<{
  item: ExtendedAsset;
}>();

const emit = defineEmits<{
  (e: 'increment', id: string): void;
  (e: 'click-body', item: ExtendedAsset): void;
  (e: 'edit', item: ExtendedAsset): void;
  (e: 'delete', id: string): void;
}>();

const imageSrc = computed(() => {
  // Prefer backend generated cover link
  if (props.item.cover) return props.item.cover;

  const key = props.item.image;
  if (!key) return '/assets/images/asset-placeholder.svg';
  if (key.startsWith('http')) return key;
  if (key.startsWith('/')) return key;

  // Fallback to client-side generation
  const cdn = import.meta.env.VITE_BITIFUL_CDN || '';
  return cdn ? `${cdn}/${key}?style=cover` : '/assets/images/asset-placeholder.svg';
});

const hasSoldPrice = computed(
  () => props.item.soldPrice !== null && props.item.soldPrice !== undefined
);

const profitValue = computed(() => {
  if (props.item.status !== 'sold') return undefined;
  if (!hasSoldPrice.value) return undefined;
  return Number(props.item.soldPrice) - Number(props.item.price || 0);
});

const categoryText = computed(() => {
  const parts = [props.item.categoryName, props.item.subCategoryName].filter(Boolean);
  return parts.join(' · ');
});
const statusLabel = computed(() => {
  if (props.item.status === 'sold') return '已卖出';
  if (props.item.status === 'retired') return '已退役';
  return '服役中';
});

const metricValue = computed(() => {
  if (props.item.status === 'sold') {
    return profitValue.value === undefined ? '未记录' : formatSignedCurrency(profitValue.value);
  }
  if (props.item.calcType === 'count') return formatCurrency(props.item.costPerUse || 0);
  if (props.item.calcType === 'day') return formatCurrency(props.item.costPerDay || 0);
  return '消耗品';
});

const metricLabel = computed(() => {
  if (props.item.status === 'sold') {
    return hasSoldPrice.value
      ? `卖出 ${formatCurrency(Number(props.item.soldPrice))}`
      : '已卖出';
  }
  if (props.item.calcType === 'count') {
    return props.item.usageCount > 0 ? `已用 ${props.item.usageCount} 次` : '尚未使用';
  }
  if (props.item.calcType === 'day') {
    return `持有 ${props.item.daysHeld || 0} 天`;
  }
  return '不按次 / 不按天';
});

const metricClass = computed(() => {
  if (props.item.status !== 'sold' || profitValue.value === undefined) return '';
  return profitValue.value >= 0 ? 'is-profit' : 'is-loss';
});

const formatDateValue = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

const showImagePreviewState = ref(false);
let imagePreviewInstance: { close: () => void } | null | undefined = null;
preventBack(showImagePreviewState);

watch(showImagePreviewState, (visible) => {
  if (!visible && imagePreviewInstance) {
    imagePreviewInstance.close();
    imagePreviewInstance = null;
  }
});

const previewImage = () => {
  const src = props.item.preview || imageSrc.value;
  if (!src) return;
  showImagePreviewState.value = true;
  imagePreviewInstance = showImagePreview({
    images: [src],
    closeable: true,
    onClose: () => {
      showImagePreviewState.value = false;
      imagePreviewInstance = null;
    }
  }) as unknown as { close: () => void };
};
</script>

<style scoped lang="scss">
.asset-swipe-cell {
  display: block;
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid #eceef1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
  box-sizing: border-box;
}

.item-image {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid #eceef1;
  border-radius: 10px;
  background: #f1f3f6;
  overflow: hidden;
}

.item-info {
  flex: 1;
  min-width: 0;

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;

    .item-name {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      color: #23262b;
      font-size: 15px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .item-status {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;

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

  .item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-top: 5px;
    font-size: 12px;
    color: #8f949c;
  }

}

.item-side {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  align-self: stretch;
  justify-content: center;
}

.item-number {
  color: #23262b;
  font-family: 'DIN Alternate', 'SF Mono', ui-monospace, Menlo, monospace;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;

  small {
    display: block;
    margin-top: 4px;
    color: #8f949c;
    font-family: inherit;
    font-size: 11px;
    font-weight: 400;
  }

  &.is-profit {
    color: #ee0a24;
  }

  &.is-loss {
    color: #07c160;
  }
}

.quick-use {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: rgba(25, 137, 250, 0.1);
  color: #1989fa;
}

.swipe-btn {
  height: 100%;
}
</style>
