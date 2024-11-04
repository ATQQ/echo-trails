import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import mountedRouters from './routers'

const app = new Hono().basePath('/api')

// 简单BA鉴权
const { BASIC_AUTH_USERNAME = 'atqq', BASIC_AUTH_PASSWORD = 'atqq', BASIC_AUTH_REALM } = process.env
app.use(
  '*',
  basicAuth({
    username: BASIC_AUTH_USERNAME,
    password: BASIC_AUTH_PASSWORD,
    realm: BASIC_AUTH_REALM,
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
