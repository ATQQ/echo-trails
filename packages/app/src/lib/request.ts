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
      if ([401, 400].includes(response.status)) {
        localStorage.removeItem('token')
        const { pathname } = new URL(_request.url)
        if (pathname === '/api/check' || pathname === '/api/config/bitiful') {
          throw new Error('Unauthorized')
        }
        goLogin()
      }
      const data: any = await response.json()
      if (data?.code) {
        showToast({
          type: 'fail',
          message: data.message,
        })
        throw new Error(data.message)
      }
      return data
    },
  ],
}
export let api = ky.create({
  prefixUrl: defaulrPrefixUrl,
  retry: 0,
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
