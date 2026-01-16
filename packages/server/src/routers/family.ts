import { Hono } from 'hono'
import { Family } from '../db/family'
import { getUniqueKey } from '../lib/string'

export default function familyRouter(router: Hono) {

  // Middleware
  router.use('*', async (c, next) => {
    const username = c.get('username' as any)
    if (!username) {
      return c.json({ code: 401, message: 'Unauthorized' }, 401)
    }
    await next()
  })

  // List families
  router.get('/list', async (c) => {
    const username = c.get('username' as any)
    const list = await Family.find({ username, isDelete: { $ne: true } }).sort({ createdAt: 1 })
    return c.json({ code: 0, data: list })
  })

  // Add family member
  router.post('/add', async (c) => {
    const username = c.get('username' as any)
    const { name } = await c.req.json()

    if (!name) {
      return c.json({ code: 400, message: 'Missing name' })
    }

    // Check duplicate name
    const exists = await Family.findOne({ username, name, isDelete: { $ne: true } })
    if (exists) {
      return c.json({ code: 400, message: 'Name already exists' })
    }

    // Generate a simple ID or use _id
    // Here we just use _id as familyId logic in frontend, or explicit familyId field?
    // The Schema has familyId required? Let's check Schema.
    // Schema: familyId: { type: String, required: true }
    // We should generate one.
    const familyId = getUniqueKey()

    const res = await Family.create({
      username,
      name,
      familyId
    })

    return c.json({ code: 0, data: res })
  })

  // Update family member
  router.post('/update', async (c) => {
    const username = c.get('username' as any)
    const { familyId, name } = await c.req.json()

    if (!familyId || !name) {
      return c.json({ code: 400, message: 'Missing fields' })
    }

    const res = await Family.findOneAndUpdate(
      { familyId, username },
      { name },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Family member not found' })
    }

    return c.json({ code: 0, data: res })
  })

  // Delete family member
  router.post('/delete', async (c) => {
    const username = c.get('username' as any)
    const { familyId } = await c.req.json()

    if (!familyId) {
      return c.json({ code: 400, message: 'Missing familyId' })
    }

    const res = await Family.findOneAndUpdate(
      { familyId, username },
      { isDelete: true },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Family member not found' })
    }

    return c.json({ code: 0, message: 'Success' })
  })

  return 'family'
}
