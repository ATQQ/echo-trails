import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  canonicalJson,
  computeNativeHash,
  listNativeHashFiles,
  normalizeCargoToml,
  normalizeJson,
  stripDevHttpRules,
} from './native-hash.ts'

function digestFiles(files: { rel: string; bytes: Buffer }[]) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.rel)
    hash.update('\0')
    hash.update(file.bytes)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

function tauriConf(ip: string, version: string, trailingNewline = true) {
  return `${JSON.stringify(
    {
      version,
      build: {
        beforeDevCommand: `cd ../app && VITE_BASE_ORIGIN=http://${ip}:1420 VITE_VERSION_URL=https://photo.sugarat.top/version.json TAURI=true bun run dev`,
        devUrl: `http://${ip}:1420`,
        beforeBuildCommand: 'bun scripts/before-build.mjs',
        frontendDist: '../../app/dist',
      },
    },
    null,
    2,
  )}${trailingNewline ? '\n' : ''}`
}

describe('native hash normalization', () => {
  test('dev IP、version 与尾部换行不影响 tauri.conf 的归一化结果', () => {
    const a = normalizeJson('tauri.conf.json', Buffer.from(tauriConf('192.168.31.175', '0.9.3')))
    const b = normalizeJson('tauri.conf.json', Buffer.from(tauriConf('10.0.0.8', '0.9.9', false)))
    expect(a.toString()).toBe(b.toString())
  })

  test('capabilities 里 :1420 的 http 规则被剔除，其余保留', () => {
    const base = {
      permissions: [
        {
          identifier: 'http:default',
          allow: [
            { url: 'http://192.168.31.175:1420/**', all: true },
            { url: 'http://**', all: true },
            { url: 'https://**', all: true },
          ],
        },
      ],
    }
    const other = {
      permissions: [
        {
          identifier: 'http:default',
          allow: [
            { url: 'http://127.0.0.1:1420/**', all: true },
            { url: 'http://**', all: true },
            { url: 'https://**', all: true },
          ],
        },
      ],
    }
    const left = normalizeJson('capabilities/default.json', Buffer.from(JSON.stringify(base)))
    const right = normalizeJson('capabilities/default.json', Buffer.from(JSON.stringify(other)))
    expect(left.toString()).toBe(right.toString())
    expect(left.toString()).not.toContain(':1420')
    expect(left.toString()).toContain('https://**')
  })

  test('Cargo.toml 归一化 version', () => {
    expect(normalizeCargoToml('name = "echo-trails"\nversion = "0.9.3"\n')).toBe(
      normalizeCargoToml('name = "echo-trails"\r\nversion = "0.10.0"\r\n'),
    )
  })

  test('canonicalJson 按键排序', () => {
    expect(JSON.stringify(canonicalJson({ b: 1, a: { d: 2, c: 3 } }))).toBe(
      JSON.stringify({ a: { c: 3, d: 2 }, b: 1 }),
    )
  })

  test('stripDevHttpRules 只删 dev 端口规则', () => {
    const input = [
      { url: 'http://localhost:1420/**' },
      { url: 'http://localhost:6692/**' },
      'keep',
    ]
    expect(stripDevHttpRules(input)).toEqual([{ url: 'http://localhost:6692/**' }, 'keep'])
  })

  test('computeNativeHash 对同一份工作树稳定', () => {
    expect(computeNativeHash()).toBe(computeNativeHash())
  })

  test('src 内容纳入指纹，改动会改变 hash', () => {
    const files = listNativeHashFiles()
    expect(files.some((file) => file.rel === 'src/lib.rs')).toBe(true)
    const base = digestFiles(files)
    expect(base).toBe(computeNativeHash())
    const mutated = files.map((file) =>
      file.rel === 'src/lib.rs'
        ? { rel: file.rel, bytes: Buffer.concat([file.bytes, Buffer.from('// changed')]) }
        : file,
    )
    expect(digestFiles(mutated)).not.toBe(base)
  })

  test('Android 构建产物（generated / jniLibs / assets）不纳入指纹', () => {
    const rels = listNativeHashFiles().map((file) => file.rel)
    expect(rels.some((rel) => rel.includes('jniLibs'))).toBe(false)
    expect(rels.some((rel) => rel.includes('/assets/'))).toBe(false)
    expect(rels.some((rel) => rel.includes('generated/'))).toBe(false)
    // 手写源码仍应纳入
    expect(rels.some((rel) => rel.endsWith('MainActivity.kt'))).toBe(true)
  })

  test('build.rs 属于 Native 代码，纳入指纹', () => {
    const files = listNativeHashFiles()
    expect(files.some((file) => file.rel === 'build.rs')).toBe(true)
    const base = digestFiles(files)
    const mutated = files.map((file) =>
      file.rel === 'build.rs'
        ? { rel: file.rel, bytes: Buffer.concat([file.bytes, Buffer.from('\n// changed')]) }
        : file,
    )
    expect(digestFiles(mutated)).not.toBe(base)
  })

  test(':1420 以外的 capability 规则变化会改变归一化结果', () => {
    const build = (url: string) =>
      JSON.stringify({
        permissions: [
          {
            identifier: 'http:default',
            allow: [{ url: 'http://192.168.1.2:1420/**' }, { url }],
          },
        ],
      })
    const left = normalizeJson('capabilities/default.json', Buffer.from(build('https://a/**')))
    const right = normalizeJson('capabilities/default.json', Buffer.from(build('https://b/**')))
    expect(left.toString()).not.toBe(right.toString())
  })
})
