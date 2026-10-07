<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="ev-scope ev-popup-sheet"
    @update:show="onPopupShow"
  >
    <section class="sheet tpl-sheet" role="dialog" aria-modal="true" aria-label="常用模板">
      <div class="sheet__grab" aria-hidden="true" />
      <div class="sheet__body">
        <div class="sheet__title">常用模板</div>
        <div class="sheet__sub">勾选后一键导入，已经有的会自动跳过</div>

        <div class="tpl-body">
          <section v-for="group in EVENT_TEMPLATE_GROUPS" :key="group.title" class="tpl-group">
            <span class="field__label">{{ group.title }}</span>
            <div class="tpl-grid">
              <button
                v-for="item in group.items"
                :key="item.key"
                type="button"
                class="tpl-item"
                :class="{ 'is-active': picked.has(item.key), 'is-taken': isTaken(item) }"
                :disabled="isTaken(item)"
                @click="toggle(item.key)"
              >
                <span class="tpl-item__emoji">{{ item.emoji }}</span>
                <span class="tpl-item__name">{{ item.name }}</span>
                <span class="tpl-item__meta">{{ isTaken(item) ? '已有' : metaOf(item) }}</span>
                <van-icon v-if="picked.has(item.key)" class="tpl-item__check" name="success" size="14" />
              </button>
            </div>
          </section>
        </div>

        <div class="sheet__actions">
          <button
            type="button"
            class="btn btn--ghost"
            :disabled="!picked.size"
            @click="clear"
          >
            清空
          </button>
          <button
            type="button"
            class="btn btn--primary btn--block"
            :disabled="!picked.size || importing"
            @click="submit"
          >
            {{ importing ? '导入中…' : `导入 ${picked.size} 个` }}
          </button>
        </div>
      </div>
    </section>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  EVENT_TEMPLATE_GROUPS,
  type EventTemplate,
} from '@/constants/eventTemplates';

const props = withDefaults(defineProps<{
  show: boolean;
  importing?: boolean;
  /** 当前家人已有的事件名，用来标记「已有」并禁止重复勾选 */
  existingNames?: string[];
}>(), {
  importing: false,
  existingNames: () => [],
});

const emit = defineEmits<{
  close: [];
  import: [templates: EventTemplate[]];
}>();

const picked = ref<Set<string>>(new Set());

const isTaken = (item: EventTemplate) =>
  props.existingNames.some((name) => name.trim() === item.name.trim());

const metaOf = (item: EventTemplate) =>
  item.unit ? `默认 ${item.defaultAmount ?? 1}${item.unit}` : '一次';

function toggle(key: string) {
  const next = new Set(picked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  picked.value = next;
}

function clear() {
  picked.value = new Set();
}

function close() {
  emit('close');
}

function onPopupShow(value: boolean) {
  if (!value) close();
}

function submit() {
  const selected: EventTemplate[] = [];
  for (const group of EVENT_TEMPLATE_GROUPS) {
    for (const item of group.items) {
      if (picked.value.has(item.key)) selected.push(item);
    }
  }
  if (!selected.length) return;
  emit('import', selected);
}

// 每次打开都从空选开始，避免上次的勾选残留
watch(
  () => props.show,
  (show) => {
    if (show) clear();
  },
);
</script>

<style scoped lang="scss">
.tpl-sheet {
  display: flex;
  flex-direction: column;
  max-height: 82vh;
  overflow: hidden;
}

/* 让中间内容区拿到确定高度，模板列表才能在弹窗内独立滚动 */
.tpl-sheet .sheet__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tpl-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 12px 0;
}

.tpl-group + .tpl-group {
  margin-top: 16px;
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.tpl-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms var(--ease), background 150ms var(--ease);

  &:hover {
    border-color: #c7dcf6;
  }

  &.is-active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &.is-taken {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.tpl-item__emoji {
  font-size: 20px;
  line-height: 1.1;
}

.tpl-item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-item__meta {
  font-size: 11px;
  color: var(--ink-3);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-item__check {
  position: absolute;
  top: 6px;
  right: 6px;
  color: var(--accent);
}
</style>
