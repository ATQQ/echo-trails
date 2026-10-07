<template>
  <div class="asset-manage">
    <van-nav-bar left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #title>
        <div class="asset-page-title">
          <span>分类与设置</span>
          <small>管理分类和子分类</small>
        </div>
      </template>
    </van-nav-bar>

    <div class="manage-content">
      <section class="manage-intro">
        <strong>分类</strong>
        <p>系统分类不可删除；删除自定义分类会同时删除其下所有子分类。</p>
      </section>

      <section v-for="cat in store.categories" :key="cat.id" class="category-card">
        <div class="category-head">
          <span class="category-name">{{ cat.name }}</span>
          <span class="category-kind" :class="{ system: cat.isSystem }">
            {{ cat.isSystem ? '系统' : '自定义' }}
          </span>
        </div>
        <div class="sub-tag-list">
          <template v-if="cat.isSystem">
            <span v-for="sub in cat.subCategories" :key="sub.id" class="sub-tag">
              {{ sub.name }}
            </span>
          </template>
          <template v-else>
            <button
              v-for="sub in cat.subCategories"
              :key="sub.id"
              type="button"
              class="sub-tag sub-tag--removable"
              @click.stop="handleRemoveSubCategory(cat.id, sub.id)"
            >
              {{ sub.name }} <span>×</span>
            </button>
          </template>
          <button type="button" class="add-sub-tag" @click="openAddSub(cat.id)">
            <van-icon name="plus" size="13" />
            添加
          </button>
        </div>
        <div v-if="!cat.isSystem" class="category-danger">
          <van-button plain type="danger" size="small" @click="handleRemoveCategory(cat.id)">
            删除该分类
          </van-button>
        </div>
      </section>

      <button type="button" class="add-category-button" @click="showAddCategory = true">
        <van-icon name="plus" size="16" />
        添加主分类
      </button>
    </div>

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
import { preventBack } from '@/lib/router';

const router = useRouter();
const store = useAssetStore();

onMounted(() => {
    if (store.categories.length === 0) {
        store.loadData();
    }
});

const showAddCategory = ref(false);
const newCategoryName = ref('');

const showAddSubCategory = ref(false);
const newSubCategoryName = ref('');
const currentCategoryId = ref('');
preventBack(showAddCategory);
preventBack(showAddSubCategory);

const onClickLeft = () => {
  router.back();
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
@use '@/styles/breakpoints.scss' as *;

.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-manage {
  background-color: #f6f7f9;
  min-height: 100vh;
  padding-bottom: var(--footer-area-height);
}

.manage-content {
  padding: 14px;
}

.manage-intro,
.category-card {
  margin-bottom: 12px;
  padding: 15px 16px;
  border: 1px solid #eceef1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(35, 38, 43, 0.04);
}

.manage-intro {
  strong {
    color: #23262b;
    font-size: 14px;
  }

  p {
    margin: 6px 0 0;
    color: #8f949c;
    font-size: 12px;
    line-height: 1.6;
  }
}

.category-card {
  padding: 0;
}

.category-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;

  .category-name {
    flex: 1;
    min-width: 0;
    color: #23262b;
    font-size: 14px;
    font-weight: 500;
  }
}

.category-kind {
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f8ef;
  color: #07c160;
  font-size: 11px;
  font-weight: 500;

  &.system {
    background: #f1f3f6;
    color: #8f949c;
  }
}

.sub-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 16px 14px;
}

.sub-tag,
.add-sub-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: #f1f3f6;
  color: #5c6169;
  font-size: 11px;
  line-height: 1;
}

.sub-tag--removable {
  border: 0;

  span {
    color: #8f949c;
    font-size: 14px;
  }
}

.add-sub-tag {
  border: 1px dashed #e3e6ea;
  background: #fff;
  color: #1989fa;
}

.category-danger {
  padding: 12px 16px;
  border-top: 1px solid #f2f3f5;

  :deep(.van-button) {
    height: 32px;
    border-radius: 8px;
  }
}

.add-category-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 42px;
  margin: 2px 0 8px;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  background: #fff;
  color: #5c6169;
  font-size: 13px;
  font-weight: 500;
}

@include desktop {
  .asset-manage {
    min-height: 100%;
  }

  .manage-content {
    width: 100%;
    max-width: 860px;
    margin: 16px auto;
    padding: 0 18px 24px;
    box-sizing: border-box;
  }
}
</style>
