import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { User } from '../db/user'
import { users as fileUsers } from '../users'

export default function userRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  router.use('*', async (c, next) => {
    // @ts-ignore
    const isAdmin = c.get('isAdmin')
    if (!isAdmin) {
      return c.json({ code: 403, message: 'Permission denied' }, 403)
    }
    await next()
  })

  router.get('/list', async (c) => {
    // DB Users
    const dbUsers = await User.find({})
    
    // File Users
    const fileUserList = Object.entries(fileUsers).map(([username, ops]) => ({
      username,
      operators: ops.map(([name]) => ({ name, isSystem: true })),
      isSystem: true
    }))

    // Env User
    const envUserList = []
    if (process.env.SYS_USERNAME) {
      envUserList.push({
        username: process.env.SYS_USERNAME,
        operators: [{ name: process.env.SYS_OPERATOR || 'admin', isSystem: true }],
        isSystem: true
      })
    }

    const dbUserList = dbUsers.map(u => ({
      username: u.username,
      operators: u.operators.map(o => ({ name: o.name, isSystem: false })),
      isSystem: false
    }))

    return c.json({
      code: 0,
      data: [...fileUserList, ...envUserList, ...dbUserList]
    })
  })

  // 检查 Token 是否已存在 (包括系统用户和数据库用户)
  const isTokenExists = async (token: string) => {
    // 1. 检查环境变量用户
    if (process.env.SYS_TOKEN === token) {
      return true
    }

    // 2. 检查文件配置用户
    const fileUserExists = Object.values(fileUsers).some(operators => 
      operators.some((op: string[]) => op[1] === token)
    )
    if (fileUserExists) {
      return true
    }

    // 3. 检查数据库用户
    const dbUserExists = await User.findOne({ 'operators.token': token })
    if (dbUserExists) {
      return true
    }

    return false
  }

  router.post('/add', async (c) => {
    const { username, operator, token } = await c.req.json()
    if (!username || !operator || !token) {
      return c.json({ code: 400, message: 'Missing fields' })
    }

    if (fileUsers[username] || process.env.SYS_USERNAME === username) {
      return c.json({ code: 400, message: 'User already exists in system' })
    }

    // 检查 Token 唯一性
    if (await isTokenExists(token)) {
      return c.json({ code: 400, message: 'Token already exists' })
    }

    try {
      const exists = await User.findOne({ username })
      if (exists) {
        return c.json({ code: 400, message: 'User already exists' })
      }

      await User.create({
        username,
        operators: [{ name: operator, token }]
      })
      return c.json({ code: 0, message: 'Success' })
    } catch (e: any) {
      return c.json({ code: 500, message: e.message })
    }
  })

  router.post('/operator/add', async (c) => {
    const { username, operator, token } = await c.req.json()
    
    // 检查 Token 唯一性
    if (await isTokenExists(token)) {
      return c.json({ code: 400, message: 'Token already exists' })
    }
    
    const user = await User.findOne({ username })
    if (!user) {
       return c.json({ code: 404, message: 'User not found or is system user' })
    }

    if (user.operators.some(o => o.name === operator)) {
       return c.json({ code: 400, message: 'Operator already exists' })
    }

    user.operators.push({ name: operator, token })
    await user.save()
    return c.json({ code: 0, message: 'Success' })
  })

  router.post('/password', async (c) => {
    const { username, operator, token } = await c.req.json()
    
    // 检查 Token 唯一性
    if (await isTokenExists(token)) {
      return c.json({ code: 400, message: 'Token already exists' })
    }
    
    const user = await User.findOne({ username })
    if (!user) {
      return c.json({ code: 404, message: 'User not found or cannot modify system user' })
    }

    const op = user.operators.find(o => o.name === operator)
    if (!op) {
      return c.json({ code: 404, message: 'Operator not found' })
    }

    op.token = token
    await user.save()
    return c.json({ code: 0, message: 'Success' })
  })

  return 'user'
}
