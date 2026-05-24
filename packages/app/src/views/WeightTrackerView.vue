<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { showConfirmDialog, showSuccessToast, showToast } from 'vant'
import { useRouter } from 'vue-router'
import TimeRangePicker from '@/components/TimeRangePicker/TimeRangePicker.vue'
import { preventBack } from '@/lib/router'
import { getTimeDiffDes } from '@/lib/weight-utils'
import { getWeightList, addWeight, updateWeight, deleteWeight, type WeightRecord } from '@/service/weight'
import { useFamily } from '@/composables/useFamily'

type TabName = 'home' | 'stats'
type RangeName = 'day' | 'month' | 'year' | 'custom'
type TimeGroup = 'night' | 'morning' | 'noon' | 'afternoon' | 'evening'

interface ChartPoint {
  date: string
  label: string
  value: number
  x: number
  y: number
  highlight?: 'high' | 'low'
}

const themeColor = '#1976ff'
const router = useRouter()
const currentFamilyId = useLocalStorage('weight_current_family', 'default')
const { store: familyStore, familyOptions, refreshFamilies, handleAddFamily, handleUpdateFamily, handleDeleteFamily } = useFamily(currentFamilyId)
const isKG = ref(localStorage.getItem('weight-kg') === 'true')
const activeTab = ref<TabName>('home')
const range = ref<RangeName>('day')
const records = ref<WeightRecord[]>([])
const statsRecords = ref<WeightRecord[]>([])
const listLoading = ref(false)
const listFinished = ref(false)
const listPage = ref(1)
const pageSize = 30
const selectedRecord = ref<WeightRecord | null>(null)
const showRecordPopup = ref(false)
const showRecordActions = ref(false)
const showFamilySheet = ref(false)
const showAddFamilyDialog = ref(false)
const showEditFamilyDialog = ref(false)
const showStatsRangePicker = ref(false)
const familyNameDraft = ref('')
const editingFamilyId = ref('')
const inputSelected = ref(false)
const scaleDragging = ref(false)
const scaleDragStartX = ref(0)
const scaleDragStartValue = ref(0)
const scaleDragOffset = ref(0)
const homeChartScrollRef = ref<HTMLElement | null>(null)
const homeChartFitPercent = ref(0)
const homeChartScrollPercent = ref(0)
const homeChartCanScroll = ref(false)
const homeChartViewportWidth = ref(300)
const showHomeChartToolbar = ref(false)
const customRange = ref<[number, number]>([
  dayjs().subtract(6, 'day').startOf('day').valueOf(),
  dayjs().endOf('day').valueOf()
])
const isInitializingFamilySelection = ref(false)

const state = reactive({
  date: dayjs().format('YYYY/MM/DD'),
  time: dayjs().format('HH:mm'),
  timeValue: [dayjs().format('HH'), dayjs().format('mm')],
  showCalendar: false,
  showTimePicker: false,
  weightInput: '',
  tips: '',
  editRecordId: ''
})

preventBack(state, 'showCalendar')
preventBack(state, 'showTimePicker')
preventBack(showRecordPopup)
preventBack(showRecordActions)
preventBack(showFamilySheet)
preventBack(showAddFamilyDialog)
preventBack(showEditFamilyDialog)
preventBack(showStatsRangePicker)

watch(isKG, (value, oldValue) => {
  localStorage.setItem('weight-kg', `${value}`)
  if (oldValue === undefined || !showRecordPopup.value || !state.weightInput) return
  const current = Number(state.weightInput)
  if (!Number.isFinite(current)) return
  const kgValue = oldValue ? current : current / 2
  state.weightInput = formatNumber(value ? kgValue : kgValue * 2, 1)
})

watch(currentFamilyId, () => {
  if (isInitializingFamilySelection.value) return
  refreshAllData()
})

watch(range, () => {
  loadStatsRecords()
})

