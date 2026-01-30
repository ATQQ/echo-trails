<template>
  <div class="asset-manage">
    <van-nav-bar title="资产管理" left-arrow @click-left="onClickLeft" fixed placeholder />

    <van-cell-group inset title="分类管理" style="margin-top: 16px;">
      <van-collapse v-model="activeCollapse" accordion>
        <van-collapse-item v-for="cat in store.categories" :key="cat.id" :name="cat.id" :title="cat.name">
          <!-- Sub Categories List -->
          <van-cell-group :border="false">
             <van-swipe-cell v-for="sub in cat.subCategories" :key="sub.id" :disabled="!!sub.isSystem">
                <van-cell :title="sub.name" size="normal" />
                <template #right>
                  <van-button square type="danger" text="删除" size="small" @click="handleRemoveSubCategory(cat.id, sub.id)" />
                </template>
             </van-swipe-cell>
             <van-cell title="添加子分类" icon="plus" class="add-btn" @click="openAddSub(cat.id)" />
          </van-cell-group>

          <!-- Category Actions -->
          <div class="cat-actions" v-if="!cat.isSystem">
             <van-button size="small" type="danger" plain block @click="handleRemoveCategory(cat.id)">删除该分类</van-button>
          </div>
          <div class="cat-actions" v-else>
             <div class="system-tip">系统分类不可删除</div>
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore } from '@/stores/asset';
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant';

const router = useRouter();
const store = useAssetStore();

onMounted(() => {
    if (store.categories.length === 0) {
        store.loadData();
    }
});

const activeCollapse = ref('');
const showAddCategory = ref(false);
const newCategoryName = ref('');

const showAddSubCategory = ref(false);
const newSubCategoryName = ref('');
const currentCategoryId = ref('');

const onClickLeft = () => {
  router.push('/discovery');
};

const handleAddCategory = async () => {
  if (newCategoryName.value) {
    showLoadingToast({ message: '添加中...', forbidClick: true });
    try {
        await store.addCategory(newCategoryName.value);
        newCategoryName.value = '';
        closeToast();
        showToast('添加成功');
    } catch (e) {
        closeToast();
        showToast('添加失败');
    }
  }
};

const handleRemoveCategory = async (id: string) => {
    showConfirmDialog({
        title: '确认删除',
        message: '删除分类将同时删除其下所有子分类，确认删除吗？',
    }).then(async () => {
        showLoadingToast({ message: '删除中...', forbidClick: true });
        try {
            await store.removeCategory(id);
            closeToast();
            showToast('删除成功');
        } catch (e: any) {
            closeToast();
            showToast(e.message || '删除失败');
        }
    }).catch(() => {});
};

const openAddSub = (catId: string) => {
  currentCategoryId.value = catId;
  showAddSubCategory.value = true;
};

const handleAddSubCategory = async () => {
  if (newSubCategoryName.value && currentCategoryId.value) {
    showLoadingToast({ message: '添加中...', forbidClick: true });
    try {
        await store.addSubCategory(currentCategoryId.value, newSubCategoryName.value);
        newSubCategoryName.value = '';
        closeToast();
        showToast('添加成功');
    } catch (e) {
        closeToast();
        showToast('添加失败');
    }
  }
};

const handleRemoveSubCategory = async (catId: string, subId: string) => {
    showConfirmDialog({
        title: '确认删除',
        message: '确认删除该子分类吗？',
    }).then(async () => {
        showLoadingToast({ message: '删除中...', forbidClick: true });
        try {
            await store.removeSubCategory(catId, subId);
            closeToast();
            showToast('删除成功');
        } catch (e: any) {
            closeToast();
            showToast(e.message || '删除失败');
        }
    }).catch(() => {});
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

  .system-tip {
     color: #999;
     font-size: 12px;
     text-align: center;
  }
}
</style>
