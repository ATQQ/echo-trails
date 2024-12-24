import ky from 'ky'
import { showToast } from 'vant'
import { fetch } from '@tauri-apps/plugin-http';
import { isTauri } from '@/constants';

export const api = ky.create({
  // TODO：分环境替换
  prefixUrl: `${import.meta.env.VITE_BASE_ORIGIN || location.origin}/api`,
  retry: 0,
  hooks: {
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
          if( pathname === '/api/check'){
            throw new Error('Unauthorized')
          }
          window.location.href = '/login'
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
  },
  fetch: isTauri ? fetch : window.fetch
})
