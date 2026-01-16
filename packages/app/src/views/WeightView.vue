<script setup lang="ts">
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { computed, onMounted, onUnmounted, reactive, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { getWeightDiff, getTimeDiffDes } from '@/lib/weight-utils'
import { getWeightList, addWeight, updateWeight, deleteWeight, type WeightRecord } from '@/service/weight'
import { getFamilyList, addFamily, updateFamily, deleteFamily, type FamilyMember } from '@/service/family'
import UnderInput from '@/components/UnderInput.vue'
import dayjs from 'dayjs'
import { Chart } from '@antv/f2'
import ScrollBar from '@antv/f2/es/plugin/scroll-bar'
import '@antv/f2/es/interaction/pan'

// Register ScrollBar plugin
Chart.plugins.register(ScrollBar)

const formatDate = (date: any, fmt: string = 'yyyy-MM-dd') => {
  if (!date) return ''
  const formatMap: Record<string, string> = {
    'yyyy/MM/dd': 'YYYY/MM/DD',
    'hh:mm': 'HH:mm',
    'yyyy-MM-dd': 'YYYY-MM-DD',
    'yyyy-MM-dd hh:mm': 'YYYY-MM-DD HH:mm',
    'yyyy-MM': 'YYYY-MM'
  }
  return dayjs(date).format(formatMap[fmt] || fmt)
}

const isKG = ref(localStorage.getItem('weight-kg') === 'true')
watchEffect(() => {
  localStorage.setItem('weight-kg', `${isKG.value}`)
})

const themeColor = ref('#1989fa')

const router = useRouter()
function handleBack() {
  router.go(-1) // Changed from /dashboard to /home or similar
}

const state = reactive({
  people: localStorage.getItem('currentPerson') || 'default',
  showTime: false,
  time: '',
  timeValue: [] as string[],
  showCalendar: false,
  date: '',
  weight: 0,
  tips: '',
  editRecordId: ''
})

// 体重数据
const weights = ref<WeightRecord[]>([])
const peopleOption = ref<{ text: string, value: string }[]>([
  { text: '默认', value: 'default' }
])

// 搜索关键字
const searchWeight = ref('')
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = ref(30)

// 实际展示的列表
const showWeights = computed(() =>
  weights.value.filter((w) => {
    if (!searchWeight.value)
      return true
    return `${formatDate(w.date, 'yyyy/MM/dd')}${w.tips || ''}${w.weight}`.includes(
      searchWeight.value
    )
  })
)

function onLoad() {
  // If we are searching locally, we might not want to load more from server?
  // Or we just load more to find matches?
  // For now, let's assume search doesn't stop loading, but usually search should probably be server side if data is large.
  // Given the instruction, I will just implement the loading logic.

  if (state.people === 'default' && peopleOption.value.length > 1 && !peopleOption.value.find(v => v.value === 'default')) {
    // Edge case handling similar to existing code, but maybe unnecessary here if handled in watchEffect
  }

  getWeightList(state.people, page.value, pageSize.value).then(res => {
    if (res.code === 0) {
      const newData = res.data
      if (page.value === 1) {
        weights.value = newData
      } else {
        weights.value.push(...newData)
      }

      // Check if finished
      if (newData.length < pageSize.value) {
        finished.value = true
      } else {
        page.value++
      }
    } else {
      finished.value = true
    }
  }).catch(() => {
    finished.value = true
  }).finally(() => {
    loading.value = false
  })
}

function refreshRecord(familyId: string) {
  // Reset pagination
  page.value = 1
  finished.value = false
  loading.value = true
  weights.value = [] // Clear existing to trigger clean load or just let onLoad handle it
  // onLoad will be triggered by van-list if immediate-check is true (default) and content is not enough
  // But since we clear weights, it should trigger.
  onLoad()
}
function refreshFamilies() {
  // store.dispatch('weight/getFamilyList')
  getFamilyList().then(res => {
    if (res.code === 0) {
      const list = res.data.map(m => ({ text: m.name, value: m.familyId }))
      if (!list.find(v => v.value === 'default')) {
        list.unshift({ text: '默认', value: 'default' })
      }
      peopleOption.value = list
    }
  })
}

// 切换成员
function handleSelectPeople(value: string) {
  refreshRecord(value)
  localStorage.setItem('currentPerson', value)
}

watchEffect(() => {
  const isExist = !!peopleOption.value.find(v => v.value === state.people)
  if (!isExist && peopleOption.value.length > 1) {
    // If current person not in list (and list loaded), switch to default
    // Note: peopleOption init with 1 item ('default'), so length > 1 means we loaded families
    // However, if 'default' is the only one, isExist is true if state.people is 'default'.
    // If state.people is some ID that was deleted, switch to default.
    state.people = 'default'
    handleSelectPeople('default')
  }
})

// 添加家人相关
const newPeopleName = ref('')
const showAddPeople = ref(false)
function handleAddPeople() {
  showAddPeople.value = true
}
function onOpenPeoplDialog() {
  newPeopleName.value = ''
}
function handleSurePeople() {
  if (!newPeopleName.value) {
    return
  }
  // 去重
  if (peopleOption.value.find(v => v.text === newPeopleName.value)) {
    showFailToast('名称已存在')
    return
  }
  showAddPeople.value = false
  addFamily(newPeopleName.value).then((res) => {
    showSuccessToast('添加成功')
    const { familyId } = res.data
    // Refresh list instead of push to keep consistent
    refreshFamilies()

    // 刷新选择
    state.people = familyId
    handleSelectPeople(familyId)
  })
}

// 添加记录相关
const showAddRecord = ref(false)
const editMode = ref(false)
function handleAddRecord() {
  editMode.value = false
  // 展示当前时间
  const now = new Date()
  state.date = formatDate(now, 'yyyy/MM/dd')
  state.time = formatDate(now, 'hh:mm')
  state.timeValue = state.time.split(':')
  // 展示最近一次的记录
  state.weight = weights.value.length > 0 ? weights.value[0].weight : 50.0
  if (!isKG.value) {
    state.weight *= 2
  }
  showAddRecord.value = true
}

// 时间选择
function handleSureTime(timeSelect: any) {
  state.time = timeSelect.selectedValues.join(':')
  state.showTime = false
}
// 日期选择:前1周
const now = new Date()
const minDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7)
const maxDate = now
function handleSureDate(date: Date) {
  state.date = formatDate(date, 'yyyy/MM/dd')
  state.showCalendar = false
}

