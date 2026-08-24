<template>
  <div class="todo-view page-container">
    <van-nav-bar title="待办事项" left-arrow @click-left="onClickLeft" fixed placeholder />

    <div class="matrix-header">
      <span class="axis-col urgent">紧急</span>
      <span class="axis-col not-urgent">不紧急</span>
    </div>

    <div class="quadrant-grid">
      <div v-for="q in quadrants" :key="q.value" class="quadrant" :class="`q${q.value}`">
        <div class="quadrant-header" :style="{ backgroundColor: q.bgColor, color: q.color }">
          <span class="quadrant-title">{{ q.label }}</span>
          <div class="quadrant-actions">
            <span class="quadrant-count">{{ activeCount(q.value) }}</span>
            <van-icon name="plus" size="12" class="quadrant-add" @click.stop="openAddFor(q.value)" />
          </div>
        </div>
        <div class="quadrant-body">
          <div v-if="todosOf(q.value).length === 0" class="empty-tip">暂无待办</div>
          <div v-for="todo in todosOf(q.value)" :key="todo.id" class="todo-item" @click="openEdit(todo)">
            <van-checkbox :model-value="todo.completed" @click.stop @update:model-value="handleToggle(todo)" />
            <div class="todo-info">
              <div class="todo-title" :class="{ done: todo.completed }">{{ todo.title }}</div>
              <div class="todo-meta">
                <span v-if="todo.dueDate" class="todo-due" :class="{ overdue: isOverdue(todo) }">{{ todo.dueDate }}</span>
                <span v-if="statusMeta(todo.status)" class="todo-status" :style="statusStyle(todo.status)">{{ statusMeta(todo.status)?.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="matrix-axis">
      <span class="axis-label important">← 重要</span>
      <span class="axis-label not-important">不重要 →</span>
    </div>

    <!-- 新增待办 -->
    <AddButton v-show="!showForm" @click="openAdd" />

    <!-- 新增/编辑弹窗 -->
    <van-popup v-model:show="showForm" position="bottom" round class="safe-padding-top">
      <div class="form-container">
        <div class="form-title">{{ editing ? '编辑待办' : '新增待办' }}</div>
        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field v-model="form.title" label="标题" placeholder="请输入标题" required
              :rules="[{ required: true, message: '请输入标题' }]" />
            <van-field name="quadrant" label="象限">
              <template #input>
                <div class="quadrant-picker">
                  <van-radio-group v-model="form.quadrant" direction="horizontal">
                    <van-radio v-for="q in quadrants" :key="q.value" :name="q.value">{{ q.shortLabel }}</van-radio>
                  </van-radio-group>
                </div>
              </template>
            </van-field>
            <van-field v-model="form.dueDate" is-link readonly label="截止日期" placeholder="选择日期"
              @click="showDatePicker = true" />
            <van-field name="status" label="状态">
              <template #input>
                <div class="status-chips">
                  <div
                    v-for="s in statuses"
                    :key="s.key"
                    class="status-chip"
                    :class="{ active: form.status === s.key }"
                    :style="chipStyle(s)"
                    @click="form.status = s.key"
                    @touchstart.passive="onChipTouchStart(s)"
                    @touchend="onChipTouchEnd"
                    @touchcancel="onChipTouchEnd"
                    @contextmenu.prevent="onChipLongPress(s)"
                  >{{ s.name }}</div>
                  <div class="status-chip add-chip" @click="openAddStatus">
                    <van-icon name="plus" size="12" /><span>新增</span>
                  </div>
                </div>
              </template>
            </van-field>
            <van-field v-model="form.note" label="备注" placeholder="选填" type="textarea" rows="2" autosize />
          </van-cell-group>
          <div class="form-actions">
            <van-button v-if="editing" block plain type="danger" @click="handleDelete">删除</van-button>
            <van-button block plain type="default" @click="showForm = false">取消</van-button>
            <van-button block plain type="primary" native-type="submit">保存</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker v-model="pickerDate" title="选择截止日期" @confirm="onDateConfirm" @cancel="showDatePicker = false" />
    </van-popup>

    <!-- 新增状态 -->
    <van-dialog
      v-model:show="showStatusDialog"
      title="新增状态"
      show-cancel-button
      :before-close="onStatusBeforeClose"
    >
      <div class="status-form">
        <div class="preset-section">
          <div class="preset-label">常用状态（点选即添加）</div>
          <div class="preset-chips">
            <span
              v-for="p in statusPresets"
              :key="p.name"
              class="preset-chip"
              :style="{ color: p.color, borderColor: p.color }"
              @click="onPresetPick(p)"
            >{{ p.name }}</span>
          </div>
        </div>
        <div class="preset-label custom-label">或自定义</div>
        <van-field v-model="newStatusForm.name" placeholder="状态名称（如：待审核）" maxlength="10" />
        <div class="color-row">
          <span
            v-for="c in statusColors"
            :key="c"
            class="color-dot"
            :class="{ active: newStatusForm.color === c }"
            :style="{ background: c }"
            @click="newStatusForm.color = c"
          />
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { fetchTodos, createTodo, updateTodo, toggleTodo, deleteTodo, type TodoItem } from '@/service/todo';
import { fetchTodoStatuses, createTodoStatus, deleteTodoStatus, type TodoStatusItem } from '@/service/todoStatus';
import { preventBack } from '@/lib/router';
import dayjs from 'dayjs';

defineOptions({
  name: 'TodoView'
});

const router = useRouter();

const quadrants = [
  { value: 1, label: '重要且紧急', shortLabel: '重要且紧急', color: '#ee0a24', bgColor: '#fff1f1' },
  { value: 2, label: '重要不紧急', shortLabel: '重要不紧急', color: '#1989fa', bgColor: '#eff5ff' },
  { value: 3, label: '紧急不重要', shortLabel: '紧急不重要', color: '#ff976a', bgColor: '#fff6f0' },
  { value: 4, label: '不重要不紧急', shortLabel: '不重要不紧急', color: '#969799', bgColor: '#f4f5f7' },
];

const todos = ref<TodoItem[]>([]);
const statuses = ref<TodoStatusItem[]>([]);
const showForm = ref(false);
const showDatePicker = ref(false);
const showStatusDialog = ref(false);
const editing = ref(false);
const editingId = ref('');

const statusColors = ['#969799', '#1989fa', '#07c160', '#ee0a24', '#ff976a', '#7232dd', '#00bcd4', '#ffb800'];
const newStatusForm = ref({ name: '', color: statusColors[1] });

// 新增弹窗里的常用状态预设，点选即添加，避免每次手打名称
const statusPresets = [
  { name: '已阻塞', color: '#ee0a24' },
  { name: '待测试', color: '#00bcd4' },
  { name: '已退回', color: '#ff976a' },
  { name: '已上线', color: '#07c160' },
  { name: '已过期', color: '#969799' },
  { name: '待处理', color: '#1989fa' },
  { name: '已搁置', color: '#7232dd' },
];

const defaultForm = () => ({ title: '', quadrant: 1, status: 'todo', dueDate: '', note: '' });
const form = ref(defaultForm());
const pickerDate = ref<string[]>(dayjs().format('YYYY-MM-DD').split('-'));

preventBack(showForm);
preventBack(showDatePicker);
preventBack(showStatusDialog);

const onClickLeft = () => {
  router.back();
};

const todosOf = (quadrant: number) => todos.value.filter((t) => t.quadrant === quadrant);
const activeCount = (quadrant: number) => todosOf(quadrant).filter((t) => !t.completed).length;

const isOverdue = (todo: TodoItem) => {
  if (todo.completed || !todo.dueDate) return false;
  return dayjs(todo.dueDate).isBefore(dayjs(), 'day');
};

const statusMeta = (key: string) => statuses.value.find((s) => s.key === key);

// 将 #RRGGBB 转为 rgba()，避免 8 位 hex 在某些 WebView 的 CSSOM 上被拒
const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 任务卡片上的状态徽标样式
const statusStyle = (key: string) => {
  const s = statusMeta(key);
  if (!s) return {};
  return {
    color: s.color,
    backgroundColor: hexToRgba(s.color, 0.1),
  };
};

// 表单中状态 chip 的样式：选中时填色，未选中时描边
const chipStyle = (s: TodoStatusItem) => {
  const active = form.value.status === s.key;
  return active
    ? { color: '#fff', backgroundColor: s.color, borderColor: s.color }
    : { color: s.color, borderColor: hexToRgba(s.color, 0.4) };
};

const loadStatuses = async () => {
  try {
    statuses.value = await fetchTodoStatuses();
  } catch (e) {
    console.error('[Todo] load statuses failed:', e);
  }
};

const loadTodos = async () => {
  try {
    todos.value = await fetchTodos();
  } catch (e) {
    console.error('[Todo] load failed:', e);
    showToast('加载待办失败');
  }
};

onMounted(() => {
  loadStatuses();
  loadTodos();
});

const openAddFor = (quadrant: number) => {
  editing.value = false;
  editingId.value = '';
  form.value = { ...defaultForm(), quadrant };
  showForm.value = true;
};

const openAdd = () => openAddFor(1);

const openEdit = (todo: TodoItem) => {
  editing.value = true;
  editingId.value = todo.id;
  form.value = {
    title: todo.title,
    quadrant: todo.quadrant,
    status: todo.status || 'todo',
    dueDate: todo.dueDate,
    note: todo.note,
  };
  showForm.value = true;
};

const onDateConfirm = ({ selectedValues }: { selectedValues: string[] }) => {
  form.value.dueDate = selectedValues.join('-');
  showDatePicker.value = false;
};

const handleSubmit = async () => {
  if (!form.value.title.trim()) {
    showToast('请输入标题');
    return;
  }
  try {
    if (editing.value) {
      await updateTodo({ id: editingId.value, ...form.value });
    } else {
      await createTodo({ ...form.value });
    }
    showForm.value = false;
    await loadTodos();
  } catch (e) {
    console.error('[Todo] save failed:', e);
    showToast('保存失败');
  }
};

const handleToggle = async (todo: TodoItem) => {
  try {
    await toggleTodo(todo.id);
    todo.completed = !todo.completed;
    // 与 status 同步：勾选完成 -> done，取消完成 -> todo
    todo.status = todo.completed ? 'done' : 'todo';
  } catch (e) {
    console.error('[Todo] toggle failed:', e);
    showToast('操作失败');
  }
};

const handleDelete = () => {
  showConfirmDialog({
    title: '删除待办',
    message: '确定要删除这条待办吗？',
  }).then(async () => {
    try {
      await deleteTodo(editingId.value);
      showForm.value = false;
      await loadTodos();
    } catch (e) {
      console.error('[Todo] delete failed:', e);
      showToast('删除失败');
    }
  }).catch(() => {
    // 取消
  });
};

// ===== 状态 chip 交互 =====
let longPressTimer: number | undefined;

const onChipTouchStart = (s: TodoStatusItem) => {
  if (s.isSystem) return;
  if (longPressTimer) window.clearTimeout(longPressTimer);
  longPressTimer = window.setTimeout(() => {
    onChipLongPress(s);
  }, 500);
};

const onChipTouchEnd = () => {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
};

const onChipLongPress = (s: TodoStatusItem) => {
  if (s.isSystem) return;
  showConfirmDialog({
    title: '删除状态',
    message: `确定删除自定义状态「${s.name}」吗？`,
  }).then(async () => {
    try {
      await deleteTodoStatus(s.key);
      await loadStatuses();
      if (form.value.status === s.key) form.value.status = 'todo';
      showToast('已删除');
    } catch (e: any) {
      showToast(e?.message || '删除失败');
    }
  }).catch(() => {
    // 取消
  });
};

const openAddStatus = () => {
  newStatusForm.value = { name: '', color: statusColors[1] };
  showStatusDialog.value = true;
};

// 点选常用预设：一键创建并选中（同名状态已存在则提示）
const onPresetPick = async (p: { name: string; color: string }) => {
  if (statuses.value.some((s) => s.name === p.name)) {
    showToast('该状态已存在');
    return;
  }
  try {
    const created = await createTodoStatus({ name: p.name, color: p.color });
    await loadStatuses();
    form.value.status = created.key;
    showStatusDialog.value = false;
  } catch (e: any) {
    showToast(e?.message || '创建失败');
  }
};

const onStatusBeforeClose = async (action: string) => {
  if (action !== 'confirm') return true;
  const name = newStatusForm.value.name.trim();
  if (!name) {
    showToast('请输入状态名称');
    return false;
  }
  try {
    const created = await createTodoStatus({ name, color: newStatusForm.value.color });
    await loadStatuses();
    form.value.status = created.key;
    return true;
  } catch (e: any) {
    showToast(e?.message || '创建失败');
    return false;
  }
};
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints.scss' as *;

.todo-view {
  min-height: 100vh;
  height: 100vh;
  overflow: hidden;
  background-color: #f7f8fa;
  padding-bottom: 40px;
  box-sizing: border-box;

  :deep(.van-nav-bar__placeholder > .van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }

  // 本页无底部 tabbar，覆写 AddButton 继承的全局 footer 高度
  :deep(.add-btn) {
    bottom: calc(24px + env(safe-area-inset-bottom));
  }

  .matrix-header {
    display: flex;
    padding: 12px 16px 4px;

    .axis-col {
      flex: 1;
      text-align: center;
      font-size: 12px;
      color: #969799;

      &.urgent {
        color: #ee0a24;
      }

      &.not-urgent {
        color: #1989fa;
      }
    }
  }

  .quadrant-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 8px 12px;

    @include desktop {
      gap: 20px;
      padding: 16px 32px;
    }
  }

  .quadrant {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: calc(50vh - 80px);
    max-height: calc(50vh - 80px);

    @include desktop {
      min-height: 320px;
      max-height: none;
    }

    .quadrant-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;

      .quadrant-title {
        font-size: 13px;
        font-weight: 600;
      }

      .quadrant-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .quadrant-count {
        font-size: 12px;
        min-width: 20px;
        text-align: center;
        border-radius: 10px;
        padding: 0 6px;
        background: rgba(255, 255, 255, 0.8);
      }

      .quadrant-add {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.8);
        cursor: pointer;
      }
    }

    .quadrant-body {
      flex: 1;
      padding: 8px 10px;
      overflow-y: auto;

      .empty-tip {
        text-align: center;
        color: #c8c9cc;
        font-size: 12px;
        padding: 24px 0;
      }

      .todo-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 4px;
        border-bottom: 1px solid #f5f6f7;
        cursor: pointer;

        &:last-child {
          border-bottom: none;
        }

        .todo-info {
          flex: 1;
          min-width: 0;

          .todo-title {
            font-size: 13px;
            color: #323233;
            line-height: 1.4;
            word-break: break-all;

            &.done {
              color: #c8c9cc;
              text-decoration: line-through;
            }
          }

          .todo-meta {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 3px;
          }

          .todo-due {
            font-size: 11px;
            color: #969799;

            &.overdue {
              color: #ee0a24;
            }
          }

          .todo-status {
            font-size: 10px;
            line-height: 1;
            padding: 2px 6px;
            border-radius: 8px;
            white-space: nowrap;
          }
        }
      }
    }
  }

  .matrix-axis {
    display: flex;
    padding: 4px 16px 0;

    .axis-label {
      flex: 1;
      font-size: 12px;
      color: #969799;

      &.important {
        text-align: left;
      }

      &.not-important {
        text-align: right;
      }
    }
  }

  .form-container {
    padding: 20px 0 30px;

    .form-title {
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 16px;
    }

    .quadrant-picker {
      .van-radio-group {
        flex-wrap: wrap;
        gap: 8px 16px;
      }
    }

    .status-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 4px 10px;
        font-size: 12px;
        line-height: 1;
        border: 1px solid;
        border-radius: 12px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        transition: opacity 0.15s;

        &:active {
          opacity: 0.7;
        }

        &.add-chip {
          color: #969799;
          border-color: #dcdee0;
          background: #fff;
        }
      }
    }

    .form-actions {
      display: flex;
      gap: 10px;
      margin: 20px 16px 0;
    }
  }
}

.status-form {
  padding: 16px 20px 8px;

  .preset-label {
    font-size: 12px;
    color: #969799;
    margin-bottom: 8px;

    &.custom-label {
      margin-top: 14px;
    }
  }

  .preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .preset-chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      font-size: 12px;
      line-height: 1;
      border: 1px solid;
      border-radius: 12px;
      cursor: pointer;
      background: #fff;

      &:active {
        opacity: 0.6;
      }
    }
  }

  .color-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;

    .color-dot {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      cursor: pointer;
      position: relative;
      border: 2px solid transparent;

      &.active {
        border-color: #323233;
      }
    }
  }
}
</style>
