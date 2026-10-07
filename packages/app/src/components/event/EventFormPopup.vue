<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="ev-scope ev-popup-sheet ev-popup-form"
    @update:show="onPopupShow"
  >
    <section
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="event ? '编辑事件' : '添加事件'"
    >
      <div class="sheet__grab" aria-hidden="true" />
      <div class="sheet__body">
        <div class="sheet__title">{{ event ? '编辑事件' : '添加事件' }}</div>

        <div class="form">
          <button v-if="!event" type="button" class="tpl-entry" @click="emit('templates')">
            <van-icon name="apps-o" />
            <span>从常用模板一键导入</span>
            <van-icon name="arrow" />
          </button>

          <div>
            <span class="field__label">图标</span>
            <div class="emoji-row">
              <span class="emoji-preview" aria-hidden="true">{{ form.emoji || '❓' }}</span>
              <input
                v-model="form.emoji"
                class="text-input"
                maxlength="4"
                placeholder="也可以直接输入 emoji"
                @input="onEmojiInput"
              />
            </div>
            <div class="emoji-grid">
              <button
                v-for="item in EMOJIS"
                :key="item"
                type="button"
                class="emoji-opt"
                :class="{ 'is-active': form.emoji === item }"
                :aria-pressed="form.emoji === item"
                @click="form.emoji = item"
              >
                {{ item }}
              </button>
            </div>
          </div>

          <div>
            <span class="field__label">名称</span>
            <input
              v-model="form.name"
              class="text-input"
              maxlength="20"
              placeholder="如：喝水、跑步、冥想"
              @input="error = ''"
            />
            <p v-if="error" class="form-error">{{ error }}</p>
          </div>

          <div>
            <span class="field__label">单位（可选，不设置就是「一次」）</span>
            <div class="chips-scroll">
              <button
                v-for="item in UNITS"
                :key="item.label"
                type="button"
                class="chip"
                :class="{ 'is-active': form.unit === item.value }"
                :aria-pressed="form.unit === item.value"
                @click="pickUnit(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>

          <div v-if="form.unit">
            <span class="field__label">默认单次值</span>
            <input
              v-model="form.defaultInput"
              class="text-input"
              type="number"
              inputmode="decimal"
              placeholder="记录时自动带出"
            />
          </div>

          <div>
            <span class="field__label">排序</span>
            <div class="sort-hint">
              <van-icon name="wap-nav" size="16" />
              手机长按卡片 0.5 秒进入拖动排序；桌面按住直接拖
            </div>
          </div>
        </div>

        <div class="sheet__actions">
          <button
            v-if="event"
            type="button"
            class="btn btn--danger"
            @click="emit('delete')"
          >
            删除
          </button>
          <button type="button" class="btn btn--ghost btn--block" @click="close">取消</button>
          <button type="button" class="btn btn--primary btn--block" @click="submit">保存</button>
        </div>
      </div>
    </section>
  </van-popup>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { EventItem } from '@/service/event';

const props = withDefaults(defineProps<{
  show: boolean;
  event?: EventItem | null;
}>(), {
  event: null,
});

const emit = defineEmits<{
  close: [];
  save: [payload: { name: string; emoji: string; unit: string; defaultAmount: number | null }];
  delete: [];
  templates: [];
}>();

const UNITS = [
  { label: '不设置', value: '' },
  { label: '次', value: '次' },
  { label: 'ml', value: 'ml' },
  { label: '分钟', value: '分钟' },
  { label: '页', value: '页' },
  { label: '个', value: '个' },
  { label: '公里', value: '公里' },
  { label: '粒', value: '粒' },
  { label: 'mmHg', value: 'mmHg' },
  { label: 'mmol/L', value: 'mmol/L' },
];

const EMOJIS = [
  '💧', '💩', '🚽', '🚿', '🪥', '😴', '💊', '🩺',
  '🩸', '⚖️', '👀', '🏃', '🚶', '🤸', '🧘', '☀️',
  '📖', '🔤', '✍️', '💰', '💪', '🥗', '🎯', '❤️',
];

const form = reactive({ name: '', emoji: '', unit: '', defaultInput: '' });
const error = ref('');

const onEmojiInput = () => {
  const chars = [...form.emoji];
  if (chars.length > 2) form.emoji = chars.slice(0, 2).join('');
};

const pickUnit = (value: string) => {
  form.unit = value;
  if (!value) form.defaultInput = '';
};

const close = () => emit('close');

const onPopupShow = (value: boolean) => {
  if (!value) close();
};

function submit() {
  const name = form.name.trim();
  if (!name) {
    error.value = '名称不能为空';
    return;
  }
  const raw = form.defaultInput.trim();
  const parsed = raw === '' ? null : Number(raw);
  emit('save', {
    name,
    emoji: form.emoji,
    unit: form.unit,
    defaultAmount: form.unit && parsed != null && Number.isFinite(parsed) ? parsed : null,
  });
}

watch(
  () => [props.show, props.event?.id] as const,
  ([show]) => {
    if (!show) return;
    error.value = '';
    form.name = props.event?.name || '';
    form.emoji = props.event?.emoji || '';
    form.unit = props.event?.unit || '';
    form.defaultInput = props.event?.defaultAmount == null ? '' : String(props.event.defaultAmount);
  },
  { immediate: true },
);
</script>