// 修改/添加记录
function handleSureRecord() {
  const date = new Date(`${state.date} ${state.time}`)
  let weight = +state.weight
  if (weight <= 0) {
    return
  }
  weight = +(isKG.value ? weight : weight / 2).toFixed(2)
  // 修改
  if (editMode.value) {
    updateWeight({
      id: state.editRecordId,
      weight,
      date,
      tips: state.tips
    }).then(() => {
      showSuccessToast('修改成功')
      // 刷新列表
      refreshRecord(state.people)
    })
    return
  }

  const { tips } = state
  state.tips = ''
  addWeight({
    familyId: state.people === 'default' ? 'default' : state.people,
    weight,
    date,
    tips,
    operator: 'self'
  }).then((res) => {
    showSuccessToast('记录成功')
    refreshRecord(state.people)
  })

  showAddRecord.value = false
}

// 删除记录
function handleDeleteWeight(idx: number) {
  showConfirmDialog({
    title: '提示',
    message: '确认移除此条记录？'
  })
    .then(() => {
      // weights.value[idx].recordId -> _id
      const id = weights.value[idx]._id
      if (id) {
        deleteWeight(id).then(() => {
          // Refresh or splice
          weights.value.splice(idx, 1)
        })
      }
    })
    .catch(() => {
      // on cancel
    })
}
function handleUpdateWeight(idx: number) {
  const record = weights.value[idx]
  state.editRecordId = record._id || ''
  editMode.value = true

  // 展示当前时间
  const now = new Date(record.date)
  state.date = formatDate(now, 'yyyy/MM/dd')
  state.time = formatDate(now, 'hh:mm')
  state.timeValue = state.time.split(':')
  // 展示最近一次的记录
  state.weight = record.weight
  if (!isKG.value) {
    state.weight *= 2
  }
  showAddRecord.value = true
}
// 格式化内容展示
const overviewData = computed(() => {
  const res = []
  // 最新的一次
  const latest = weights.value[0]
  if (!latest) return [] // Handle empty

  // 与上一次比较
  const lastTime = weights.value.length === 1 ? weights.value[0] : weights.value[1]
  res.push({
    text: `与上一次比较(${getTimeDiffDes(latest.date, lastTime.date)})`,
    ...getWeightDiff(latest.weight, lastTime.weight)
  })
  // 与今天第一次比较
  const todayData = weights.value.filter(
    v => formatDate(now, 'yyyy-MM-dd') === formatDate(v.date, 'yyyy-MM-dd')
  )
  if (todayData.length !== 0) {
    const todayFirst = todayData[todayData.length - 1]
    res.push({
      text: `与今天首次比较(${getTimeDiffDes(latest.date, todayFirst.date)})`,
      ...getWeightDiff(latest.weight, todayFirst.weight)
    })
  }
  // 与本月第一次比较
  const monthData = weights.value.filter(
    v => formatDate(now, 'yyyy-MM') === formatDate(v.date, 'yyyy-MM')
  )
  if (monthData.length !== 0) {
    const monthFirst = monthData[monthData.length - 1]
    res.push({
      text: `与本月首次比较(${getTimeDiffDes(latest.date, monthFirst.date)})`,
      ...getWeightDiff(latest.weight, monthFirst.weight)
    })
  }
  return res
})

