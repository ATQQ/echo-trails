export function PromiseWithResolver<T>() {
  let resolve: (value: T) => void
  let reject: (reason?: any) => void
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  }
}

/**
 * 生成 UUID v4
 * crypto.randomUUID 需要 Secure Context（HTTPS/localhost），
 * 局域网 HTTP 访问时回退到 getRandomValues / Math.random 实现
 */
export function randomUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  } catch {
    // 某些环境下 crypto API 存在但调用失败，回退到 Math.random
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
