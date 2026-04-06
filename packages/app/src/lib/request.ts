import ky, { type Hooks } from 'ky'
import { showToast } from 'vant'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauri } from '@/constants';
import { goLogin } from './login';

export const defaultOrigin: string = import.meta.env.VITE_BASE_ORIGIN || location.origin
export const defaulrPrefixUrl = `${defaultOrigin}/api`
const hooks: Hooks = {
  beforeRequest: [
    request => {

      const token = localStorage.getItem('token')
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`)
      }
    },
  ],
  afterResponse: [
    async (_request, _options, response) => {
      // Catch 401 Unauthorized but ignore network fetch failures (which have status 0 or throw before this hook)
      if ([401, 400].includes(response.status)) {
        localStorage.removeItem('token')
        const { pathname } = new URL(_request.url)
        if (pathname.endsWith('/api/check') || pathname.endsWith('/api/config/bitiful')) {
          throw new Error('Unauthorized')
        }
        goLogin()
      }

      try {
        const data: any = await response.json()
        if (data?.code) {
          showToast({
            type: 'fail',
            message: data.message,
          })
          throw new Error(data.message)
        }
        return data
      } catch (e: any) {
        // If it's already an error we threw (like Unauthorized or API error), rethrow it
        if (e instanceof Error && (e.message === 'Unauthorized' || e.message !== 'Unexpected end of JSON input')) {
          throw e;
        }
        // If JSON parsing fails or other issues, return response or rethrow
        throw e;
      }
    },
  ],
  beforeError: [
    error => {
      console.error('Request failed:', error);
      // Check if it's a network error (TypeError: Failed to fetch)
      if (error.name === 'TypeError' || error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('network')) {
        showToast({
          type: 'fail',
          message: '网络连接失败，请检查网络设置',
        })
      } else if (error.name === 'TimeoutError') {
        showToast({
          type: 'fail',
          message: '请求超时，请稍后重试',
        })
      } else {
        // Only show toast for other errors if they aren't our custom business errors (which are already toasted in afterResponse)
        if (error.message !== 'Unauthorized') {
          showToast({
            type: 'fail',
            message: error.message || '请求异常，请重试',
          })
        }
      }
      return error;
    }
  ]
}
export let api = ky.create({
  prefixUrl: defaulrPrefixUrl,
  retry: {
    limit: 1,
    methods: ['get']
  },
  timeout: 15000,
  hooks,
  fetch: isTauri ? tauriFetch : undefined
})

export function refreshApi(prefixUrl?: string) {
  const instance = ky.create({
    prefixUrl: prefixUrl || defaulrPrefixUrl,
    retry: 0,
    hooks,
    fetch: isTauri ? tauriFetch : undefined
  })

  api = instance
}