const mychart = ref(null as unknown as HTMLCanvasElement) // Changed type to HTMLCanvasElement for F2
let chartInstance: any = null

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})

watchEffect(() => {
  // demo: https://antv-2018.alipay.com/zh-cn/f2/3.x/demo/interaction/pan-for-line-chart.html
  if (weights.value.length !== 0 && mychart.value) {
    const data = [
      ...weights.value.map((v, idx) => ({
        weight: v.weight,
        date: v.date,
        idx
      }))
    ]
    data.sort((a, b) => +new Date(a.date) - +new Date(b.date))
    data.forEach((v, idx) => {
      v.idx = idx + 1
    })

    if (chartInstance) {
      chartInstance.destroy()
    }

    // Step 1: 创建 Chart 对象
    chartInstance = new Chart<WeightRecord>({
      el: mychart.value,
      pixelRatio: window.devicePixelRatio // 指定分辨率
    })
    const chart = chartInstance
    const wMax = Math.max(...data.map(v => v.weight))
    const wMin = Math.min(...data.map(v => v.weight))
    const buf = 4
    chart.source(data, {
      weight: {
        min: wMin - buf > 0 ? wMin - buf : 0,
        max: wMax + buf,
        tickCount: 5
      },
      idx: {
        min: data.length - 10 > 0 ? data.length - 10 : 0,
        max: data.length
      }
    })
    chart.tooltip({
      showCrosshairs: true,
      showItemMarker: false,
      background: {
        radius: 2,
        fill: '#1890FF',
        padding: [3, 5]
      },
      nameStyle: {
        fill: '#fff'
      },
      onShow: function onShow(ev: any) {
        const { items } = ev
        const { date } = items[0].origin
        items[0].name = `时间${formatDate(date, 'yyyy-MM-dd hh:mm')} 体重`
      }
    })

    chart.axis('idx', {
      label: null
    })

    chart.line().position('idx*weight')
    chart.point().position('idx*weight').style({
      lineWidth: 1,
      stroke: '#fff'
    })

    chart.interaction('pan')

    // 定义进度条
    chart.scrollBar({
      mode: 'x',
      xStyle: {
        offsetY: -5
      }
    })

    // 绘制 tag
    if (data.length > 0) {
      const last = data[data.length - 1]
      chart.guide().tag({
        position: [last.idx, last.weight],
        withPoint: false,
        content: String(last.weight),
        limitInPlot: true,
        offsetX: 5,
        direct: 'cr'
      })
    }

    chart.render()
  }
})

