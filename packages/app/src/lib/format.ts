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
