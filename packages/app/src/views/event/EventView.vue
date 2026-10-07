<template>
  <div class="ev-scope ev-page" :class="{ 'ev-page--desktop': isWide }">
    <!-- 手机：顶栏 + 概览 + 分段控件 + 网格 / 统计 -->
    <div v-if="!isWide" class="m-app">
      <header class="appbar">
        <button type="button" class="icon-btn" aria-label="返回" @click="router.back()">
          <van-icon name="arrow-left" size="20" />
        </button>
        <h1>事件记录</h1>
        <button
          type="button"
          class="appbar__family"
          :aria-label="`切换家人，当前 ${familyName}`"
          aria-haspopup="dialog"
          @click="openFamily"
        >
          <span class="family-avatar" aria-hidden="true">{{ familyAvatar }}</span>
          <van-icon name="arrow-down" size="14" />
        </button>
      </header>

      <div class="m-body">
        <div class="infobar">
          <div>
            <div class="infobar__label">今天 · {{ familyName }}</div>
            <div class="infobar__count">
              <span class="fade-num">{{ todayCount }}</span>
              <span class="infobar__unit">次记录</span>
            </div>
          </div>
          <div class="infobar__streak">连续 <span class="fade-num">{{ streak }}</span> 天</div>
        </div>

        <div class="viewseg" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'record'"
            :class="{ 'is-active': tab === 'record' }"
            @click="tab = 'record'"
          >
            记录
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'stats'"
            :class="{ 'is-active': tab === 'stats' }"
            @click="tab = 'stats'"
          >
            统计
          </button>
        </div>

        <div class="m-scroll">
          <template v-if="tab === 'record'">
            <div v-if="store.loading" class="grid">
              <div v-for="i in 6" :key="i" class="skeleton-card" />
            </div>
            <div v-else-if="store.loadError" class="state-block">
              <div class="state-block__icon"><van-icon name="replay" size="24" /></div>
              <div class="state-block__title">事件加载失败</div>
              <div class="state-block__desc">{{ store.loadError }}</div>
              <button type="button" class="btn btn--primary" @click="reloadAll">重新加载</button>
            </div>
            <div v-else-if="!store.events.length" class="state-block">
              <div class="state-block__icon"><van-icon name="plus" size="24" /></div>
              <div class="state-block__title">还没有事件</div>
              <div class="state-block__desc">添加一个常用事件，点一下就能记录。</div>
              <button type="button" class="btn btn--primary" @click="openAdd">添加第一个事件</button>
            </div>
            <div v-else ref="gridRef" class="grid">
              <EventCard
                v-for="e in store.events"
                :key="e.id"
                :event="e"
                :today-count="todayCountOf(e.id)"
                :pulse="pulsingId === e.id"
                @record="handleRecord(e)"
                @menu="openMenu(e)"
              />
              <div
                class="ev-card ev-card--add"
                role="button"
                tabindex="0"
                @click="openAdd"
                @keydown.enter.prevent="openAdd"
              >
                <van-icon name="plus" size="22" />
                <span class="ev-card__name">添加事件</span>
              </div>
            </div>
          </template>

          <EventStatsSection
            v-else
            variant="mobile"
            :events="store.events"
            :records="store.records"
            :loading="store.loading"
            :filter-event-id="filterEventId"
            :range-key="store.rangeKey"
            :chart-days="chartDays"
            :streak="streak"
            :today-count="todayCount"
            @update:filter-event-id="filterEventId = $event"
            @update:range-key="onRangeChange"
            @update:chart-days="chartDays = $event"
            @go-record="onStatsGoRecord"
            @delete-record="onDeleteRecord"
          />
        </div>
      </div>
    </div>

    <!-- 桌面：左栏事件 + 右栏统计 -->
    <div v-else class="d-app">
      <aside class="d-rail">
        <div class="d-rail__head">
          <span class="d-rail__title">事件记录</span>
          <button
            type="button"
            class="rail-family"
            :aria-label="`切换家人，当前 ${familyName}`"
            aria-haspopup="dialog"
            @click="openFamily"
          >
            <span class="family-avatar" aria-hidden="true">{{ familyAvatar }}</span>
            <span class="rail-family__name">{{ familyName }}</span>
            <van-icon name="arrow-down" size="14" />
          </button>
          <button type="button" class="btn btn--primary rail-add" @click="openAdd">
            <van-icon name="plus" size="16" />
            添加
          </button>
        </div>

        <div v-if="store.loading" class="d-rail__list">
          <div v-for="i in 4" :key="i" class="skeleton-card rail-skeleton" />
        </div>
        <div v-else-if="store.loadError" class="state-block rail-state">
          <div class="state-block__title">加载失败</div>
          <div class="state-block__desc">{{ store.loadError }}</div>
          <button type="button" class="btn btn--primary" @click="reloadAll">重新加载</button>
        </div>
        <div v-else-if="!store.events.length" class="state-block rail-state">
          <div class="state-block__title">还没有事件</div>
          <div class="state-block__desc">添加一个常用事件，点一下就能记录。</div>
          <button type="button" class="btn btn--primary" @click="openAdd">添加第一个事件</button>
        </div>
        <div v-else ref="railListRef" class="d-rail__list">
          <EventRailRow
            v-for="e in store.events"
            :key="e.id"
            :event="e"
            :today-count="todayCountOf(e.id)"
            :active="activeEvent?.id === e.id"
            @record="handleRecord(e)"
            @menu="openMenu(e)"
          />
        </div>
      </aside>

      <main class="d-main">
        <div class="d-head">
          <span class="d-head__title">统计</span>
          <span class="d-head__meta">
            今天 <b class="fade-num">{{ todayCount }}</b> 次 · 连续
            <b class="fade-num">{{ streak }}</b> 天
          </span>
        </div>
        <div class="d-scroll">
          <EventStatsSection
            variant="desktop"
            :events="store.events"
            :records="store.records"
            :loading="store.loading"
            :filter-event-id="filterEventId"
            :range-key="store.rangeKey"
            :chart-days="chartDays"
            :streak="streak"
            :today-count="todayCount"
            @update:filter-event-id="filterEventId = $event"
            @update:range-key="onRangeChange"
            @update:chart-days="chartDays = $event"
            @go-record="onStatsGoRecord"
            @delete-record="onDeleteRecord"
          />
        </div>
      </main>
    </div>

    <!-- 浮层 -->
    <EventRecordPanel
      :show="showPanel"
      :event="activeEvent"
      :record="activeRecord"
      :today-count="activeEvent ? todayCountOf(activeEvent.id) : 0"
      :recent-amounts="recentAmounts"
      :variant="isWide ? 'desktop' : 'mobile'"
      :families="familyChoices"
      :family-id="store.currentFamilyId"
      :switching="movingRecord"
      @close="closePanel"
      @undo="handlePanelUndo"
      @patch="handlePanelPatch"
      @edit-event="editActiveEvent"
      @switch-family="onPanelSwitchFamily"
    />

    <EventFormPopup
      :show="showForm"
      :event="editingEvent"
      @close="showForm = false"
      @save="onFormSave"
      @delete="onFormDelete"
      @templates="openTemplatesFromForm"
    />

    <EventTemplateSheet
      :show="showTemplates"
      :importing="importingTemplates"
      :existing-names="store.events.map((e) => e.name)"
      @close="showTemplates = false"
      @import="onImportTemplates"
    />

    <!-- 事件操作菜单：手机底部 sheet，桌面居中 dialog -->
    <van-popup
      v-if="!isWide"
      v-model:show="showMenu"
      position="bottom"
      round
      class="ev-scope ev-popup-sheet"
      @closed="menuEvent = null"
    >
      <section class="sheet" role="dialog" aria-modal="true" aria-label="事件操作">
        <div class="sheet__grab" aria-hidden="true" />
        <div class="sheet__sub menu-desc">{{ menuLabel }}</div>
        <ul class="menu">
          <li v-for="item in MENU_ITEMS" :key="item.value">
            <button
              type="button"
              :class="{ 'is-danger': item.danger }"
              :disabled="item.value === 'top' && isMenuTop"
              @click="onMenuSelect(item.value)"
            >
              <van-icon :name="item.icon" size="18" />
              {{ item.label }}
            </button>
          </li>
        </ul>
        <div class="menu-foot">
          <button type="button" class="btn btn--ghost btn--block" @click="showMenu = false">取消</button>
        </div>
      </section>
    </van-popup>

    <van-popup
      v-else
      v-model:show="showMenu"
      position="center"
      overlay-class="ev-overlay"
      class="ev-scope ev-popup-dialog"
      @closed="menuEvent = null"
    >
      <section class="dialog" role="dialog" aria-modal="true" aria-label="事件操作">
        <h3>事件操作</h3>
        <div class="sheet__sub menu-desc">{{ menuLabel }}</div>
        <ul class="menu">
          <li v-for="item in MENU_ITEMS" :key="item.value">
            <button
              type="button"
              :class="{ 'is-danger': item.danger }"
              :disabled="item.value === 'top' && isMenuTop"
              @click="onMenuSelect(item.value)"
            >
              <van-icon :name="item.icon" size="18" />
              {{ item.label }}
            </button>
          </li>
        </ul>
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost btn--block" @click="showMenu = false">取消</button>
        </div>
      </section>
    </van-popup>

    <FamilySwitchDialog
      :show="showFamily"
      :current="store.currentFamilyId"
      @close="showFamily = false"
      @switch="onFamilySwitch"
    />

    <!-- 删除确认 -->
    <van-popup
      v-model:show="confirm.show"
      position="center"
      overlay-class="ev-overlay"
      class="ev-scope ev-popup-dialog"
      @closed="confirm.target = null"
    >
      <section class="dialog" role="dialog" aria-modal="true" aria-label="删除事件">
        <h3>{{ confirm.title }}</h3>
        <p>{{ confirm.message }}</p>
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost btn--block" @click="confirm.show = false">
            取消
          </button>
          <button type="button" class="btn btn--danger btn--block" @click="confirmDelete">删除</button>
        </div>
      </section>
    </van-popup>

    <EventTopToast
      :show="toast.show"
      :message="toast.message"
      :type="toast.type"
      :action-text="toast.actionText"
      :duration="toast.duration"
      :nonce="toast.nonce"
      @action="onToastAction"
      @close="onToastClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import EventCard from '@/components/event/EventCard.vue';
