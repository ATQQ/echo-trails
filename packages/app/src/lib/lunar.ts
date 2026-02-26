import { Lunar } from 'lunar-javascript';
import dayjs from 'dayjs';

/**
 * 将公历日期转换为农历字符串
 * @param dateStr 公历日期字符串，格式如 'YYYY-MM-DD'
 * @returns 农历字符串，如 '十月初一'
 */
export const getLunarDate = (dateStr: string | number | Date): string => {
  const date = dayjs(dateStr);
  if (!date.isValid()) return '';

  const lunar = Lunar.fromDate(date.toDate());
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
};
