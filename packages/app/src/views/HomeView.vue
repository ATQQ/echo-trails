<script setup lang="ts">
import PhotoList from '@/components/PhotoList/PhotoList.vue';
import PageTitle from '@/components/PageTitle/PageTitle.vue';
import { useRouter } from 'vue-router';
import { ref } from 'vue';

// 连续点击5次标题，跳转到删除页面
const clickCount = ref(0)
const router = useRouter()
const handleClick = () => {
  clickCount.value++
  if (clickCount.value === 3) {
    // 跳转到删除页面
    router.push({ name: 'delete' })
    // 清空点击次数
    clickCount.value = 0
  }

  // 一段时间后清空点击次数
  setTimeout(() => {
    clickCount.value = 0
  }, 3000)
}

const showDatePicker = ref(false)
const currentDate = ref('')
const startDate = ref('')
const endDate = ref('')

const onConfirmDate = (value: Date) => {
  if (value) {
    const year = value.getFullYear()
    const month = value.getMonth() + 1
    const day = value.getDate()
    const formattedMonth = String(month).padStart(2, '0')
    const formattedDay = String(day).padStart(2, '0')

    // 清空 startDate，设置 endDate 为选择日期的 23:59:59，以显示该日期及之前的照片
    startDate.value = ''
    endDate.value = `${year}-${formattedMonth}-${formattedDay}T23:59:59.999Z`
  }
  showDatePicker.value = false
}

const onClearDate = () => {
  startDate.value = ''
  endDate.value = ''
  showDatePicker.value = false
}
</script>

<template>
  <PhotoList :startDate="startDate" :endDate="endDate">
    <template #header>
      <PageTitle title="照片" @pressTitle="handleClick">
        <template #action>
          <van-icon name="filter-o" size="26" @click="showDatePicker = true" :color="endDate ? '#1989fa' : ''" />
        </template>
      </PageTitle>
    </template>
  </PhotoList>

  <van-popup v-model:show="showDatePicker" position="bottom" style="height: 50%">
    <van-calendar
      title="选择结束日期"
      :poppable="false"
      :show-confirm="false"
      @confirm="onConfirmDate"
      :min-date="new Date(2000, 0, 1)"
      :max-date="new Date()"
    >
      <template #title>
        <div class="calendar-title-wrapper">
          <div class="calendar-title">选择结束日期</div>
          <button type="button" class="calendar-clear-btn" @click="onClearDate">清除筛选</button>
        </div>
      </template>
    </van-calendar>
  </van-popup>
</template>

<style scoped>
.calendar-title-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.calendar-title {
  font-weight: 500;
  font-size: 16px;
}
.calendar-clear-btn {
  position: absolute;
  right: 16px;
  background: transparent;
  border: none;
  color: #1989fa;
  font-size: 14px;
  padding: 0;
  cursor: pointer;
}
</style>
