import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import mountedRouters from './routers'
// import { compress } from 'hono/compress'
import { users } from './users'
import { logger } from 'hono/logger'

declare module 'hono' {
  // can be used with (c: Context)
  interface ContextVariableMap {
    username: string;
  }
}

const app = new Hono().basePath('/api')

const customLogger = (message: string, ...rest: string[]) => {
  console.log(new Date().toLocaleString(),message, ...rest)
}
app.use(logger(customLogger))
// app.use(compress())

// 简单BA鉴权
app.use(
  '*',
  bearerAuth({
    verifyToken: async (token, c) => {
      Object.entries(users).some(([name, _token]) => {
        const matched = _token === token
        if (matched) {
          c.set('username', name)
        }
        return matched
      })
      return [process.env.AUTH_TOKEN].includes(token)
    },
  }),
)

// 用于检查登录情况
app.get('/check', (ctx) => {
  return ctx.json({
    code: 0
  })
})

// 业务路由
mountedRouters(app)

export type App = typeof app

export default app