import EventRailRow from '@/components/event/EventRailRow.vue';
import EventRecordPanel from '@/components/event/EventRecordPanel.vue';
import EventFormPopup from '@/components/event/EventFormPopup.vue';
import EventStatsSection from '@/components/event/EventStatsSection.vue';
import FamilySwitchDialog from '@/components/event/FamilySwitchDialog.vue';
import EventTemplateSheet from '@/components/event/EventTemplateSheet.vue';
import EventTopToast from '@/components/event/EventTopToast.vue';
import { useEventStore, recordFailedMessage, type EventFormPayload } from '@/stores/event';
import { useEventSortable } from '@/composables/useEventSortable';
import { countTodayOf, streakDays, type EventRangeKey } from '@/composables/useEventStats';
import { useFamilyStore } from '@/stores/family';
import { preventBack } from '@/lib/router';
import { isLocalMode } from '@/lib/serviceRouter';
import type { EventTemplate } from '@/constants/eventTemplates';
import type { EventItem, EventRecordItem } from '@/service/event';

defineOptions({ name: 'EventView' });

const router = useRouter();
const store = useEventStore();
const familyStore = useFamilyStore();

// 页面自制断点，不动全局 useResponsive 的 480 基准
const isWide = useMediaQuery('(min-width: 768px)');

