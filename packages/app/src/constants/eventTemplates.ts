export interface EventTemplate {
  /** 稳定 key，用于模板选择器的选中态 */
  key: string;
  name: string;
  emoji: string;
  unit: string;
  /** 为空表示「一次」 */
  defaultAmount: number | null;
}

export interface EventTemplateGroup {
  title: string;
  items: EventTemplate[];
}

/** 常用事件模板：一键导入用，不做批量接口，按名称去重后逐个创建 */
export const EVENT_TEMPLATE_GROUPS: EventTemplateGroup[] = [
  {
    title: '日常起居',
    items: [
      { key: 'water', name: '喝水', emoji: '💧', unit: 'ml', defaultAmount: 200 },
      { key: 'poop', name: '大便', emoji: '💩', unit: '', defaultAmount: null },
      { key: 'pee', name: '小便', emoji: '🚽', unit: '', defaultAmount: null },
      { key: 'brush-teeth', name: '刷牙', emoji: '🪥', unit: '', defaultAmount: null },
      { key: 'sleep-early', name: '早睡', emoji: '😴', unit: '', defaultAmount: null },
      { key: 'shower', name: '洗澡', emoji: '🚿', unit: '', defaultAmount: null },
    ],
  },
  {
    title: '健康照护',
    items: [
      { key: 'medicine', name: '吃药', emoji: '💊', unit: '粒', defaultAmount: 1 },
      { key: 'blood-pressure', name: '量血压', emoji: '🩺', unit: 'mmHg', defaultAmount: null },
      { key: 'blood-sugar', name: '测血糖', emoji: '🩸', unit: 'mmol/L', defaultAmount: null },
      { key: 'weight', name: '称体重', emoji: '⚖️', unit: '', defaultAmount: null },
      { key: 'eye-rest', name: '护眼休息', emoji: '👀', unit: '', defaultAmount: null },
    ],
  },
  {
    title: '运动锻炼',
    items: [
      { key: 'workout', name: '运动', emoji: '🏃', unit: '分钟', defaultAmount: 30 },
      { key: 'walk', name: '散步', emoji: '🚶', unit: '分钟', defaultAmount: 20 },
      { key: 'stretch', name: '拉伸', emoji: '🤸', unit: '分钟', defaultAmount: 10 },
      { key: 'meditate', name: '冥想', emoji: '🧘', unit: '分钟', defaultAmount: 10 },
      { key: 'sun-bath', name: '晒太阳', emoji: '☀️', unit: '分钟', defaultAmount: 15 },
    ],
  },
  {
    title: '习惯养成',
    items: [
      { key: 'reading', name: '阅读', emoji: '📖', unit: '页', defaultAmount: 10 },
      { key: 'words', name: '背单词', emoji: '🔤', unit: '个', defaultAmount: 10 },
      { key: 'diary', name: '写日记', emoji: '✍️', unit: '', defaultAmount: null },
      { key: 'accounting', name: '记账', emoji: '💰', unit: '', defaultAmount: null },
    ],
  },
];

export const EVENT_TEMPLATES: EventTemplate[] = EVENT_TEMPLATE_GROUPS.flatMap(
  (group) => group.items,
);

/**
 * 首次进入且该家人还没有任何事件时自动创建。
 * 只留人人都会用到的几个，其余全部走「常用模板」一键导入。
 */
export const DEFAULT_EVENT_TEMPLATES: EventTemplate[] = [
  { key: 'water', name: '喝水', emoji: '💧', unit: 'ml', defaultAmount: 200 },
  { key: 'poop', name: '大便', emoji: '💩', unit: '', defaultAmount: null },
  { key: 'pee', name: '小便', emoji: '🚽', unit: '', defaultAmount: null },
];

/** 导入时按名称去重（已存在的不再重复创建），同名只保留第一条 */
export function filterNewTemplates(
  existingNames: Iterable<string>,
  templates: EventTemplate[],
): EventTemplate[] {
  const taken = new Set<string>();
  for (const name of existingNames) taken.add(name.trim());

  const result: EventTemplate[] = [];
  for (const template of templates) {
    const name = template.name.trim();
    if (!name || taken.has(name)) continue;
    taken.add(name);
    result.push(template);
  }
  return result;
}
