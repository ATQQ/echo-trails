<template>
  <van-swipe-cell>
    <div class="asset-item" @click="$emit('click-body', item)">
      <div class="item-image">
        <van-image
          width="60"
          height="60"
          radius="8"
          :src="imageSrc"
          fit="cover"
          @click.stop="previewImage"
        />
      </div>
      <div class="item-info">
        <div class="item-header">
          <div class="item-name">{{ item.name }}</div>
          <van-tag plain type="primary" v-if="item.subCategoryName">{{ item.subCategoryName }}</van-tag>
        </div>
        <div class="cost-per-use">
          <template v-if="item.calcType === 'count'">
            {{ formatCurrency(item.costPerUse || 0) }}/{{ item.usageCount > 0 ? '次' : '未用' }}
          </template>
          <template v-else-if="item.calcType === 'day'">
            {{ formatCurrency(item.costPerDay || 0) }}/天
          </template>
          <template v-else>
            消耗品
          </template>
        </div>
        <div class="details">
          <span>{{ formatCurrency(item.price) }}</span>
          <span class="separator">•</span>
          <span>已持有 {{ item.daysHeld || 0 }} 天</span>
          <template v-if="item.calcType === 'count'">
              <span class="separator">•</span>
              <span>已用 {{ item.usageCount }} 次</span>
          </template>
        </div>
      </div>
      <div class="item-action">
        <van-button v-if="item.calcType === 'count'" icon="plus" round type="success" size="small" @click.stop="$emit('increment', item.id)" />
      </div>
    </div>
    <template #right>
       <van-button square text="编辑" type="primary" class="swipe-btn" @click.stop="$emit('edit', item)" />
       <van-button square text="删除" type="danger" class="swipe-btn" @click.stop="$emit('delete', item.id)" />
    </template>
  </van-swipe-cell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Asset } from '@/stores/asset';
import { showImagePreview } from 'vant';
import { formatCurrency } from '@/lib/format';

// Extend Asset type to include cover if it comes from backend
interface ExtendedAsset extends Asset {
  cover?: string;
  subCategoryName?: string;
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
  if (!key) return 'https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg';
  if (key.startsWith('http')) return key;
  
  // Fallback to client-side generation
  const cdn = import.meta.env.VITE_BITIFUL_CDN || '';
  return `${cdn}/${key}?style=cover`;
});

const previewImage = () => {
  const src = imageSrc.value;
  if (!src) return;
  showImagePreview([src]);
};
</script>

<style scoped lang="scss">
.asset-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  // Important: swipe-cell wrapper needs to handle margin if item has it.
  // Actually, better to move margin to wrapper or swipe-cell container.
  // But van-swipe-cell doesn't have margin prop.
  // Let's keep it here but ensure click works.
}

.item-image {
  margin-right: 12px;
  flex-shrink: 0;
}

.item-info {
  flex: 1;

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;

    .item-name {
       font-weight: bold;
       color: #323233;
    }
  }

  .cost-per-use {
    font-size: 16px;
    font-weight: 600;
    color: #323233;
    margin-bottom: 4px;
  }

  .details {
    font-size: 12px;
    color: #969799;

    .separator {
      margin: 0 4px;
    }
  }
}

.item-action {
  margin-left: 8px;
}

.swipe-btn {
  height: 100%;
}
</style>
