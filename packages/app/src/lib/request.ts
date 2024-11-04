import ky from 'ky'

export const api = ky.create({
  prefixUrl: `${location.origin}/api`,
  // hooks: {
  //   beforeRequest: [
  //     request => {
  //       console.log(request.headers)
  //     },
  //   ],
  //   afterResponse: [
  //     (_request, _options, response) => {
  //       console.log(response)
  //       return response
  //     },
  //   ],
  // },
})
