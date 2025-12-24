import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import mountedRouters from './routers'
import { users } from './users'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

declare module 'hono' {
  interface ContextVariableMap {
    username: string;
    operator: string;
  }
}

import { dbMiddleware } from './db'

const app = new Hono().basePath('/api')

const customLogger = (message: string, ...rest: string[]) => {
  console.log(new Date().toLocaleString(), message, ...rest)
}
app.use(logger(customLogger))
app.use('*', cors())
app.use('*', dbMiddleware)
// 简单BA鉴权
app.on(
  ['POST', 'GET', 'DELETE', 'PUT', 'PATCH'],
  '*',
  bearerAuth({
    verifyToken: async (token, c) => {
      const pass = Object.entries(users).some(([username, userMaps]) => {
        const matched = userMaps.find(v => v[1] === token)
        if (matched) {
          const [operator] = matched
          c.set('username', username) // 区分账户
          c.set('operator', operator) // 区分操作人
        }
        return matched
      })
      return pass
    },
  }),
)

// 用于配置设定
app.post('/config/check', (ctx) => {
  const username = ctx.get('username')
  const operator = ctx.get('operator')
  return ctx.json({
    code: 0,
    data: {
      username,
      operator
    }
  })
})

// 用于检查登录情况
app.post('/check', (ctx) => {
  const username = ctx.get('username')
  const operator = ctx.get('operator')
  return ctx.json({
    code: 0,
    data: {
      username,
      operator
    }
  })
})

// 业务路由
mountedRouters(app)

export type App = typeof app

export default {
  port: +(process.env.PORT || 6692),
  fetch: app.fetch,
}
