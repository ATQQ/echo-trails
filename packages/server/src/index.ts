import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import mountedRouters from './routers'
import { users } from './users'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { User } from './db/user'

declare module 'hono' {
  interface ContextVariableMap {
    username: string;
    operator: string;
    isAdmin: boolean;
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

// 健康监测
app.get('/ping', (c) => {
  return c.json({
    code: 0,
    data: 'pong'
  })
})


// 简单BA鉴权
app.on(
  ['POST', 'GET', 'DELETE', 'PUT', 'PATCH'],
  '*',
  bearerAuth({
    verifyToken: async (token, c) => {
      // 1. File Users
      const pass = Object.entries(users).some(([username, userMaps]) => {
        const matched = userMaps.find(v => v[1] === token)
        if (matched) {
          const [operator] = matched
          c.set('username', username) // 区分账户
          c.set('operator', operator) // 区分操作人
          c.set('isAdmin', true)
        }
        return matched
      })
      if (pass) return true

      // 2. Env User
      if (process.env.SYS_USERNAME && process.env.SYS_TOKEN && token === process.env.SYS_TOKEN) {
         c.set('username', process.env.SYS_USERNAME)
         c.set('operator', process.env.SYS_OPERATOR || 'admin')
         c.set('isAdmin', true)
         return true
      }

      // 3. DB Users
      try {
        const user = await User.findOne({ 'operators.token': token })
        if (user) {
          const op = user.operators.find(o => o.token === token)
          if (op) {
             c.set('username', user.username)
             c.set('operator', op.name)
             c.set('isAdmin', false)
             return true
          }
        }
      } catch (e) {
        console.error('Auth DB error', e)
      }

      return false
    },
  }),
)

// 用于配置设定
app.post('/config/check', (ctx) => {
  const username = ctx.get('username')
  const operator = ctx.get('operator')
  const isAdmin = ctx.get('isAdmin')
  return ctx.json({
    code: 0,
    data: {
      username,
      operator,
      isAdmin
    }
  })
})

// 用于检查登录情况
app.post('/check', (ctx) => {
  const username = ctx.get('username')
  const operator = ctx.get('operator')
  const isAdmin = ctx.get('isAdmin')
  return ctx.json({
    code: 0,
    data: {
      username,
      operator,
      isAdmin
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