const showEditFamilyName = ref(false)
const newFamilyName = ref('')
function handleUpdateName() {
  showEditFamilyName.value = true
}
async function handleSubmitEditInfo() {
  if (!newFamilyName.value) {
    return
  }
  updateFamily(state.people, newFamilyName.value).then(() => {
    showSuccessToast('修改成功')
    // 刷新列表
    refreshFamilies()
  })
  showEditFamilyName.value = false
  newFamilyName.value = ''
}

function handleDeleteFamily() {
  showConfirmDialog({
    title: '操作提示',
    message: '确认移除此人员？'
  })
    .then(() => {
      deleteFamily(state.people).then(() => {
        showSuccessToast('删除成功')
        // 刷新列表
        refreshFamilies()
        // 刷新选择
        state.people = 'default'
        handleSelectPeople('default')
      })
    })
}
onMounted(() => {
  refreshFamilies()
  refreshRecord(state.people)
})
</script>

<template>
  <div>
    <van-nav-bar class="safe-padding-top" fixed title="体重记录" left-text="返回" left-arrow @click-left="handleBack"
      @click-right="handleAddPeople">
      <template #right>
        <van-icon name="plus" size="18" />
      </template>
    </van-nav-bar>
    <!-- 选人 -->
    <header class="family-select-wrapper safe-padding-top">
      <van-dropdown-menu :active-color="themeColor">
        <van-dropdown-item v-model="state.people" :options="peopleOption" @change="handleSelectPeople" />
      </van-dropdown-menu>
      <span class="edit-family-name" @click="handleUpdateName">
        <van-icon name="edit" />
      </span>
      <span v-if="!loading && weights.length === 0 && state.people !== 'default'" class="delete-family-name"
        @click="handleDeleteFamily">
        <van-icon name="delete" />
      </span>
    </header>
    <!-- 修改名字 -->
    <van-dialog v-model:show="showEditFamilyName" title="信息修改" show-cancel-button @confirm="handleSubmitEditInfo">
      <van-field v-model="newFamilyName" autofocus label="名称" placeholder="请输入新的名称" />
    </van-dialog>

    <van-empty v-if="weights.length === 0" description="没有记录，点击右下角 + 添加" />
    <main v-else>
      <!-- 最近一次的记录 -->
      <h2 class="current-time">
        {{ formatDate(weights[0].date) }}
      </h2>
      <h1 class="current-weight">
        {{ weights[0].weight }}
        <span>kg</span>
        <span class="jin">{{ weights[0].weight * 2 }}</span>
        <span>斤</span>
      </h1>
      <p v-for="(t, idx) in overviewData" :key="idx" class="rank">
        {{ t.text }}
        <span :class="t.symbol" />
        <span class="res">{{ t.res }}</span>
      </p>
      <canvas ref="mychart" style="width: 100%; height: 220px" />
      <van-divider :style="{ color: '#1989fa', borderColor: '#1989fa', padding: '0 16px' }">
        体重记录（{{ isKG ? 'kg' : '斤' }}）
        <van-switch v-model="isKG" :size="18" inactive-color="#e8ffee" />
      </van-divider>
      <van-search v-model="searchWeight" placeholder="请输入过滤关键词" input-align="center" />

      <div class="weight-list">
        <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad">
          <van-swipe-cell v-for="(t, idx) in showWeights" :key="idx">
            <van-cell :title-style="{ flex: 1.1 }" :border="false" :title="formatDate(t.date)">
              <div style="display: flex; justify-content: space-between">
                <span>{{ (isKG ? t.weight : t.weight * 2).toFixed(2) }}</span>
                <span>{{ t.tips || '' }}</span>
              </div>
            </van-cell>
            <template #right>
              <van-button square type="primary" text="编辑" @click="handleUpdateWeight(idx)" />
              <van-button square type="danger" text="删除" @click="handleDeleteWeight(idx)" />
            </template>
          </van-swipe-cell>
        </van-list>
      </div>
    </main>
    <!-- 添加记录 -->
    <div class="add-record" @click="handleAddRecord">
      <van-icon name="plus" size="20" />
    </div>
    <!-- 添加家人弹窗 -->
    <van-dialog v-model:show="showAddPeople" title="添加家人" :confirm-button-color="themeColor" show-cancel-button
      @open="onOpenPeoplDialog" @confirm="handleSurePeople">
      <div class="people-dialog">
        <UnderInput v-model="newPeopleName" placeholder="昵称" tips="输入要记录的家人昵称" icon="manager-o" />
      </div>
    </van-dialog>
    <!-- 添加记录弹窗 -->
    <van-dialog v-model:show="showAddRecord" :title="editMode ? '修改记录' : '录入记录'" confirm-button-color="#1989fa"
      show-cancel-button @confirm="handleSureRecord">
      <div class="record-dialog">
        <van-field v-model="state.date" readonly clickable name="calendar" label="日期" placeholder="点击选择日期"
          @click="state.showCalendar = true" />
        <van-field v-model="state.time" readonly clickable name="datetimePicker" label="时间" placeholder="点击选择时间"
          @click="state.showTime = true" />
        <van-field v-model="state.weight" clickable type="number" name="weight" :label="`体重(${isKG ? 'kg' : '斤'})`"
          placeholder="点击设置体重" />
        <van-field v-model="state.tips" clickable type="text" name="tips" label="备注" placeholder="(选填)" />
      </div>
    </van-dialog>
    <!-- 时间 -->
    <van-popup v-model:show="state.showTime" position="bottom">
      <van-time-picker v-model="state.timeValue" @confirm="handleSureTime" @cancel="state.showTime = false" />
    </van-popup>
    <!-- 日历 -->
    <van-calendar v-model:show="state.showCalendar" :min-date="minDate" :max-date="maxDate" :color="themeColor"
      @confirm="handleSureDate" />
  </div>
