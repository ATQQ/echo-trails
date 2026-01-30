<template>
  <div class="asset-manage">
    <van-nav-bar title="资产管理" left-arrow @click-left="onClickLeft" fixed placeholder />

    <van-cell-group inset title="分类管理" style="margin-top: 16px;">
      <van-collapse v-model="activeCollapse" accordion>
        <van-collapse-item v-for="cat in store.categories" :key="cat.id" :name="cat.id" :title="cat.name">
          <!-- Sub Categories List -->
          <van-cell-group :border="false">
            <van-swipe-cell v-for="sub in cat.subCategories" :key="sub.id">
              <van-cell :title="sub.name" size="normal" />
              <template #right>
                <van-button square type="danger" text="删除" size="small"
                  @click="store.removeSubCategory(cat.id, sub.id)" />
              </template>
            </van-swipe-cell>
            <van-cell title="添加子分类" icon="plus" class="add-btn" @click="openAddSub(cat.id)" />
          </van-cell-group>

          <!-- Category Actions -->
          <div class="cat-actions">
            <van-button size="small" type="danger" plain block @click="store.removeCategory(cat.id)">删除该分类</van-button>
          </div>
        </van-collapse-item>
      </van-collapse>

      <van-cell title="添加主分类" icon="plus" is-link @click="showAddCategory = true" />
    </van-cell-group>

    <!-- Add Main Category Dialog -->
    <van-dialog v-model:show="showAddCategory" title="添加分类" show-cancel-button @confirm="handleAddCategory">
      <van-field v-model="newCategoryName" placeholder="请输入分类名称" />
    </van-dialog>

    <!-- Add Sub Category Dialog -->
    <van-dialog v-model:show="showAddSubCategory" title="添加子分类" show-cancel-button @confirm="handleAddSubCategory">
      <van-field v-model="newSubCategoryName" placeholder="请输入子分类名称" />
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';

const router = useRouter();
const store = useAssetStore();

const activeCollapse = ref('');
const showAddCategory = ref(false);
const newCategoryName = ref('');

const showAddSubCategory = ref(false);
const newSubCategoryName = ref('');
const currentCategoryId = ref('');

const onClickLeft = () => {
  router.push('/discovery');
};

const handleAddCategory = () => {
  if (newCategoryName.value) {
    store.addCategory(newCategoryName.value);
    newCategoryName.value = '';
  }
};

const openAddSub = (catId: string) => {
  currentCategoryId.value = catId;
  showAddSubCategory.value = true;
};

const handleAddSubCategory = () => {
  if (newSubCategoryName.value && currentCategoryId.value) {
    store.addSubCategory(currentCategoryId.value, newSubCategoryName.value);
    newSubCategoryName.value = '';
  }
};
</script>

<style scoped lang="scss">
.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}
.asset-manage {
  background-color: #f7f8fa;
  min-height: 100vh;
}

.add-btn {
  color: #1989fa;
  text-align: center;

  :deep(.van-cell__title) {
    flex: none;
  }
}

.cat-actions {
  padding: 10px 16px;
  border-top: 1px solid #ebedf0;
}
</style>
