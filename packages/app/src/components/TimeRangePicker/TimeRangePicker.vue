<template>
  <van-popup
    v-model:show="showValue"
    position="bottom"
    round
    :style="type !== 'month' ? { height: '80%' } : {}"
  >
    <!-- Custom Range Picker (Calendar) -->
    <template v-if="type === 'custom'">
      <van-calendar
        :poppable="false"
        type="range"
        :min-date="minDate"
        :max-date="maxDate"
        :default-date="defaultRange"
        :first-day-of-week="1"
        @confirm="onConfirmCalendar"
        style="height: 100%"
      />
    </template>

    <!-- Week Picker (Calendar Range) -->
    <template v-else-if="type === 'week'">
      <van-calendar
        :poppable="false"
        type="range"
        :min-date="minDate"
        :max-date="maxDate"
        :default-date="defaultRange"
        :first-day-of-week="1"
        title="选择周"
        @confirm="onConfirmCalendar"
        style="height: 100%"
      />
    </template>

    <!-- Day Picker (Calendar Single) -->
    <template v-else-if="type === 'day'">
      <van-calendar
        :poppable="false"
        type="single"
        :min-date="minDate"
        :max-date="maxDate"
        :default-date="defaultSingleDate"
        :title="pickerTitle"
        :first-day-of-week="1"
        @confirm="onConfirmCalendarSingle"
        style="height: 100%"
      />
    </template>

    <!-- Month Picker (Date Picker) -->
    <template v-else-if="type === 'month'">
       <van-date-picker
        v-model="pickerValue"
        title="选择月份"
        :min-date="minDate"
        :max-date="maxDate"
        :columns-type="['year', 'month']"
        @confirm="onConfirmDatePicker"
        @cancel="showValue = false"
      />
    </template>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { CalendarInstance } from 'vant';

const props = defineProps<{
  show: boolean;
  type: 'day' | 'week' | 'month' | 'custom';
  currentDate?: number; // timestamp
  currentRange?: [number, number]; // [start, end] timestamps
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'confirm', value: { start: number; end: number; label: string }): void;
}>();

const showValue = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
});

const minDate = new Date(2020, 0, 1);
const maxDate = new Date();

const defaultRange = ref<Date[]>([]);
const defaultSingleDate = ref<Date>(new Date());
const pickerValue = ref<string[]>([]);

// Initialize picker values when opening
watch(
  () => props.show,
  (val) => {
    if (!val) return;

    const now = dayjs();
    const current = props.currentDate ? dayjs(props.currentDate) : now;

    if (props.type === 'custom') {
      if (props.currentRange && props.currentRange.length === 2) {
        defaultRange.value = [
          new Date(props.currentRange[0]),
          new Date(props.currentRange[1]),
        ];
      } else {
         // Default to last week if no range
         defaultRange.value = [
             now.subtract(6, 'day').toDate(),
             now.toDate()
         ];
      }
    } else if (props.type === 'week') {
      const day = current.day();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = current.add(diffToMonday, 'day');
      const sunday = monday.add(6, 'day');
      defaultRange.value = [monday.toDate(), sunday.toDate()];
    } else if (props.type === 'month') {
      pickerValue.value = [current.format('YYYY'), current.format('MM')];
    } else {
      // For Day, we use Calendar Single
      defaultSingleDate.value = current.toDate();
    }
  }
);

const pickerTitle = computed(() => {
  if (props.type === 'day') return '选择日期';
  if (props.type === 'month') return '选择月份(选中日期所在月)';
  return '选择时间';
});

// Removed onConfirmPicker and columnsType as we are using Calendar for all

const onConfirmCalendar = (values: Date[]) => {
  const [start, end] = values;
  emit('confirm', {
    start: dayjs(start).startOf('day').valueOf(),
    end: dayjs(end).endOf('day').valueOf(),
    label: `${dayjs(start).format('YYYY年MM月DD日')} - ${dayjs(end).format('MM月DD日')}`,
  });
  showValue.value = false;
};

const onConfirmDatePicker = ({ selectedValues }: { selectedValues: string[] }) => {
  const [year, month] = selectedValues;
  const date = dayjs(`${year}-${month}-01`);
  const start = date.startOf('month').valueOf();
  const end = date.endOf('month').valueOf();
  const label = date.format('YYYY年MM月');

  emit('confirm', { start, end, label });
  showValue.value = false;
};

const onConfirmCalendarSingle = (value: Date) => {
  const date = dayjs(value);
  let start = 0;
  let end = 0;
  let label = '';

  if (props.type === 'day') {
    start = date.startOf('day').valueOf();
    end = date.endOf('day').valueOf();
    label = date.format('YYYY年MM月DD日');
  }

  emit('confirm', { start, end, label });
  showValue.value = false;
};
</script>
