import { Hono } from 'hono'
import { BloodPressure } from '../db/bloodPressure'

export default function bloodPressureRouter(router: Hono) {

  // Middleware to check login (username should be in context)
  router.use('*', async (c, next) => {
    const username = c.get('username' as any)
    if (!username) {
      return c.json({ code: 401, message: 'Unauthorized' }, 401)
    }
    await next()
  })

  // List blood pressure records
  router.get('/list', async (c) => {
    const username = c.get('username' as any)
    const familyId = c.req.query('familyId')
    const startTime = c.req.query('startTime')
    const endTime = c.req.query('endTime')
    const page = parseInt(c.req.query('page') || '1')
    const pageSize = parseInt(c.req.query('pageSize') || '1000')

    const query: any = { username, isDelete: false }
    if (familyId) {
      query.familyId = familyId
    } else {
      query.familyId = 'default'
    }

    if (startTime && endTime) {
      query.date = {
        $gte: new Date(Number(startTime)),
        $lte: new Date(Number(endTime))
      }
    }

    // Sort by date desc
    const list = await BloodPressure.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)

    return c.json({ code: 0, data: list })
  })

  // Add blood pressure record
  router.post('/add', async (c) => {
    const username = c.get('username' as any)
    const operator = c.get('operator' as any)
    const { sbp, dbp, heartRate, bloodOxygen, date, note, familyId } = await c.req.json()

    if (!sbp || !dbp || !date || !familyId) {
      return c.json({ code: 400, message: 'Missing fields' })
    }

    const res = await BloodPressure.create({
      username,
      operator: operator || 'Unknown',
      familyId,
      sbp,
      dbp,
      heartRate,
      bloodOxygen,
      date: new Date(date),
      note: note || ''
    })

    return c.json({ code: 0, data: res })
  })

  // Update blood pressure record
  router.post('/update', async (c) => {
    const username = c.get('username' as any)
    const { id, sbp, dbp, heartRate, bloodOxygen, date, note } = await c.req.json()

    if (!id) {
      return c.json({ code: 400, message: 'Missing id' })
    }

    const res = await BloodPressure.findOneAndUpdate(
      { _id: id, username }, // Ensure ownership
      {
        sbp,
        dbp,
        heartRate,
        bloodOxygen,
        date: new Date(date),
        note
      },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Record not found' })
    }

    return c.json({ code: 0, data: res })
  })

  // Delete blood pressure record
  router.post('/delete', async (c) => {
    const username = c.get('username' as any)
    const { id } = await c.req.json()

    if (!id) {
      return c.json({ code: 400, message: 'Missing id' })
    }

    const res = await BloodPressure.findOneAndUpdate(
      { _id: id, username },
      { isDelete: true },
      { new: true }
    )

    if (!res) {
      return c.json({ code: 404, message: 'Record not found' })
    }

    return c.json({ code: 0, message: 'Success' })
  })

  return 'blood-pressure'
}