const sortedRecords = computed(() => {
  return [...records.value].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const latestRecord = computed(() => sortedRecords.value[0])

const latestWeight = computed(() => latestRecord.value?.weight || 0)

const currentFamilyName = computed(() => {
  const matched = familyOptions.value.find(item => item.value === currentFamilyId.value)
  if (!matched) return ''
  if (matched.value === 'default' && matched.text === '默认') return ''
  return matched.text
})

const greetingText = computed(() => {
  const prefix = getTimeGreeting()
  return currentFamilyName.value ? `${prefix}，${currentFamilyName.value}` : prefix
})

const encouragementText = computed(() => {
  const group = getTimeGroup()
  const candidates = encouragementMessages[group]
  const index = (dayjs().date() + dayjs().hour()) % candidates.length
  return candidates[index]
})

const familyRows = computed(() => {
  return familyOptions.value.map(item => {
    const detail = familyStore.familyList.find(family => family.familyId === item.value)
    return {
      ...item,
      canDelete: item.value !== 'default' && !!detail?.canDelete
    }
  })
})

const currentWeightText = computed(() => formatNumber(displayWeight(latestWeight.value), 1))

const overviewData = computed(() => {
  const result = []
  const latest = latestRecord.value
  if (!latest) return []

  const lastTime = sortedRecords.value.length === 1 ? latest : sortedRecords.value[1]
  result.push({
    text: `与上一次比较(${getTimeDiffDes(latest.date, lastTime.date)})`,
    ...getWeightDiffText(latest.weight, lastTime.weight)
  })

  const todayRecords = sortedRecords.value.filter(item => dayjs(item.date).isSame(dayjs(), 'day'))
  if (todayRecords.length) {
    const todayFirst = todayRecords[todayRecords.length - 1]
    result.push({
      text: `与今天首次比较(${getTimeDiffDes(latest.date, todayFirst.date)})`,
      ...getWeightDiffText(latest.weight, todayFirst.weight)
    })
  }

  const monthRecords = sortedRecords.value.filter(item => dayjs(item.date).isSame(dayjs(), 'month'))
  if (monthRecords.length) {
    const monthFirst = monthRecords[monthRecords.length - 1]
    result.push({
      text: `与本月首次比较(${getTimeDiffDes(latest.date, monthFirst.date)})`,
      ...getWeightDiffText(latest.weight, monthFirst.weight)
    })
  }

  return result
})

const homeTrendDailyRecords = computed(() => normalizeDailyRecords(records.value))

const homeChartFitWidth = computed(() => Math.max(300, homeChartViewportWidth.value))

const homeChartSvgWidth = computed(() => {
  const wideWidth = getChartWidth(homeTrendDailyRecords.value.length, 56)
  const fitWidth = homeChartFitWidth.value
  const fitRatio = homeChartFitPercent.value / 100
  return Math.round(wideWidth - (wideWidth - fitWidth) * fitRatio)
})

const homeChartViewBox = computed(() => `0 0 ${homeChartSvgWidth.value} 128`)

const homeChartPoints = computed(() => buildChartPoints(homeTrendDailyRecords.value, 'day', homeChartSvgWidth.value))

const homeChartLinePoints = computed(() => homeChartPoints.value.map(point => `${point.x},${point.y}`).join(' '))

const homeChartAreaPoints = computed(() => buildChartAreaPoints(homeChartPoints.value, homeChartLinePoints.value))

const homeChartLabelStep = computed(() => {
  const count = homeChartPoints.value.length
  if (count <= 1) return 1
  const gap = (homeChartSvgWidth.value - 48) / (count - 1)
  return Math.max(1, Math.ceil(34 / gap))
})

watch(() => [homeChartSvgWidth.value, homeChartPoints.value.length], () => {
  nextTick(() => {
    syncHomeChartScroll(homeChartScrollPercent.value)
  })
})

const chartPoints = computed<ChartPoint[]>(() => {
  return buildChartPoints(compactChartRecords(normalizeDailyRecords(statsRecords.value)), range.value)
})

const chartLinePoints = computed(() => chartPoints.value.map(point => `${point.x},${point.y}`).join(' '))

const statsSummary = computed(() => {
  const source = statsRecords.value
  if (!source.length) {
    return { high: 0, low: 0 }
  }
  return {
    high: Math.max(...source.map(item => item.weight)),
    low: Math.min(...source.map(item => item.weight))
  }
})

const canSaveRecord = computed(() => Number(state.weightInput) > 0)

const tabItems: Array<{ name: TabName, text: string, icon: string }> = [
  { name: 'home', text: '首页', icon: 'wap-home-o' },
  { name: 'stats', text: '统计', icon: 'bar-chart-o' }
]

const keypadItems = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

const rangeItems: Array<{ name: Exclude<RangeName, 'custom'>, text: string }> = [
  { name: 'day', text: '日' },
  { name: 'month', text: '月' },
  { name: 'year', text: '年' }
]

const todayLabel = computed(() => {
  const selected = dayjs(state.date, 'YYYY/MM/DD')
  return selected.isSame(dayjs(), 'day') ? '今天' : formatRecordWeekday(selected.toDate())
})

const statsRangeLabel = computed(() => {
  if (range.value === 'custom') {
    const [start, end] = customRange.value
    return `${dayjs(start).format('YYYY年M月D日')} - ${dayjs(end).format('M月D日')}`
  }
  if (range.value === 'day') return dayjs().format('YYYY年M月D日')
  if (range.value === 'month') return dayjs().format('YYYY年M月')
  return dayjs().format('YYYY年')
})

const scaleDisplayValue = computed(() => {
  const inputValue = Number(state.weightInput)
  if (Number.isFinite(inputValue) && inputValue > 0) return inputValue
  return displayWeight(latestWeight.value || 50)
})

const scaleLabels = computed(() => {
  const step = isKG.value ? 0.5 : 1
  const start = scaleDisplayValue.value - step * 3
  return Array.from({ length: 7 }, (_, index) => {
    const value = Math.max(start + step * index, 0)
    return formatNumber(value, isKG.value ? 1 : 0)
  })
})

const scaleTrackStyle = computed(() => ({
  transform: `translateX(${scaleDragOffset.value}px)`
}))

const selectedRecordDateTime = computed(() => {
  if (!selectedRecord.value) return ''
  return dayjs(selectedRecord.value.date).format('YYYY/MM/DD HH:mm')
})

function getStatsRange() {
  if (range.value === 'custom') {
    const [start, end] = customRange.value
    return { start, end }
  }
  const now = dayjs()
  if (range.value === 'day') {
    return { start: now.startOf('day').valueOf(), end: now.endOf('day').valueOf() }
  }
  if (range.value === 'month') {
    return { start: now.startOf('month').valueOf(), end: now.endOf('month').valueOf() }
  }
  return { start: now.startOf('year').valueOf(), end: now.endOf('year').valueOf() }
}

function getChartWidth(pointCount: number, minGap = 36) {
  if (pointCount <= 1) return 300
  const left = 24
  const right = 24
  return Math.max(300, left + right + (pointCount - 1) * minGap)
}

function buildChartPoints(source: WeightRecord[], chartRange: RangeName, width = 300): ChartPoint[] {
  if (!source.length) return []

  const values = source.map(item => item.weight)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const gap = Math.max(max - min, 0.8)
  const top = max + gap * 0.25
  const bottom = min - gap * 0.25
  const left = 24
  const right = 24
  const usableWidth = width - left - right
  const usableHeight = 86
  const topOffset = 20

  return source.map((item, index) => {
    const x = source.length === 1 ? width / 2 : left + (usableWidth * index) / (source.length - 1)
    const y = topOffset + ((top - item.weight) / (top - bottom || 1)) * usableHeight
    const highlight: ChartPoint['highlight'] = item.weight === max ? 'high' : item.weight === min ? 'low' : undefined
    return {
      date: dayjs(item.date).format('YYYY-MM-DD'),
      label: dayjs(item.date).format(chartRange === 'year' ? 'M月' : 'M/D'),
      value: item.weight,
      x,
      y,
      highlight
    }
  })
}

function buildChartAreaPoints(points: ChartPoint[], linePoints: string) {
  if (!points.length) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${first.x},112 ${linePoints} ${last.x},112`
}

function shouldShowHomeChartLabel(index: number) {
  const lastIndex = homeChartPoints.value.length - 1
  return index === 0 || index === lastIndex || index % homeChartLabelStep.value === 0
}

function updateHomeChartScrollState() {
  const el = homeChartScrollRef.value
  if (!el) return
  const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 0)
  homeChartViewportWidth.value = el.clientWidth || 300
  homeChartCanScroll.value = maxScroll > 1
  homeChartScrollPercent.value = maxScroll ? Math.round((el.scrollLeft / maxScroll) * 100) : 0
}

function syncHomeChartScroll(percent: number) {
  const el = homeChartScrollRef.value
  if (!el) return
  const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 0)
  el.scrollLeft = maxScroll * (percent / 100)
  updateHomeChartScrollState()
}

function handleHomeChartScroll() {
  updateHomeChartScrollState()
}

function handleHomeChartFitInput(event: Event) {
  const target = event.target as HTMLInputElement
  homeChartFitPercent.value = Number(target.value)
  nextTick(() => {
    syncHomeChartScroll(homeChartScrollPercent.value)
  })
}

function handleHomeChartScrollInput(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = Number(target.value)
  homeChartScrollPercent.value = percent
  syncHomeChartScroll(percent)
}

function toggleHomeChartToolbar() {
  showHomeChartToolbar.value = !showHomeChartToolbar.value
  if (showHomeChartToolbar.value) {
    nextTick(updateHomeChartScrollState)
  }
}

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return (0).toFixed(digits)
  return value.toFixed(digits)
}

function displayWeight(weight: number) {
  return isKG.value ? weight : weight * 2
}

function normalizeWeight(value: number) {
  return +(isKG.value ? value : value / 2).toFixed(2)
}

function formatRecordWeight(weight: number, digits = 1) {
  return formatNumber(displayWeight(weight), digits)
}

function getWeightDiffText(current: number, previous: number) {
  const diff = current - previous
  if (diff === 0) {
    return {
      symbol: '',
      res: '无变化'
    }
  }

  return {
    symbol: diff > 0 ? 'inc' : 'dec',
    res: `${formatRecordWeight(Math.abs(diff), 2)} ${isKG.value ? 'kg' : '斤'}`
  }
}

function formatRecordDate(date: string | Date) {
  const value = dayjs(date)
  if (value.isSame(dayjs(), 'day')) return '今天'
  if (value.isSame(dayjs().subtract(1, 'day'), 'day')) return '昨天'
  return value.format('M月D日')
}

function formatRecordWeekday(date: string | Date) {
  const weekdayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekdayMap[dayjs(date).day()]
}

function formatFullDate(date: string | Date) {
  return dayjs(date).format('YYYY年M月D日')
}

function normalizeDailyRecords(source: WeightRecord[]) {
  const daily = new Map<string, WeightRecord>()
  source.forEach(item => {
    const key = dayjs(item.date).format('YYYY-MM-DD')
    const exists = daily.get(key)
    if (!exists || dayjs(item.date).isAfter(dayjs(exists.date))) {
      daily.set(key, item)
    }
  })
  return Array.from(daily.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function compactChartRecords(source: WeightRecord[], limit?: number) {
  const maxPoints = limit || (range.value === 'day' ? 7 : 8)
  if (source.length <= maxPoints) return source

  const step = (source.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => source[Math.round(index * step)]).filter((item): item is WeightRecord => Boolean(item))
}

function ensureCurrentFamilySelection() {
  const options = familyOptions.value
  const optionValues = new Set(options.map(item => item.value))
  const familyIds = familyStore.familyList.map(item => item.familyId).filter(Boolean)

  if (currentFamilyId.value !== 'default' && optionValues.has(currentFamilyId.value)) return

  const storeFamilyId = familyStore.currentFamily.familyId
  if (storeFamilyId && storeFamilyId !== 'default' && optionValues.has(storeFamilyId)) {
    currentFamilyId.value = storeFamilyId
    return
  }

  if (familyIds.length && currentFamilyId.value === 'default') {
    currentFamilyId.value = familyIds[0]
    return
  }

  if (!optionValues.has(currentFamilyId.value)) {
    currentFamilyId.value = 'default'
  }
}

async function fetchRangeRecords(startTime: number, endTime: number) {
  const result: WeightRecord[] = []
  let page = 1
  const rangePageSize = 500
  while (page <= 10) {
    const res = await getWeightList(currentFamilyId.value, page, rangePageSize, { startTime, endTime })
    if (res.code !== 0) break
    result.push(...res.data)
    if (res.data.length < rangePageSize) break
    page += 1
  }
  return result
}

async function loadStatsRecords() {
  const { start, end } = getStatsRange()
  try {
    statsRecords.value = await fetchRangeRecords(start, end)
  } catch (error) {
    console.error(error)
    showToast('统计数据加载失败')
  }
}

async function onLoadRecords() {
  if (listFinished.value) return
  listLoading.value = true
  try {
    const res = await getWeightList(currentFamilyId.value, listPage.value, pageSize)
    if (res.code === 0) {
      if (listPage.value === 1) {
        records.value = res.data
      } else {
        records.value.push(...res.data)
      }
      listFinished.value = res.data.length < pageSize
      if (!listFinished.value) {
        listPage.value += 1
      }
      return
    }
    listFinished.value = true
    showToast('体重数据加载失败')
  } catch (error) {
    console.error(error)
    listFinished.value = true
    showToast('体重数据加载失败')
  } finally {
    listLoading.value = false
  }
}

async function refreshRecords() {
  listPage.value = 1
  listFinished.value = false
  records.value = []
  await onLoadRecords()
}

async function refreshAllData() {
  await Promise.all([
    refreshRecords(),
    loadStatsRecords()
  ])
}

function handleBack() {
  router.back()
}

function openRecord(record?: WeightRecord) {
  const target = record || latestRecord.value
  const recordDate = dayjs(record?.date || new Date())
  state.editRecordId = record?._id || ''
  state.date = recordDate.format('YYYY/MM/DD')
  state.time = recordDate.format('HH:mm')
  state.timeValue = [recordDate.format('HH'), recordDate.format('mm')]
  state.tips = record?.tips || ''
  state.weightInput = target ? formatNumber(displayWeight(target.weight), 1) : '50.0'
  inputSelected.value = true
  showRecordPopup.value = true
  nextTick(() => {
    window.scrollTo({ top: 0 })
  })
}

function normalizeInputText(value: string) {
  if (value === '.') return '0.'
  if (/^0\d/.test(value)) return String(Number(value))
  return value
}

function handleKeypadTap(key: string) {
  if (key === 'back') {
    state.weightInput = inputSelected.value ? '' : state.weightInput.slice(0, -1)
    inputSelected.value = false
    return
  }

  const base = inputSelected.value ? '' : state.weightInput
  if (key === '.' && base.includes('.')) return
  const nextValue = normalizeInputText(`${base}${key}`)
  if (nextValue.length > 5) return
  state.weightInput = nextValue
  inputSelected.value = false
}

function setWeightInputFromScale(value: number) {
  const clamped = Math.min(Math.max(value, 1), isKG.value ? 300 : 600)
  state.weightInput = formatNumber(clamped, 1)
  inputSelected.value = false
}

function beginScaleDrag(clientX: number) {
  scaleDragging.value = true
  scaleDragStartX.value = clientX
  scaleDragStartValue.value = scaleDisplayValue.value
  scaleDragOffset.value = 0
  inputSelected.value = false
}

function moveScaleDrag(clientX: number) {
  if (!scaleDragging.value) return
  const delta = clientX - scaleDragStartX.value
  const unitStep = isKG.value ? 0.1 : 0.2
  const value = scaleDragStartValue.value + Math.round(-delta / 12) * unitStep
  scaleDragOffset.value = Math.max(Math.min(delta, 36), -36)
  setWeightInputFromScale(value)
}

function endScaleDrag() {
  scaleDragging.value = false
  scaleDragOffset.value = 0
}

function handleCalendarConfirm(date: Date) {
  state.date = dayjs(date).format('YYYY/MM/DD')
  state.showCalendar = false
}

function handleTimeConfirm(timeSelect: { selectedValues: string[] }) {
  state.timeValue = timeSelect.selectedValues
  state.time = timeSelect.selectedValues.join(':')
  state.showTimePicker = false
}

function handleStatsRangeConfirm(res: { start: number; end: number; label: string }) {
  customRange.value = [res.start, res.end]
  range.value = 'custom'
  loadStatsRecords()
}

async function saveRecord() {
  const value = Number(state.weightInput)
  if (value <= 0) {
    showToast('请输入体重')
    return
  }

  const weight = normalizeWeight(value)
  const date = dayjs(`${state.date} ${state.time}`, 'YYYY/MM/DD HH:mm').toDate()

  try {
    if (state.editRecordId) {
      await updateWeight({
        id: state.editRecordId,
        weight,
        date,
        tips: state.tips
      })
      showSuccessToast('修改成功')
    } else {
      await addWeight({
        familyId: currentFamilyId.value === 'default' ? 'default' : currentFamilyId.value,
        weight,
        date,
        tips: state.tips,
        operator: 'self'
      })
      showSuccessToast('记录成功')
    }
    state.editRecordId = ''
    state.tips = ''
    await refreshAllData()
    showRecordPopup.value = false
    activeTab.value = 'home'
  } catch (error) {
    console.error(error)
    showToast('保存失败，请稍后重试')
  }
}

function openRecordAction(record: WeightRecord) {
  selectedRecord.value = record
  showRecordActions.value = true
}

function editSelectedRecord() {
  if (!selectedRecord.value) return
  showRecordActions.value = false
  openRecord(selectedRecord.value)
}

async function removeSelectedRecord() {
  if (!selectedRecord.value?._id) return
  const record = selectedRecord.value as WeightRecord & { _id: string }
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条体重记录吗？'
    })
    await deleteWeight(record._id)
    await refreshAllData()
    showRecordActions.value = false
    showSuccessToast('已删除')
  } catch (error) {
    if (error) {
      console.error(error)
    }
  }
}

function selectFamily(familyId: string) {
  currentFamilyId.value = familyId
  showFamilySheet.value = false
}

function openAddFamilyDialog() {
  familyNameDraft.value = ''
  showAddFamilyDialog.value = true
}

async function confirmAddFamily() {
  const name = familyNameDraft.value.trim()
  if (!name) {
    showToast('请输入昵称')
    return
  }
  await handleAddFamily(name)
}

function openEditFamilyDialog(familyId: string, name: string) {
  editingFamilyId.value = familyId
  familyNameDraft.value = name
  showEditFamilyDialog.value = true
}

async function confirmEditFamily() {
  const name = familyNameDraft.value.trim()
  if (!editingFamilyId.value || !name) {
    showToast('请输入昵称')
    return
  }
  await handleUpdateFamily(editingFamilyId.value, name)
}

async function removeFamily(familyId: string) {
  if (familyId === 'default') return
  await handleDeleteFamily(familyId)
}

function getTimeGroup(): TimeGroup {
  const hour = dayjs().hour()
  if (hour < 6) return 'night'
  if (hour < 11) return 'morning'
  if (hour < 14) return 'noon'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function getTimeGreeting() {
  const group = getTimeGroup()
  const map = {
    night: '夜深了',
    morning: '早上好',
    noon: '中午好',
    afternoon: '下午好',
    evening: '晚上好'
  }
  return map[group]
}

const encouragementMessages = {
  night: ['早点休息，明天继续稳稳记录', '睡前看一眼变化，心里更有数', '今晚也辛苦了，规律比完美更重要'],
  morning: ['坚持记录，遇见更好的自己', '新的一天，从了解身体开始', '今天也慢慢来，记录就是进步'],
  noon: ['午间复盘一下，节奏更稳', '一点点变化，都值得被看见', '保持记录，身体会给你答案'],
  afternoon: ['下午好，今天的状态也可以记下来', '数据会陪你看见长期变化', '稳定记录，比偶尔用力更可靠'],
  evening: ['晚上好，给今天留下一条身体线索', '今天记录了吗？小习惯会变成大改变', '把今天收个尾，明天更清楚方向']
}

onMounted(async () => {
  window.addEventListener('resize', updateHomeChartScrollState)
  await refreshFamilies()
  isInitializingFamilySelection.value = true
  ensureCurrentFamilySelection()
  isInitializingFamilySelection.value = false
  await refreshAllData()
  await nextTick()
  updateHomeChartScrollState()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHomeChartScrollState)
})
</script>

<template>
  <div class="weight-tracker">
    <section v-if="activeTab === 'home'" class="screen home-screen">
      <header class="home-hero safe-padding-top">
        <button class="plain-icon" type="button" aria-label="返回" @click="handleBack">
          <van-icon name="arrow-left" />
        </button>
        <button class="greeting" type="button" @click="showFamilySheet = true">
          <div class="avatar">
            <van-icon name="contact-o" />
          </div>
          <div>
            <h1>{{ greetingText }}</h1>
            <p>{{ encouragementText }}</p>
          </div>
        </button>
        <button class="plain-icon family-switch-button" type="button" aria-label="切换家人" @click="showFamilySheet = true">
          <van-icon name="friends-o" />
        </button>
      </header>

      <main class="home-content">
        <div class="metric-grid single">
          <article class="metric-card current-card">
            <div class="metric-title">
              <span>当前体重（{{ isKG ? 'kg' : '斤' }}）</span>
            </div>
            <strong>{{ currentWeightText }}</strong>
            <p>
              {{ latestRecord ? formatFullDate(latestRecord.date) : '暂无记录' }}
            </p>
          </article>
        </div>

        <button class="primary-action" type="button" @click="openRecord()">
          <van-icon name="plus" />
          <span>记录今日体重</span>
        </button>

        <article v-if="overviewData.length" class="panel overview-panel">
          <p v-for="(item, index) in overviewData" :key="index" class="overview-row">
            <span>{{ item.text }}</span>
            <strong :class="item.symbol">{{ item.res }}</strong>
          </p>
        </article>

        <article class="panel trend-panel">
          <div class="panel-header">
            <h2>最近趋势</h2>
            <div class="trend-panel-actions">
              <button
                v-if="homeChartPoints.length > 1"
                :class="['chart-tool-button', { active: showHomeChartToolbar }]"
                type="button"
                aria-label="显示或隐藏趋势图工具条"
                @click="toggleHomeChartToolbar"
              >
                <van-icon name="setting-o" />
              </button>
              <button class="unit-switch" type="button" @click="isKG = !isKG">
                {{ isKG ? 'kg' : '斤' }}
              </button>
            </div>
          </div>
          <div v-if="homeChartPoints.length" ref="homeChartScrollRef" class="mini-chart trend-chart-scroll" @scroll="handleHomeChartScroll">
            <div class="trend-chart-canvas" :style="{ width: `${homeChartSvgWidth}px` }">
              <svg :viewBox="homeChartViewBox" role="img" aria-label="最近体重趋势图">
                <defs>
                  <linearGradient id="weightFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#1976ff" stop-opacity="0.18" />
                    <stop offset="100%" stop-color="#1976ff" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <line v-for="line in [36, 62, 88]" :key="line" x1="24" :x2="homeChartSvgWidth - 24" :y1="line" :y2="line" class="grid-line" />
                <polygon :points="homeChartAreaPoints" fill="url(#weightFill)" />
                <polyline :points="homeChartLinePoints" class="trend-line" />
                <g v-for="(point, index) in homeChartPoints" :key="point.date">
                  <circle :cx="point.x" :cy="point.y" r="4" class="point-dot" />
                  <text v-if="shouldShowHomeChartLabel(index)" :x="point.x" :y="point.y - 10" class="point-label" text-anchor="middle">
                    {{ formatRecordWeight(point.value, 1) }}
                  </text>
                  <text v-if="shouldShowHomeChartLabel(index)" :x="point.x" y="122" class="axis-label" text-anchor="middle">
                    {{ point.label }}
                  </text>
                </g>
              </svg>
            </div>
          </div>
          <div v-if="homeChartPoints.length > 1 && showHomeChartToolbar" class="trend-chart-toolbar">
            <label class="chart-slider-row">
              <span>间距</span>
              <input
                :value="homeChartFitPercent"
                class="chart-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label="调整最近趋势横坐标间距"
                @input="handleHomeChartFitInput"
              />
            </label>
            <label v-if="homeChartCanScroll" class="chart-slider-row">
              <span>位置</span>
              <input
                :value="homeChartScrollPercent"
                class="chart-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label="横向滑动最近趋势图"
                @input="handleHomeChartScrollInput"
              />
            </label>
          </div>
          <van-empty v-if="!homeChartPoints.length" description="暂无趋势数据" />
        </article>

        <article class="record-list-panel home-record-panel">
          <div class="panel-header">
            <h2>体重记录（{{ isKG ? 'kg' : '斤' }}）</h2>
            <span>已加载 {{ sortedRecords.length }} 条</span>
          </div>
          <van-empty v-if="sortedRecords.length === 0 && !listLoading" description="暂无记录" />
          <van-list v-else v-model:loading="listLoading" :finished="listFinished" finished-text="没有更多了" :immediate-check="false" @load="onLoadRecords">
            <button v-for="record in sortedRecords" :key="record._id || String(record.date)" class="record-row" type="button" @click="openRecordAction(record)">
              <span class="record-main">
                <span>{{ formatRecordDate(record.date) }} <em>{{ formatRecordWeekday(record.date) }}</em></span>
                <small v-if="record.tips">{{ record.tips }}</small>
              </span>
              <strong>{{ formatRecordWeight(record.weight, 2) }} {{ isKG ? 'kg' : '斤' }}</strong>
              <van-icon name="arrow" />
            </button>
          </van-list>
        </article>
      </main>
    </section>

    <section v-else-if="activeTab === 'stats'" class="screen stats-screen safe-padding-top">
      <header class="page-header">
        <button class="plain-icon dark" type="button" aria-label="返回首页" @click="activeTab = 'home'">
          <van-icon name="arrow-left" />
        </button>
        <h1>体重趋势</h1>
        <button class="plain-icon dark" type="button" aria-label="自定义日期范围" @click="showStatsRangePicker = true">
          <van-icon name="calendar-o" />
        </button>
      </header>

      <main class="stats-content">
        <div class="range-tabs">
          <button
            v-for="item in rangeItems"
            :key="item.name"
            type="button"
            :class="{ active: range === item.name }"
            @click="range = item.name"
          >
            {{ item.text }}
          </button>
        </div>

        <article class="panel stats-chart-card">
          <div class="panel-header">
            <h2>体重趋势（{{ isKG ? 'kg' : '斤' }}）</h2>
            <div class="legend">
              <span class="high">最高 {{ formatRecordWeight(statsSummary.high, 1) }}</span>
              <span class="low">最低 {{ formatRecordWeight(statsSummary.low, 1) }}</span>
            </div>
          </div>
          <p class="range-label">{{ statsRangeLabel }}</p>
          <div v-if="chartPoints.length" class="large-chart">
            <svg viewBox="0 0 300 128" role="img" aria-label="体重趋势图">
              <line v-for="line in [32, 56, 80, 104]" :key="line" x1="18" x2="286" :y1="line" :y2="line" class="grid-line" />
              <polyline :points="chartLinePoints" class="trend-line" />
              <g v-for="point in chartPoints" :key="point.date">
                <circle :cx="point.x" :cy="point.y" r="4" :class="['point-dot', point.highlight]" />
                <text :x="point.x" :y="point.y - 9" :class="['point-label', point.highlight]" text-anchor="middle">
                  {{ formatRecordWeight(point.value, 1) }}
                </text>
                <text :x="point.x" y="122" class="axis-label" text-anchor="middle">
                  {{ point.label }}
                </text>
              </g>
            </svg>
          </div>
          <van-empty v-else description="暂无趋势数据" />
        </article>

        <article class="record-list-panel">
          <div class="panel-header">
            <h2>体重记录</h2>
            <span>已加载 {{ sortedRecords.length }} 条</span>
          </div>
          <van-empty v-if="sortedRecords.length === 0 && !listLoading" description="暂无记录" />
          <van-list v-else v-model:loading="listLoading" :finished="listFinished" finished-text="没有更多了" :immediate-check="false" @load="onLoadRecords">
            <button v-for="record in sortedRecords" :key="record._id || String(record.date)" class="record-row" type="button" @click="openRecordAction(record)">
              <span class="record-main">
                <span>{{ formatRecordDate(record.date) }} <em>{{ formatRecordWeekday(record.date) }}</em></span>
                <small v-if="record.tips">{{ record.tips }}</small>
              </span>
              <strong>{{ formatRecordWeight(record.weight, 1) }} {{ isKG ? 'kg' : '斤' }}</strong>
              <van-icon name="arrow" />
            </button>
          </van-list>
        </article>
      </main>
    </section>

    <nav class="weight-tabbar safe-padding-bottom">
      <button
        v-for="item in tabItems"
        :key="item.name"
        type="button"
        :class="{ active: activeTab === item.name }"
        @click="activeTab = item.name"
      >
        <van-icon :name="item.icon" />
        <span>{{ item.text }}</span>
      </button>
    </nav>

    <van-calendar
      v-model:show="state.showCalendar"
      :min-date="new Date(2015, 0, 1)"
      :max-date="new Date()"
      :color="themeColor"
      @confirm="handleCalendarConfirm"
    />

    <van-popup v-model:show="state.showTimePicker" position="bottom" round>
      <van-time-picker v-model="state.timeValue" title="选择时间" @confirm="handleTimeConfirm" @cancel="state.showTimePicker = false" />
    </van-popup>

    <TimeRangePicker
      v-model:show="showStatsRangePicker"
      type="custom"
      :current-range="customRange"
      @confirm="handleStatsRangeConfirm"
    />

    <van-popup v-model:show="showRecordPopup" position="bottom" round :style="{ height: '100%' }">
      <section class="record-popup-sheet">
        <header class="page-header">
          <button class="plain-icon dark" type="button" aria-label="关闭弹窗" @click="showRecordPopup = false">
            <van-icon name="arrow-left" />
          </button>
          <h1>{{ state.editRecordId ? '修改体重' : '记录体重' }}</h1>
          <button class="plain-icon dark" type="button" aria-label="切换单位" @click="isKG = !isKG">
            <van-icon name="exchange" />
          </button>
        </header>

        <main class="record-content">
          <div class="field-label">记录时间</div>
          <div class="date-time-grid">
            <button class="date-select" type="button" @click="state.showCalendar = true">
              <van-icon name="calendar-o" />
              <span class="select-main">
                <strong>{{ formatFullDate(dayjs(state.date, 'YYYY/MM/DD').toDate()) }}</strong>
                <em>{{ todayLabel }}</em>
              </span>
              <van-icon name="arrow-down" />
            </button>
            <button class="date-select time-select" type="button" @click="state.showTimePicker = true">
              <van-icon name="clock-o" />
              <span class="select-main">
                <strong>{{ state.time }}</strong>
                <em>时间</em>
              </span>
              <van-icon name="arrow-down" />
            </button>
          </div>

          <div class="record-value">
            <strong :class="{ selected: inputSelected }">{{ state.weightInput || '0' }}</strong>
            <span>{{ isKG ? 'kg' : '斤' }}</span>
          </div>

          <div
            :class="['weight-scale', { dragging: scaleDragging }]"
            aria-label="滑动微调体重"
            @touchstart.passive="beginScaleDrag($event.touches[0].clientX)"
            @touchmove.passive="moveScaleDrag($event.touches[0].clientX)"
            @touchend="endScaleDrag"
            @mousedown="beginScaleDrag($event.clientX)"
            @mousemove="moveScaleDrag($event.clientX)"
            @mouseup="endScaleDrag"
            @mouseleave="endScaleDrag"
          >
            <div class="scale-track" :style="scaleTrackStyle">
              <span v-for="tick in 41" :key="tick" :class="{ major: tick % 5 === 1 }"></span>
            </div>
            <i class="scale-center"></i>
          </div>
          <p class="scale-hint">左右滑动微调体重</p>
          <div class="scale-labels">
            <span v-for="label in scaleLabels" :key="label">{{ label }}</span>
          </div>

          <div class="keypad">
            <button v-for="key in keypadItems" :key="key" type="button" @click="handleKeypadTap(key)">
              <van-icon v-if="key === 'back'" name="clear" />
              <span v-else>{{ key }}</span>
            </button>
          </div>

          <label class="note-box">
            <span>备注（可选）</span>
            <textarea v-model="state.tips" maxlength="100" rows="3" placeholder="记录一下今天的状态吧..." />
            <em>{{ state.tips.length }}/100</em>
          </label>

          <button class="save-button" type="button" :disabled="!canSaveRecord" @click="saveRecord">
            保存记录
          </button>
        </main>
      </section>
    </van-popup>

    <van-popup v-model:show="showRecordActions" position="bottom" round closeable>
      <div class="record-detail-popup">
        <h2 class="popup-title">体重详情</h2>
        <div v-if="selectedRecord" class="detail-list">
          <div class="detail-item">
            <span class="label">记录时间</span>
            <span class="value">{{ selectedRecordDateTime }}</span>
          </div>
          <div class="detail-item">
            <span class="label">体重</span>
            <span class="value">{{ formatRecordWeight(selectedRecord.weight, 2) }}<span class="unit">{{ isKG ? 'kg' : '斤' }}</span></span>
          </div>
          <div v-if="selectedRecord.tips" class="detail-item full-width">
            <span class="label">备注</span>
            <span class="value note-text">{{ selectedRecord.tips }}</span>
          </div>
        </div>
        <div class="record-actions">
          <button class="detail-action primary" type="button" @click="editSelectedRecord">
            <van-icon name="edit" />
            编辑记录
          </button>
          <button class="detail-action danger" type="button" @click="removeSelectedRecord">
            <van-icon name="delete-o" />
            删除记录
          </button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showFamilySheet" position="right" class="family-sheet-popup" :style="{ width: '100%', height: '100%' }">
      <section class="family-picker safe-padding-top">
        <header class="family-picker-header">
          <button class="plain-icon dark" type="button" aria-label="关闭" @click="showFamilySheet = false">
            <van-icon name="cross" />
          </button>
          <h2>选择家人</h2>
          <span></span>
        </header>

        <main class="family-picker-list">
          <div
            v-for="family in familyRows"
            :key="family.value"
            :class="['family-row', { active: currentFamilyId === family.value }]"
            @click="selectFamily(family.value)"
          >
            <span class="family-row-avatar">
              <van-icon name="contact-o" />
            </span>
            <span class="family-row-main">
              <strong>{{ family.text }}</strong>
              <em>{{ family.value === 'default' ? '默认记录对象' : '家人体重记录' }}</em>
            </span>
            <van-icon v-if="currentFamilyId === family.value" name="success" class="family-row-check" />
            <button type="button" class="family-row-action" aria-label="编辑家人" @click.stop="openEditFamilyDialog(family.value, family.text)">
              <van-icon name="edit" />
            </button>
            <button
              v-if="family.canDelete"
              type="button"
              class="family-row-action danger"
              aria-label="删除家人"
              @click.stop="removeFamily(family.value)"
            >
              <van-icon name="delete" />
            </button>
          </div>
        </main>

        <footer class="family-picker-footer safe-padding-bottom">
          <button type="button" class="primary-action compact" @click="openAddFamilyDialog">
            <van-icon name="plus" />
            <span>添加家人</span>
          </button>
        </footer>
      </section>
    </van-popup>

    <van-dialog v-model:show="showAddFamilyDialog" title="添加家人" show-cancel-button @confirm="confirmAddFamily">
      <van-field v-model="familyNameDraft" autofocus label="昵称" placeholder="请输入家人昵称" />
    </van-dialog>

    <van-dialog v-model:show="showEditFamilyDialog" title="修改家人" show-cancel-button @confirm="confirmEditFamily">
      <van-field v-model="familyNameDraft" autofocus label="昵称" placeholder="请输入新的昵称" />
    </van-dialog>

  </div>
</template>

<style lang="scss" scoped>
.weight-tracker {
  min-height: 100vh;
  background: #f5f8fc;
  color: #172033;
  overflow-x: hidden;
}

.screen {
  min-height: 100vh;
  padding-bottom: calc(86px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

button {
  border: 0;
  font: inherit;
  color: inherit;
  background: none;
}

.plain-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  font-size: 20px;

  &.dark {
    color: #111827;
  }
}

.home-hero {
  min-height: 176px;
  padding: calc(18px + env(safe-area-inset-top)) 20px 28px;
  background: linear-gradient(145deg, #0867ff 0%, #44a8ff 100%);
  color: #fff;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: flex-start;
  gap: 12px;
  box-sizing: border-box;
}

.greeting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  text-align: left;

  h1 {
    margin: 0 0 4px;
    font-size: 18px;
    line-height: 1.25;
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.greeting-arrow {
  margin-left: auto;
  flex: none;
  color: rgba(255, 255, 255, 0.82);
}

.family-switch-button {
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(10px);
}

.avatar,
.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fff;
  color: #1976ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 8px 18px rgba(22, 91, 202, 0.18);
}

.home-content {
  padding: 0 16px 24px;
  margin-top: -34px;
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  &.single {
    grid-template-columns: 1fr;
  }
}

.metric-card,
.panel,
.record-list-panel {
  border: 1px solid rgba(202, 213, 225, 0.72);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 30px rgba(30, 64, 111, 0.08);
}

.metric-card {
  min-height: 144px;
  padding: 18px 14px;
  box-sizing: border-box;
}

.metric-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #556070;
  font-size: 12px;
}

.current-card {
  strong {
    display: block;
    margin-top: 14px;
    font-size: clamp(42px, 13vw, 58px);
    line-height: 1;
    color: #1976ff;
    font-family: "DIN Alternate", sans-serif;
  }

  p {
    margin: 10px 0 0;
    font-size: 12px;
    color: #6b7280;

    span {
      color: #172033;
      font-weight: 700;
    }
  }
}

.primary-action,
.save-button {
  width: 100%;
  height: 52px;
  margin: 18px 0;
  border-radius: 26px;
  background: linear-gradient(135deg, #1f7dff, #0f64eb);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 12px 22px rgba(25, 118, 255, 0.26);

  &:disabled {
    opacity: 0.55;
    box-shadow: none;
  }

  &.compact {
    height: 48px;
    margin: 0;
  }
}

.panel,
.record-list-panel {
  padding: 14px;
  margin-top: 14px;
}

.overview-panel {
  display: grid;
  gap: 10px;
}

.overview-row {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #556070;
  font-size: 13px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    white-space: nowrap;
    color: #64748b;

    &.inc {
      color: #f04438;
    }

    &.dec {
      color: #16a34a;
    }
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  span {
    color: #6b7280;
    font-size: 12px;
  }
}

.unit-switch {
  min-width: 44px;
  height: 26px;
  border-radius: 999px;
  background: #eef5ff;
  color: #1976ff;
  font-size: 12px;
  font-weight: 700;
}

.trend-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-tool-button {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #f3f7ff;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;

  .van-icon {
    font-size: 17px;
  }

  &.active {
    background: #1976ff;
    color: #fff;
    transform: rotate(45deg);
  }
}

.mini-chart,
.large-chart {
  height: 150px;
  margin-top: 8px;

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
}

.trend-chart-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.trend-chart-canvas {
  min-width: 100%;
  height: 100%;
}

.trend-chart-toolbar {
  margin-top: 8px;
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f6f9ff;
  border: 1px solid #e5edf8;
}

.chart-slider-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 11px;
}

.chart-slider {
  width: 100%;
  height: 24px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: ew-resize;

  &::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(25, 118, 255, 0.22), rgba(25, 118, 255, 0.72));
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    margin-top: -6px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #1976ff;
    box-shadow: 0 4px 12px rgba(25, 118, 255, 0.22);
  }

  &::-moz-range-track {
    height: 6px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(25, 118, 255, 0.22), rgba(25, 118, 255, 0.72));
  }

  &::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #1976ff;
    box-shadow: 0 4px 12px rgba(25, 118, 255, 0.22);
  }
}

.grid-line {
  stroke: #e5ebf3;
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.trend-line {
  fill: none;
  stroke: #1976ff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.point-dot {
  fill: #fff;
  stroke: #1976ff;
  stroke-width: 2.2;

  &.high {
    stroke: #f04438;
  }

  &.low {
    stroke: #16a34a;
  }
}

.point-label,
.axis-label {
  font-size: 10px;
  fill: #475569;
}

.point-label.high {
  fill: #f04438;
}

.point-label.low {
  fill: #16a34a;
}

.axis-label {
  fill: #798291;
}

.page-header {
  height: 58px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;

  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
}

.stats-content {
  padding: 12px 16px 24px;
}

.record-content {
  min-height: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.record-popup-sheet {
  height: 100%;
  background: #f5f8fc;
  padding-top: env(safe-area-inset-top);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  box-sizing: border-box;
  overflow: hidden;
}

.field-label {
  margin-bottom: 6px;
  color: #3f4958;
  font-size: 12px;
}

.date-select {
  width: 100%;
  min-width: 0;
  min-height: 50px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
  background: #fff;
  color: #1976ff;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  box-sizing: border-box;
  text-align: left;

  .select-main {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
  }

  em {
    color: #8792a2;
    font-size: 12px;
    line-height: 1.2;
    font-style: normal;
  }
}

.date-time-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 98px;
  gap: 10px;
}

.time-select {
  grid-template-columns: 16px minmax(0, 1fr) 14px;
  gap: 3px;
  padding: 8px;

  strong {
    font-size: 15px;
    text-align: center;
  }

  em {
    display: none;
  }
}

.record-value {
  margin: 10px 0 8px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;

  strong {
    color: #1976ff;
    font-size: clamp(48px, 15vh, 76px);
    line-height: 1;
    font-family: "DIN Alternate", sans-serif;

    &.selected {
      border-radius: 8px;
      background: rgba(25, 118, 255, 0.1);
      box-shadow: 0 0 0 8px rgba(25, 118, 255, 0.1);
    }
  }

  span {
    color: #556070;
    font-size: 18px;
  }
}

.weight-scale {
  position: relative;
  height: 32px;
  margin: 0 auto;
  border-radius: 18px;
  background: linear-gradient(180deg, #f6faff, #eef5ff);
  color: #b6c0cf;
  cursor: ew-resize;
  touch-action: pan-y;
  user-select: none;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(25, 118, 255, 0.08);

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 42px;
    z-index: 2;
    pointer-events: none;
  }

  &::before {
    left: 0;
    background: linear-gradient(90deg, #eef5ff, rgba(238, 245, 255, 0));
  }

  &::after {
    right: 0;
    background: linear-gradient(270deg, #eef5ff, rgba(238, 245, 255, 0));
  }

  &.dragging {
    box-shadow:
      inset 0 0 0 1px rgba(25, 118, 255, 0.2),
      0 8px 18px rgba(25, 118, 255, 0.12);
  }

  &.dragging .scale-track {
    transition: none;
  }

  span {
    width: 1px;
    height: 10px;
    background: currentColor;
  }

  .major {
    height: 18px;
    background: #1976ff;
  }
}

.scale-track {
  height: 100%;
  min-width: 126%;
  margin-left: -13%;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 7px;
  padding-bottom: 7px;
  box-sizing: border-box;
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.scale-center {
  position: absolute;
  left: 50%;
  bottom: 6px;
  width: 2px;
  height: 22px;
  border-radius: 999px;
  background: #1976ff;
  transform: translateX(-50%);
  z-index: 3;
  box-shadow: 0 0 0 4px rgba(25, 118, 255, 0.12);
}

.scale-hint {
  margin: 4px 0 2px;
  color: #7d8795;
  font-size: 11px;
  text-align: center;
}

.scale-labels {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  color: #556070;
  font-size: 11px;
  text-align: center;
  margin: 2px 0 8px;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;

  button {
    height: clamp(38px, 7vh, 48px);
    border: 1px solid #dfe7f1;
    border-radius: 8px;
    background: #fff;
    font-size: 24px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(30, 64, 111, 0.04);

    &:active {
      background: #eef5ff;
    }
  }
}

.note-box {
  display: block;
  margin-top: 8px;
  min-height: 0;

  span {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: #3f4958;
  }

  textarea {
    width: 100%;
    min-height: clamp(44px, 10vh, 64px);
    border: 1px solid #dce5ef;
    border-radius: 8px;
    resize: none;
    padding: 9px 10px;
    box-sizing: border-box;
    outline: none;
    color: #172033;
    background: #fff;
  }

  em {
    display: block;
    margin-top: -24px;
    padding-right: 12px;
    text-align: right;
    color: #94a3b8;
    font-size: 12px;
    font-style: normal;
    pointer-events: none;
  }
}

.record-popup-sheet .save-button {
  height: 46px;
  margin: 10px 0 0;
  flex: none;
}

.range-tabs {
  height: 36px;
  padding: 3px;
  border-radius: 8px;
  background: #e9eef6;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    border-radius: 8px;
    color: #475569;

    &.active {
      color: #fff;
      background: #1976ff;
      font-weight: 700;
      box-shadow: 0 6px 12px rgba(25, 118, 255, 0.22);
    }
  }
}

.range-label {
  margin: 8px 0 0;
  color: #7d8795;
  font-size: 12px;
}

.legend {
  display: flex;
  gap: 10px;
  white-space: nowrap;

  .high::before,
  .low::before {
    content: '';
    width: 5px;
    height: 5px;
    display: inline-block;
    margin-right: 4px;
    border-radius: 50%;
    vertical-align: 1px;
  }

  .high::before {
    background: #f04438;
  }

  .low::before {
    background: #16a34a;
  }
}

.record-list-panel {
  h2 {
    margin: 0 0 12px;
    font-size: 15px;
  }
}

.record-row {
  width: 100%;
  min-height: 54px;
  padding: 8px 0;
  display: grid;
  grid-template-columns: 1fr auto 18px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #edf1f7;
  text-align: left;

  &:last-child {
    border-bottom: 0;
  }

  span {
    font-size: 13px;
    color: #3f4958;

    em {
      margin-left: 8px;
      color: #8792a2;
      font-style: normal;
    }
  }

  strong {
    color: #1976ff;
  }
}

.record-main {
  min-width: 0;
  display: grid;
  gap: 3px;

  small {
    min-width: 0;
    color: #8792a2;
    font-size: 12px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.weight-tabbar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 62px;
  padding: 6px 10px;
  border: 1px solid rgba(202, 213, 225, 0.82);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  z-index: 5;
  box-sizing: border-box;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px);

  button {
    border-radius: 22px;
    color: #758195;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;

    .van-icon {
      font-size: 20px;
    }

    &.active {
      color: #1976ff;
      background: #eef5ff;
      font-weight: 700;
    }
  }
}

.record-detail-popup {
  padding: 18px 16px calc(16px + env(safe-area-inset-bottom));
}

.popup-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}

.detail-list {
  margin-top: 6px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid #edf1f7;

  &.full-width {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;

    .value {
      width: 100%;
      box-sizing: border-box;
      border-radius: 6px;
      background: #f5f8fc;
      padding: 10px;
      line-height: 1.5;
      word-break: break-all;
    }
  }

  .label {
    color: #3f4958;
    font-size: 15px;
  }

  .value {
    color: #172033;
    font-size: 15px;
    font-weight: 600;

    .unit {
      margin-left: 3px;
      color: #8792a2;
      font-size: 12px;
      font-weight: 400;
    }
  }
}

.record-actions {
  display: grid;
  gap: 12px;
  padding: 18px 0 0;
}

.detail-action {
  width: 100%;
  height: 48px;
  border-radius: 24px;
  color: #fff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 10px 20px rgba(25, 118, 255, 0.2);

  &.primary {
    background: linear-gradient(135deg, #1f7dff, #0f64eb);
  }

  &.danger {
    background: #fff1f1;
    color: #ee0a24;
    box-shadow: inset 0 0 0 1px rgba(238, 10, 36, 0.16);
  }

  &:active {
    transform: translateY(1px);
    opacity: 0.88;
  }
}

@media (max-width: 380px) {
  .date-time-grid {
    grid-template-columns: 1fr;
  }

  .date-select {
    min-height: 54px;
  }
}

:deep(.family-sheet-popup) {
  height: 100vh !important;
  height: 100svh !important;
  height: 100dvh !important;
  overflow: hidden;
}

.family-picker {
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  background: #f5f8fc;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  box-sizing: border-box;
}

.family-picker-header {
  height: 58px;
  padding: 0 16px;
  display: grid;
  grid-template-columns: 34px 1fr 34px;
  align-items: center;
  box-sizing: border-box;
  background: #f5f8fc;

  h2 {
    margin: 0;
    text-align: center;
    font-size: 17px;
    font-weight: 700;
    color: #172033;
  }
}

.family-picker-list {
  min-height: 0;
  overflow-y: auto;
  padding: 10px 16px 18px;
  overscroll-behavior: contain;
}

.family-row {
  min-height: 72px;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid rgba(202, 213, 225, 0.78);
  border-radius: 8px;
  background: #fff;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 22px rgba(30, 64, 111, 0.06);

  &.active {
    border-color: rgba(25, 118, 255, 0.5);
    background: #f6faff;
  }
}

.family-row-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #eef5ff;
  color: #1976ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.family-row-main {
  min-width: 0;

  strong,
  em {
    display: block;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #172033;
    font-size: 16px;
  }

  em {
    margin-top: 4px;
    color: #8792a2;
    font-size: 12px;
    font-style: normal;
  }
}

.family-row-check {
  color: #1976ff;
  font-size: 20px;
}

.family-row-action {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #667085;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:active {
    background: #eef5ff;
  }

  &.danger {
    color: #ee0a24;
  }
}

.family-picker-footer {
  min-height: calc(72px + env(safe-area-inset-bottom));
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  background: #f5f8fc;
  box-shadow: 0 -10px 24px rgba(30, 64, 111, 0.08);
  box-sizing: border-box;
  flex-shrink: 0;
}

@media (min-width: 560px) {
  .weight-tracker {
    max-width: 430px;
    margin: 0 auto;
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
  }

  .weight-tabbar {
    left: calc(50% - 203px);
    right: calc(50% - 203px);
  }
}
</style>
