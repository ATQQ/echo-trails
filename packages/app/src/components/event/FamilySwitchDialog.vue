<template>
  <van-popup
    :show="show"
    position="center"
    overlay-class="ev-overlay"
    class="ev-scope ev-popup-dialog"
    @update:show="onPopupShow"
  >
    <section class="dialog dialog--family" role="dialog" aria-modal="true" aria-label="切换家人">
      <div class="dialog-title-row">
        <div>
          <h3>切换家人</h3>
          <p>记录与统计都按家人分开</p>
        </div>
        <button type="button" class="icon-btn" aria-label="关闭" @click="close">
          <van-icon name="cross" size="16" />
        </button>
      </div>

      <ul class="family-list">
        <li v-for="item in familyOptions" :key="item.value">
          <button
            type="button"
            class="family-row"
            :class="{ 'is-active': item.value === current }"
            :aria-pressed="item.value === current"
            @click="pick(item.value)"
          >
            <span class="family-avatar family-avatar--lg" aria-hidden="true">
              {{ item.text.slice(0, 1) }}
            </span>
            <span class="family-row__main">
              <span class="family-row__name">{{ item.text }}</span>
              <span class="family-row__hint">
                {{ item.value === current ? '当前查看' : '点一下切到这个家人' }}
              </span>
            </span>
            <van-icon v-if="item.value === current" name="success" size="18" />
          </button>
        </li>
      </ul>

      <ul class="family-list family-list--actions">
        <li>
          <button type="button" class="family-row family-row--action" @click="openNameDialog('add')">
            <van-icon name="plus" size="18" />
            <span class="family-row__main">添加家人</span>
          </button>
        </li>
        <li v-if="current !== 'default'">
          <button type="button" class="family-row family-row--action" @click="openNameDialog('edit')">
            <van-icon name="edit" size="18" />
            <span class="family-row__main">编辑「{{ currentName }}」</span>
          </button>
        </li>
        <li v-if="current !== 'default'">
          <button
            type="button"
            class="family-row family-row--action family-row--danger"
            @click="removeCurrent"
          >
            <van-icon name="delete-o" size="18" />
            <span class="family-row__main">移除「{{ currentName }}」</span>
          </button>
        </li>
      </ul>
    </section>
  </van-popup>

  <van-popup
    v-model:show="showNameDialog"
    position="center"
    overlay-class="ev-overlay"
    class="ev-scope ev-popup-dialog"
  >
    <section class="dialog" role="dialog" aria-modal="true">
      <h3>{{ nameMode === 'add' ? '添加家人' : '修改名称' }}</h3>
      <p>记录与统计都会按这个家人单独保存</p>
      <input
        v-model="nameInput"
        class="text-input"
        maxlength="12"
        :placeholder="nameMode === 'add' ? '请输入昵称' : '请输入新的昵称'"
        @keyup.enter="confirmName"
      />
      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost btn--block" @click="showNameDialog = false">
          取消
        </button>
        <button type="button" class="btn btn--primary btn--block" @click="confirmName">确定</button>
      </div>
    </section>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useFamily } from '@/composables/useFamily';
import { preventBack } from '@/lib/router';

const props = withDefaults(defineProps<{
  show: boolean;
  current?: string;
}>(), {
  current: 'default',
});

const emit = defineEmits<{ close: []; switch: [familyId: string] }>();

const { store, familyOptions, handleAddFamily, handleUpdateFamily, handleDeleteFamily } = useFamily();

const showNameDialog = ref(false);
const nameMode = ref<'add' | 'edit'>('add');
const nameInput = ref('');
const saving = ref(false);

const currentName = computed(
  () => familyOptions.value.find((f) => f.value === props.current)?.text || props.current,
);

const close = () => emit('close');

const onPopupShow = (value: boolean) => {
  if (!value) close();
};

function pick(familyId: string) {
  if (familyId !== props.current) emit('switch', familyId);
  close();
}

function openNameDialog(mode: 'add' | 'edit') {
  nameMode.value = mode;
  nameInput.value = mode === 'edit' ? currentName.value : '';
  showNameDialog.value = true;
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.ev-popup-dialog .text-input');
    el?.focus();
  });
}

async function confirmName() {
  if (saving.value) return;
  const name = nameInput.value.trim();
  if (!name) return;
  saving.value = true;
  try {
    if (nameMode.value === 'add') {
      const ok = await handleAddFamily(name);
      if (!ok) return;
      showNameDialog.value = false;
      emit('switch', store.currentFamily.familyId);
      close();
    } else {
      const ok = await handleUpdateFamily(props.current, name);
      if (!ok) return;
      showNameDialog.value = false;
    }
  } finally {
    saving.value = false;
  }
}

async function removeCurrent() {
  if (props.current === 'default') return;
  const ok = await handleDeleteFamily(props.current);
  if (ok) {
    emit('switch', 'default');
    close();
  }
}

watch(
  () => props.show,
  (value) => {
    if (!value) showNameDialog.value = false;
  },
);

// 嵌套的添加 / 编辑弹窗也要吃返回键
preventBack(showNameDialog);
</script>
