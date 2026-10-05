import { describe, expect, test } from 'bun:test'
import { findUpdateEntry, type PlatformVersionInfo } from './release-meta.ts'

function entry(version: string): PlatformVersionInfo {
  return {
    version,
    downloadUrl: '',
    forceUpdate: false,
    description: '',
  }
}

describe('findUpdateEntry', () => {
  test('按版本命中，而不是默认取 list[0]', () => {
    const list = [entry('0.9.3'), entry('0.9.4')]
    expect(findUpdateEntry(list, '0.9.4')?.version).toBe('0.9.4')
    expect(findUpdateEntry(list, '0.9.5')).toBeUndefined()
  })

  test('桌面端只有占位条目时不误伤', () => {
    const list = [entry('0.1.2')]
    expect(findUpdateEntry(list, '0.9.4')).toBeUndefined()
    expect(findUpdateEntry(list, '0.1.2')?.version).toBe('0.1.2')
  })

  test('平台数组缺失时返回 undefined', () => {
    expect(findUpdateEntry(undefined, '0.9.4')).toBeUndefined()
  })
})
