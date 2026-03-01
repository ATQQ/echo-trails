import { Hono } from 'hono'
import { Weight } from '../db/weight'

export default function weightRouter(router: Hono) {

  // Middleware to check login (username should be in context)
  router.use('*', async (c, next) => {
    const username = c.get('username' as any)
    if (!username) {
      return c.json({ code: 401, message: 'Unauthorized' }, 401)
    }
    await next()
  })

  // List weights
  router.get('/list', async (c) => {
    const username = c.get('username' as any)
    const familyId = c.req.query('familyId')
    const page = parseInt(c.req.query('page') || '1')
    const pageSize = parseInt(c.req.query('pageSize') || '1000')

    const query: any = { username, isDelete: { $ne: true } }
    query.familyId = familyId || 'default'

    // Sort by date desc
    const list = await Weight.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
    
    // Also return total count for pagination info if needed, 
    // but for simple infinite scroll, just the list might be enough.
    // However, knowing if there are more items is helpful.
    // Let's stick to the current response format { code: 0, data: list } to minimize breakage,
    // or extend it. The user only asked to "change to pagination interface".
    // Client checks list length < pageSize to know if finished.

    return c.json({ code: 0, data: list })
  })

  // Add weight
  router.post('/add', async (c) => {
    const username = c.get('username' as any)
    const operator = c.get('operator' as any)
    const { weight, date, tips, familyId } = await c.req.json()

    if (!weight || !date || !familyId) {
      return c.json({ code: 400, message: 'Missing fields' })
    }

    const res = await Weight.create({
      username,
      operator: operator || 'Unknown',
      familyId,
      weight,
      date: new Date(date),
      tips
    })

    return c.json({ code: 0, data: res })
  })

  // Update weight
  router.post('/update', async (c) => {
    const username = c.get('username' as any)
    const { id, weight, date, tips } = await c.req.json()

    if (!id) {
      return c.json({ code: 400, message: 'Missing id' })
    }

    const res = await Weight.findOneAndUpdate(
      { _id: id, username }, // Ensure ownership
      {
        weight,
        date: new Date(date),
        tips
      },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Record not found' })
    }

    return c.json({ code: 0, data: res })
  })

  // Delete weight
  router.post('/delete', async (c) => {
    const username = c.get('username' as any)
    const { id } = await c.req.json()

    if (!id) {
      return c.json({ code: 400, message: 'Missing id' })
    }

    const res = await Weight.findOneAndUpdate(
      { _id: id, username },
      { isDelete: true },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Record not found' })
    }

    return c.json({ code: 0, message: 'Success' })
  })

  return 'weight'
}
