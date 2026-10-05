import { describe, expect, test } from 'bun:test'
import type { VersionFile } from './release-meta.ts'
import { checkNativeHash, isFatalCheck } from './verify-native-hash.ts'

const HASH = '6b5dc947f69f49b4'

function baseFile(): VersionFile {
  return {
    android: { version: '0.9.3', nativeHash: HASH, downloadUrl: '', forceUpdate: false, description: '', md5: '', fileSize: 0 },
    macos: { version: '0.9.3', nativeHash: HASH, downloadUrl: '', forceUpdate: false, description: '', md5: '', fileSize: 0 },
    windows: { version: '0.9.3', nativeHash: HASH, downloadUrl: '', forceUpdate: false, description: '', md5: '', fileSize: 0 },
    linux: { version: '0.9.3', nativeHash: HASH, downloadUrl: '', forceUpdate: false, description: '', md5: '', fileSize: 0 },
  }
}

describe('verify native hash', () => {
  test('四端一致时通过', () => {
    const { ok, rows } = checkNativeHash(baseFile(), HASH)
    expect(ok).toBe(true)
    expect(rows.filter(isFatalCheck)).toHaveLength(0)
  })

  test('任意一端 hash 不一致即失败', () => {
    const data = baseFile()
    data.macos!.nativeHash = 'deadbeefdeadbeef'
    const { ok, rows } = checkNativeHash(data, HASH)
    expect(ok).toBe(false)
    const fatal = rows.filter(isFatalCheck)
    expect(fatal).toHaveLength(1)
    expect(fatal[0].platform).toBe('macos')
  })

  test('android 缺少 nativeHash 判失败（忘了升级壳的典型表现）', () => {
    const data = baseFile()
    delete data.android!.nativeHash
    const { ok, rows } = checkNativeHash(data, HASH)
    expect(ok).toBe(false)
    expect(rows.find((row) => row.platform === 'android')!.status).toBe('missing-hash')
  })

  test('桌面端有条目却没写 hash 也判失败（避免桌面热更被静默拒绝）', () => {
    const data = baseFile()
    delete data.windows!.nativeHash
    const { ok, rows } = checkNativeHash(data, HASH)
    expect(ok).toBe(false)
    expect(rows.find((row) => row.platform === 'windows')!.status).toBe('missing-hash')
  })

  test('平台整条缺失可跳过，但 android 缺失不放过', () => {
    const data = baseFile()
    delete data.linux
    expect(checkNativeHash(data, HASH).ok).toBe(true)

    const noAndroid = baseFile()
    delete noAndroid.android
    const { ok, rows } = checkNativeHash(noAndroid, HASH)
    expect(ok).toBe(false)
    expect(rows.find((row) => row.platform === 'android')!.status).toBe('absent')
  })
})
