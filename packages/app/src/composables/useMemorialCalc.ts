import dayjs from 'dayjs';
import { type MemorialDay } from '@/stores/memorial';

export function useMemorialCalc() {
  const getDays = (memorial: MemorialDay) => {
    const today = dayjs().startOf('day');
    const startDate = dayjs(memorial.date).startOf('day');

    // Case 1: Start and End set (Progress/Duration)
    if (memorial.endDate) {
        const endDate = dayjs(memorial.endDate).startOf('day');
        if (today.isBefore(startDate)) {
            // Not started yet
            return startDate.diff(today, 'day');
        } else if (today.isAfter(endDate)) {
            // Ended
            return today.diff(endDate, 'day'); // Days since end
        } else {
            // In progress: Days remaining
            return endDate.diff(today, 'day');
        }
    }

    // Case 2: Only Start Date
    if (memorial.type === 'cumulative') {
        // "Already XX days" (if past) or "XX days left" (if future target)
        // Usually cumulative is for past events.
        // If future date is set as cumulative, it technically means "0 days" until it happens, then counts up.
        // But user said: "Past -> Already, Future -> Left".
        
        if (startDate.isAfter(today)) {
            return startDate.diff(today, 'day');
        }
        return today.diff(startDate, 'day');
    } else {
        // Countdown (Annually)
        const baseDate = dayjs(memorial.date);
        const currentYear = today.year();
        let nextDate = baseDate.year(currentYear).startOf('day');
        
        // If the date has passed this year, move to next year
        if (nextDate.isBefore(today)) {
            nextDate = nextDate.add(1, 'year');
        }
        
        return nextDate.diff(today, 'day');
    }
  };
  
  const getLabel = (memorial: MemorialDay) => {
    const today = dayjs().startOf('day');
    const startDate = dayjs(memorial.date).startOf('day');

    if (memorial.endDate) {
        const endDate = dayjs(memorial.endDate).startOf('day');
        if (today.isBefore(startDate)) {
            return '距离开始还有';
        } else if (today.isAfter(endDate)) {
            return '已经结束';
        } else {
            return '距离结束还有';
        }
    }

    if (memorial.type === 'cumulative') {
        if (startDate.isAfter(today)) {
             return '还有';
        }
        return '已经';
    } else {
        return '还有';
    }
  };

  const getProgress = (memorial: MemorialDay) => {
    if (!memorial.endDate) return 0;
    const today = dayjs().startOf('day');
    const startDate = dayjs(memorial.date).startOf('day');
    const endDate = dayjs(memorial.endDate).startOf('day');
    
    const total = endDate.diff(startDate, 'day');
    const passed = today.diff(startDate, 'day');
    
    if (total <= 0) return 100;
    if (passed < 0) return 0;
    if (passed > total) return 100;
    
    return Math.round((passed / total) * 100);
  };

  const formatDate = (dateStr: string) => {
    return dayjs(dateStr).format('YYYY年MM月DD日');
  };

  return {
    getDays,
    getLabel,
    getProgress,
    formatDate
  };
}