const tab = ref<'record' | 'stats'>('record');
const filterEventId = ref('all');
const chartDays = ref(7);

const familyName = computed(
  () =>
    familyStore.familyList.find((f) => f.familyId === store.currentFamilyId)?.name ||
    '默认',
);
const familyAvatar = computed(() => familyName.value.slice(0, 1) || '默');
const familyChoices = computed(() => {
  const list = familyStore.familyList.map((f) => ({ id: f.familyId, name: f.name }));
  if (!list.some((f) => f.id === 'default')) list.unshift({ id: 'default', name: '默认' });
  return list;
});

/** 切过远程/离线或删除家人后，localStorage 里可能残留无效的家人 ID。 */
function normalizeCurrentFamily() {
  if (familyChoices.value.some((f) => f.id === store.currentFamilyId)) return;
  familyStore.setCurrentFamily({ familyId: 'default', name: '默认' });
  store.currentFamilyId = 'default';
}

const todayCount = computed(() => store.todayRecords.length);
const streak = computed(() => streakDays(store.records));
const todayCountOf = (eventId: string) => countTodayOf(store.records, eventId);

async function reloadAll() {
  await store.reload();
  await seedForCurrentFamily();
}

/**
 * 该家人第一次进入、且一条事件都没有时，自动建几个常用的默认事件。
 * 首次挂载、重新加载、切换家人都要走一遍，否则切到没初始化过的家人会是空列表。
 */