</template>

<style lang="scss" scoped>
.people-dialog {
  padding: 1rem;
}

.record-dialog {
  padding: 1rem 0;
}

.current-time {
  padding-top: 2rem;
  text-align: center;
  font-size: 0.65rem;
  color: #6d6d6d;
}

.current-weight {
  text-align: center;
  font-size: 3rem;
  font-weight: bold;

  span {
    font-size: 0.8rem;
    padding-left: 0.5rem;
    font-weight: normal;
  }
}

.rank {
  text-align: center;
  font-weight: bold;
  font-size: 0.9rem;
  color: #6d6d6d;
  margin-bottom: 0.5rem;

  .inc,
  .dec {
    display: inline-block;

    &::after {
      display: inline-block;
      font-weight: bold;
    }
  }

  .dec::after {
    content: '轻';
    color: green;
    font-size: 10px;
    transform: scale(0.8);
  }

  .inc::after {
    content: '增加';
    color: #ff6034;
    font-size: 10px;
    transform: scale(0.8);
  }

  .res {
    color: #ff8917;
  }
}

.weight-list {
  padding: 0 0.5rem;
  overflow-y: scroll;
  height: calc(100vh - 380px);
  padding-bottom: 3rem;
}

.control {
  text-align: center;
}

.van-cell {
  justify-content: space-between;
}

.add-record {
  position: fixed;
  right: 2rem;
  bottom: 2.5rem;
  width: 3rem;
  height: 3rem;
  color: #fff;
  background-color: v-bind(themeColor);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.jin {
  font-size: 1rem;
  line-height: 1rem;
}

.family-select-wrapper {
  position: relative;
  margin-top: 46px;

  .edit-family-name {
    position: absolute;
    right: 1rem;
    top: 50%;
  }

  .delete-family-name {
    position: absolute;
    left: 1rem;
    top: 50%;
  }
}
</style>
<style>
.van-dropdown-item__content {
  padding-top: 0;
}
</style>
