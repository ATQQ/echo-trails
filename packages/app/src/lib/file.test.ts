import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDatedObjectKey, generateFileKey, normalizeObjectKey } from './file'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

function makeFileInfo(date: Date, name: string, type = 'image/jpeg') {
  return { date, name, file: new File([], name, { type }) } as FileInfoItem
}

describe('generateFileKey', () => {
  beforeEach(() => storage.clear())

  it('collapses legacy duplicate slashes', () => {
    expect(normalizeObjectKey('echo-trails///2018-02-27/a.jpg')).toBe('echo-trails/2018-02-27/a.jpg')
  })

  it('falls back to unknow when identity is empty', () => {
    localStorage.setItem('userInfo', JSON.stringify({ username: '', operator: '' }))
    const key = generateFileKey(makeFileInfo(new Date(2018, 1, 27, 10, 7, 25), 'a.jpg'))
    expect(key).not.toContain('//')
    expect(key.startsWith('echo-trails/unknow/unknow/2018-02-27/')).toBe(true)
    expect(buildDatedObjectKey('assets', makeFileInfo(new Date(2018, 1, 27), 'b.jpg')))
      .toMatch(/^assets\/unknow\/unknow\/2018-02-27\//)
  })

  it('keeps valid identity unchanged', () => {
    localStorage.setItem('userInfo', JSON.stringify({ username: 'sugar', operator: 'sugar' }))
    const key = generateFileKey(makeFileInfo(new Date(2018, 1, 27, 10, 7, 25), 'a.jpg'))
    expect(key.startsWith('echo-trails/sugar/sugar/2018-02-27/')).toBe(true)
  })

  it('keeps the video prefix for video files', () => {
    localStorage.setItem('userInfo', JSON.stringify({ username: 'sugar', operator: 'sugar' }))
    const key = generateFileKey(makeFileInfo(new Date(2018, 1, 27), 'a.mp4', 'video/mp4'))
    expect(key.startsWith('echo-trails/video/sugar/sugar/2018-02-27/')).toBe(true)
  })
})