async function seedForCurrentFamily() {
  if (store.loadError) return;
  const seeded = await store.seedDefaultEvents();
  if (seeded) showTopToast({ message: '已准备好常用事件，可随时编辑或删除', duration: 2600 });
  // 列表渲染出来后再补一次初始化，避免容器先于卡片出现漏建 Sortable 实例
  await nextTick();
  refreshSortable();
}

onMounted(async () => {
  if (!familyStore.familyList.length) {
    await familyStore.fetchFamilyList().catch(() => {});
  }
  normalizeCurrentFamily();
  await store.loadAll();
  await seedForCurrentFamily();
});

/* ---------------- 记录 ---------------- */
const showPanel = ref(false);
const activeEvent = ref<EventItem | null>(null);
const activeRecord = ref<EventRecordItem | null>(null);
const movingRecord = ref(false);
const pulsingId = ref('');

const recentAmounts = computed(() => {
  const ev = activeEvent.value;
  if (!ev?.unit) return [];
  const values = new Set<number>();
  for (const r of store.records) {
    if (r.eventId === ev.id && r.amount != null && r.amount > 0) values.add(r.amount);
  }
  return [...values].sort((a, b) => b - a).slice(0, 3);
});

async function handleRecord(event?: EventItem) {
  if (!event) return;
  if (dragEndGuard.value) return; // 拖拽后的幽灵 click，直接吞掉
  if (store.recording) return;
  dismissUndo();
  const amount = event.unit && event.defaultAmount != null ? event.defaultAmount : null;
  try {
    const created = await store.record(event.id, amount);
    if (!created) return;
    pulsingId.value = event.id;
    window.setTimeout(() => {
      if (pulsingId.value === event.id) pulsingId.value = '';
    }, 600);
    activeEvent.value = event;
    activeRecord.value = created;
    showPanel.value = true;
  } catch (err) {
    console.error('Failed to record event', err);
    showTopToast({
      message: recordFailedMessage(),
      type: 'error',
      actionText: '重试',
      duration: 5000,
      action: () => handleRecord(event),
    });
  }
}

function closePanel() {
  if (movingRecord.value) return;
  showPanel.value = false;
  const record = activeRecord.value;
  activeEvent.value = null;
  activeRecord.value = null;
  // 关闭后顶部出现 5 秒撤销条，超时即确认保留
  if (record) scheduleUndo(record);
}

