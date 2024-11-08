import  dayjs from 'dayjs';

export function formatDateTitle(date: Date) {
  const isToday = dayjs().isSame(date, 'day');
  const isYesterday = dayjs().subtract(1, 'day').isSame(date, 'day');
  const isThisYear = dayjs().isSame(date, 'year');
  if (isToday) {
    return '今天';
  }
  if (isYesterday) {
    return '昨天';
  }
  if (isThisYear) {
    return dayjs(date).format('MM月DD日');
  }
  return dayjs(date).format('YYYY年MM-DD');
}
