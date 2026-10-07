export function formatCurrency(value: number): string {
  return value.toLocaleString('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatNumber(value: number): string {
    return value.toLocaleString('en-US');
}

/** 盈亏展示：盈利用 +、亏损用 -。 */
export function formatSignedCurrency(value: number): string {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${formatCurrency(Math.abs(value))}`;
}
