import ky from 'ky'
import { showToast } from 'vant'

while (1) {
  let token = localStorage.getItem('token')
  if (!token) {
    token = prompt('请输入秘钥')
  }
  if (token) {
    localStorage.setItem('token', token)
    break
  }
}
export const api = ky.create({
  prefixUrl: `${location.origin}/api`,
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
        if([401,400].includes(response.status)){
          localStorage.removeItem('token')
          window.location.reload()
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
})