async function handlePanelPatch(payload: { amount: number | null; note: string }) {
  const record = activeRecord.value;
  if (!record) return;
  try {
    const updated = await store.patchRecord(record.id, payload);
    // 面板可能已经关闭（关闭时会清空 activeRecord），别把旧记录写回去
    if (activeRecord.value?.id === record.id) activeRecord.value = updated;
  } catch (err) {
    console.error('Failed to update record', err);
    showTopToast({ message: '保存失败，请重试', type: 'error', duration: 3000 });
  }
}

async function onPanelSwitchFamily(payload: {
  familyId: string;
  amount: number | null;
  note: string;
}) {
  const record = activeRecord.value;
  const event = activeEvent.value;
  const { familyId } = payload;
  if (!record || !event || movingRecord.value || familyId === store.currentFamilyId) return;

  movingRecord.value = true;
  try {
    const updated = await store.patchRecord(record.id, {
      amount: payload.amount,
      note: payload.note,
    });
    if (activeRecord.value?.id === record.id) activeRecord.value = updated;
    await store.moveRecordToFamily(updated, event, familyId);

    showPanel.value = false;
    activeEvent.value = null;
    activeRecord.value = null;
    dismissUndo();

    const name =
      familyChoices.value.find((f) => f.id === familyId)?.name ||
      (familyId === 'default' ? '默认' : '该家人');
    await onFamilySwitch(familyId);
    showTopToast({ message: `已记到「${name}」`, type: 'success', duration: 2200 });
  } catch (err) {
    console.error('Failed to move record to family', err);
    showTopToast({ message: '切换家人失败，请重试', type: 'error', duration: 3000 });
  } finally {
    movingRecord.value = false;
  }
}

async function handlePanelUndo() {
  const record = activeRecord.value;
  showPanel.value = false;
  activeEvent.value = null;
  activeRecord.value = null;
  dismissUndo();
  if (!record) return;
  try {
    await store.undoRecord(record.id);
    showTopToast({ message: '已撤销这次记录', duration: 2200 });
  } catch (err) {
    console.error('Failed to undo record', err);
    showTopToast({ message: recordFailedMessage(), type: 'error', duration: 3000 });
  }
}

function editActiveEvent() {
  const event = activeEvent.value;
  showPanel.value = false;
  activeEvent.value = null;
  activeRecord.value = null;
  dismissUndo();
  if (event) openEdit(event);
}

async function onDeleteRecord(id: string) {
  try {
    await store.undoRecord(id);
    showTopToast({ message: '已删除该记录', duration: 2200 });
  } catch (err) {
    console.error('Failed to delete record', err);
    showTopToast({ message: '删除失败，请重试', type: 'error', duration: 3000 });
  }
}

/* ---------------- 顶部 Toast / 撤销条 ---------------- */
const toast = reactive({
  show: false,
  message: '',
  type: 'info' as 'info' | 'error' | 'success',
  actionText: '',
  duration: 0,
  nonce: 0,
  action: null as (() => void) | null,
});
const undoRecordId = ref<string | null>(null);

function showTopToast(opts: {
  message: string;
  type?: 'info' | 'error' | 'success';
  actionText?: string;
  duration?: number;
  action?: (() => void) | null;
}) {
  toast.message = opts.message;
  toast.type = opts.type ?? 'info';
  toast.actionText = opts.actionText ?? '';
  toast.duration = opts.duration ?? 0;
  toast.action = opts.action ?? null;
  toast.show = true;
  toast.nonce += 1;
}

function scheduleUndo(record: EventRecordItem) {
  undoRecordId.value = record.id;
  showTopToast({
    message: `已记录「${record.emoji || '📌'} ${record.eventName}」`,
    type: 'success',
    actionText: '撤销',
    duration: 5000,
    action: undoNow,
  });
}

function dismissUndo() {
  undoRecordId.value = null;
  toast.show = false;
}

async function undoNow() {
  const id = undoRecordId.value;
  dismissUndo();
  if (!id) return;
  try {
    await store.undoRecord(id);
    showTopToast({ message: '已撤销', duration: 2200 });
  } catch (err) {
    console.error('Failed to undo record', err);
    showTopToast({ message: '撤销失败，请重试', type: 'error', duration: 3000 });
  }
}

