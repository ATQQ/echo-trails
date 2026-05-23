declare module 'lunar-javascript' {
  export class Lunar {
    static fromDate(date: Date): Lunar
    getMonthInChinese(): string
    getDayInChinese(): string
  }
}
