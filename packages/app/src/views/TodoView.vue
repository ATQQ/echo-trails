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
              <div v-if="todo.dueDate" class="todo-due" :class="{ overdue: isOverdue(todo) }">
                {{ todo.dueDate }}
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { fetchTodos, createTodo, updateTodo, toggleTodo, deleteTodo, type TodoItem } from '@/service/todo';
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
const showForm = ref(false);
const showDatePicker = ref(false);
const editing = ref(false);
const editingId = ref('');

const defaultForm = () => ({ title: '', quadrant: 1, dueDate: '', note: '' });
const form = ref(defaultForm());
const pickerDate = ref<string[]>(dayjs().format('YYYY-MM-DD').split('-'));

preventBack(showForm);
preventBack(showDatePicker);

const onClickLeft = () => {
  router.back();
};

const todosOf = (quadrant: number) => todos.value.filter((t) => t.quadrant === quadrant);
const activeCount = (quadrant: number) => todosOf(quadrant).filter((t) => !t.completed).length;

const isOverdue = (todo: TodoItem) => {
  if (todo.completed || !todo.dueDate) return false;
  return dayjs(todo.dueDate).isBefore(dayjs(), 'day');
};

const loadTodos = async () => {
  try {
    todos.value = await fetchTodos();
  } catch (e) {
    console.error('[Todo] load failed:', e);
    showToast('加载待办失败');
  }
};

onMounted(loadTodos);

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
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints.scss' as *;

.todo-view {
  min-height: 100vh;
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
    min-height: 180px;

    @include desktop {
      min-height: 320px;
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

          .todo-due {
            margin-top: 2px;
            font-size: 11px;
            color: #969799;

            &.overdue {
              color: #ee0a24;
            }
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

    .form-actions {
      display: flex;
      gap: 10px;
      margin: 20px 16px 0;
    }
  }
}
</style>