function onToastAction() {
  const action = toast.action;
  toast.show = false;
  action?.();
}

function onToastClose() {
  toast.show = false;
  // 撤销条自然结束 = 确认保留这次记录
  undoRecordId.value = null;
}

/* ---------------- 事件表单 / 菜单 ---------------- */
const showForm = ref(false);
const editingEvent = ref<EventItem | null>(null);

function openAdd() {
  editingEvent.value = null;
  showForm.value = true;
}

function openEdit(event: EventItem) {
  editingEvent.value = event;
  showForm.value = true;
}

async function onFormSave(payload: EventFormPayload) {
  const id = editingEvent.value?.id;
  try {
    await store.saveEvent(payload, id);
    showForm.value = false;
    editingEvent.value = null;
    showTopToast({ message: id ? '已保存' : '已添加', duration: 2200 });
  } catch (err) {
    console.error('Failed to save event', err);
    showTopToast({ message: '保存失败，请重试', type: 'error', duration: 3000 });
  }
}

function onFormDelete() {
  const event = editingEvent.value;
  showForm.value = false;
  editingEvent.value = null;
  if (event) askDelete(event);
}

/* ---------------- 常用模板导入 ---------------- */
const showTemplates = ref(false);
const importingTemplates = ref(false);

function openTemplates() {
  showTemplates.value = true;
}

/** 从「添加事件」表单里跳过来，先把表单收起 */
function openTemplatesFromForm() {
  showForm.value = false;
  editingEvent.value = null;
  openTemplates();
}

async function onImportTemplates(templates: EventTemplate[]) {
  if (importingTemplates.value) return;
  importingTemplates.value = true;
  try {
    const created = await store.importTemplates(templates);
    showTemplates.value = false;
    if (created.length) showTopToast({ message: `已导入 ${created.length} 个事件`, duration: 2600 });
    else showTopToast({ message: '这些事件都已经有了', duration: 2200 });
    await nextTick();
    refreshSortable();
  } catch (err) {
    console.error('Failed to import templates', err);
    showTopToast({
      message: isLocalMode() ? '导入失败，请重试' : '网络异常，导入失败',
      type: 'error',
      duration: 3000,
    });
  } finally {
    importingTemplates.value = false;
  }
}

const showMenu = ref(false);
const menuEvent = ref<EventItem | null>(null);

const MENU_ITEMS = [
  { label: '记录一次', value: 'record', icon: 'plus', danger: false },
  { label: '编辑事件', value: 'edit', icon: 'edit', danger: false },
  { label: '置顶', value: 'top', icon: 'back-top', danger: false },
  { label: '删除事件', value: 'delete', icon: 'delete-o', danger: true },
] as const;

const menuLabel = computed(() =>
  menuEvent.value ? `${menuEvent.value.emoji || '📌'} ${menuEvent.value.name}` : '',
);

const isMenuTop = computed(
  () => !!menuEvent.value && store.events[0]?.id === menuEvent.value.id,
);

function openMenu(event: EventItem) {
  menuEvent.value = event;
  showMenu.value = true;
}

async function onMenuSelect(value: (typeof MENU_ITEMS)[number]['value']) {
  const event = menuEvent.value;
  showMenu.value = false;
  if (!event) return;
  if (value === 'record') await handleRecord(event);
  else if (value === 'edit') openEdit(event);
  else if (value === 'top') await moveTop(event);
  else if (value === 'delete') askDelete(event);
}

async function moveTop(event: EventItem) {
  const ids = [event.id, ...store.events.filter((e) => e.id !== event.id).map((e) => e.id)];
  try {
    await store.reorder(ids);
  } catch (err) {
    console.error('Failed to reorder events', err);
    showTopToast({ message: '排序保存失败，请重试', type: 'error', duration: 3000 });
  }
}

/* ---------------- 删除确认 ---------------- */
const confirm = reactive({
  show: false,
  title: '',
  message: '',
  target: null as EventItem | null,
});

