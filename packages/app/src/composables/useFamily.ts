import { computed, ref } from 'vue';
import { useFamilyStore } from '@/stores/family';
import { addFamily, updateFamily, deleteFamily } from '@/service/family';
import { showSuccessToast, showFailToast, showConfirmDialog } from 'vant';

export function useFamily() {
  const store = useFamilyStore();

  const familyOptions = computed(() => {
    const list = store.familyList.map(m => ({ text: m.name, value: m.familyId }));
    if (!list.find(v => v.value === 'default')) {
      list.unshift({ text: '默认', value: 'default' });
    }
    return list;
  });

  const currentFamilyId = computed({
    get: () => store.currentFamily.familyId,
    set: (val) => {
      const found = store.familyList.find(f => f.familyId === val);
      if (found) {
        store.setCurrentFamily(found);
      } else if (val === 'default') {
        store.setCurrentFamily({ familyId: 'default', name: '默认' });
      }
    }
  });

  const refreshFamilies = async () => {
    await store.fetchFamilyList();
  };

  const handleAddFamily = async (name: string) => {
    if (!name) return false;
    // Check duplicate
    if (familyOptions.value.find(v => v.text === name)) {
      showFailToast('名称已存在');
      return false;
    }

    try {
      const res = await addFamily(name);
      if (res.code === 0) {
        showSuccessToast('添加成功');
        await refreshFamilies();
        const { familyId } = res.data;
        // Switch to new family
        const found = store.familyList.find(f => f.familyId === familyId);
        if (found) {
          store.setCurrentFamily(found);
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleUpdateFamily = async (familyId: string, newName: string) => {
    if (!newName) return false;
    try {
      await updateFamily(familyId, newName);
      showSuccessToast('修改成功');
      await refreshFamilies();
      // Update current if needed (store refetch should handle list, but current object might need update if it was just modified)
      if (store.currentFamily.familyId === familyId) {
          store.setCurrentFamily({ ...store.currentFamily, name: newName });
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleDeleteFamily = async (familyId: string) => {
    try {
      await showConfirmDialog({
        title: '操作提示',
        message: '确认移除此人员？'
      });
      
      await deleteFamily(familyId);
      showSuccessToast('删除成功');
      await refreshFamilies();
      // Switch to default
      store.setCurrentFamily({ familyId: 'default', name: '默认' });
      return true;
    } catch (e) {
      // Cancelled or failed
      return false;
    }
  };

  return {
    store,
    familyOptions,
    currentFamilyId,
    refreshFamilies,
    handleAddFamily,
    handleUpdateFamily,
    handleDeleteFamily
  };
}
