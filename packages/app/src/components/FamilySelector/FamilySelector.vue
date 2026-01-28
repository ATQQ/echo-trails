<template>
  <div class="family-selector">
    <span class="action-icon add-family" @click="openAddDialog">
      <van-icon name="plus" />
    </span>
    <van-dropdown-menu :active-color="activeColor">
      <van-dropdown-item v-model="currentFamilyId" :options="familyOptions" />
    </van-dropdown-menu>

    <span class="action-icon edit-family-name" @click="openEditDialog">
      <van-icon name="edit" />
    </span>

    <span v-if="canDeleteComputed" class="action-icon delete-family-name" @click="onDelete">
      <van-icon name="delete" />
    </span>

    <!-- Edit Dialog -->
    <van-dialog v-model:show="showEdit" title="信息修改" show-cancel-button @confirm="confirmEdit">
      <van-field v-model="editName" autofocus label="名称" placeholder="请输入新的名称" />
    </van-dialog>

    <!-- Add Dialog -->
    <van-dialog v-model:show="showAdd" title="添加家人" :confirm-button-color="activeColor" show-cancel-button
      @open="onOpenAddDialog" @confirm="confirmAdd">
      <div class="people-dialog">
        <UnderInput v-model="newFamilyName" placeholder="昵称" tips="输入要记录的家人昵称" icon="manager-o" />
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFamily } from '@/composables/useFamily';
import UnderInput from '@/components/UnderInput/UnderInput.vue';

const props = defineProps({
  activeColor: {
    type: String,
    default: '#1989fa'
  }
});

const { store, familyOptions, currentFamilyId, handleUpdateFamily, handleDeleteFamily, handleAddFamily } = useFamily();

const showEdit = ref(false);
const editName = ref('');

const showAdd = ref(false);
const newFamilyName = ref('');

const openEditDialog = () => {
  editName.value = '';
  showEdit.value = true;
};

const confirmEdit = async () => {
  if (currentFamilyId.value === 'default') return;
  await handleUpdateFamily(currentFamilyId.value, editName.value);
};

const openAddDialog = () => {
  showAdd.value = true;
};

const onOpenAddDialog = () => {
  newFamilyName.value = '';
};

const confirmAdd = async () => {
  const success = await handleAddFamily(newFamilyName.value);
  if (success) {
    showAdd.value = false;
  }
};

const onDelete = async () => {
  if (currentFamilyId.value === 'default') return;
  await handleDeleteFamily(currentFamilyId.value);
};

const canDeleteComputed = computed(() => {
  if (currentFamilyId.value === 'default') return false;
  return store.currentFamily?.canDelete;
});

</script>

<style scoped lang="scss">
.family-selector {
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: #fff;
  height: 48px;
  position: relative;

  :deep(.van-dropdown-menu) {
    flex: 1;

    .van-dropdown-menu__bar {
      box-shadow: none;
      height: 100%;
    }
  }

  .action-icon {
    padding: 8px;
    font-size: 18px;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;

    &:active {
      opacity: 0.7;
    }
  }

  .delete-family-name {
    color: #ee0a24;
  }

  .people-dialog {
    padding: 1rem;
  }
}
</style>
