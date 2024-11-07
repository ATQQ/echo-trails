import ky from 'ky'
import { showToast } from 'vant'

export const api = ky.create({
  prefixUrl: `${location.origin}/api`,
  retry: 0,
  hooks: {
    // beforeRequest: [
    //   request => {
    //     console.log(request.headers)
    //   },
    // ],
    afterResponse: [
      async (_request, _options, response) => {
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