function askDelete(event: EventItem) {
  confirm.title = '删除事件';
  confirm.message = `确定删除「${event.name}」吗？历史记录仍会保留。`;
  confirm.target = event;
  confirm.show = true;
}

async function confirmDelete() {
  const event = confirm.target;
  confirm.show = false;
  if (!event) return;
  try {
    await store.removeEvent(event.id);
    showTopToast({ message: '已删除', duration: 2200 });
  } catch (err) {
    console.error('Failed to delete event', err);
    showTopToast({ message: '删除失败，请重试', type: 'error', duration: 3000 });
  }
}

/* ---------------- 家人切换 ---------------- */
const showFamily = ref(false);

function openFamily() {
  showFamily.value = true;
}

async function onFamilySwitch(familyId: string) {
  showFamily.value = false;
  if (familyId === store.currentFamilyId) return;
  const found = familyStore.familyList.find((f) => f.familyId === familyId);
  familyStore.setCurrentFamily(found || { familyId, name: familyId === 'default' ? '默认' : '该家人' });
  tab.value = 'record';
  filterEventId.value = 'all';
  await store.setFamily(familyId);
  await seedForCurrentFamily();
}

/* ---------------- 统计筛选 ---------------- */
async function onRangeChange(key: EventRangeKey) {
  store.loading = true;
  try {
    await store.loadRecords(key);
  } catch (err) {
    console.error('Failed to load records', err);
    showTopToast({ message: '加载失败，请重试', type: 'error', duration: 3000 });
  } finally {
    store.loading = false;
  }
}

/** 统计空态的「去记录」：手机切回记录页，桌面直接记录第一个事件 */
function onStatsGoRecord() {
  if (!isWide.value) {
    tab.value = 'record';
    return;
  }
  const first = store.events[0];
  if (first) handleRecord(first);
  else openAdd();
}

/* ---------------- 拖拽排序 ---------------- */
const gridRef = ref<HTMLElement | null>(null);
const railListRef = ref<HTMLElement | null>(null);

const { dragEndGuard, refresh: refreshSortable, cleanup: cleanupSortable } = useEventSortable(
  () => (isWide.value ? railListRef.value : gridRef.value),
  {
    onReorder: (ids) => {
      store.reorder(ids).catch((err) => {
        console.error('Failed to reorder events', err);
        showTopToast({ message: '排序保存失败，请重试', type: 'error', duration: 3000 });
      });
    },
    onLongPress: (id) => {
      const event = store.events.find((e) => e.id === id);
      if (event) openMenu(event);
    },
  },
);

onUpdated(() => cleanupSortable());

/* ---------------- 返回键 / Esc ---------------- */
// 用可写 computed 接管返回键：直接置 false 会绕过 closePanel()，
// 那样就少了「关闭后 5 秒撤销条」，所以这里走 setter。
const panelOpen = computed({
  get: () => showPanel.value,
  set: (value: boolean) => {
    if (value) showPanel.value = true;
    else closePanel();
  },
});

preventBack(panelOpen);
preventBack(showForm);
preventBack(showTemplates);
preventBack(showMenu);
preventBack(showFamily);
preventBack(confirm, 'show');

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (confirm.show) confirm.show = false;
  else if (showMenu.value) showMenu.value = false;
  else if (showTemplates.value) showTemplates.value = false;
  else if (showFamily.value) showFamily.value = false;
  else if (showForm.value) showForm.value = false;
  else if (showPanel.value) closePanel();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped lang="scss">
.ev-page {
  display: block;
  min-height: 100vh;
  background: var(--bg);
}

.ev-page--desktop {
  height: 100vh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: var(--safe-area-top, 0px);
}

.m-app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.rail-add {
  height: 32px;
  padding: 0 12px;
  flex: none;
}

.rail-skeleton {
  min-height: 56px;

  & + & {
    margin-top: 8px;
  }
}

.rail-state {
  padding: 32px 16px;
}
</style>
