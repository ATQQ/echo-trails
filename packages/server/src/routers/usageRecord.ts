import { Hono } from 'hono';
import { BlankEnv, BlankSchema } from "hono/types";
import { UsageRecord } from '../db/usageRecord';

export default function usageRecordRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // Add Record
  router.post('/add', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const { targetId, targetType, actionType, description, data } = body;

      if (!targetId || !targetType || !actionType) {
        return ctx.json({ code: 400, message: 'Missing required fields' });
      }

      const record = await UsageRecord.create({
        targetId,
        targetType,
        actionType,
        description,
        data
      });

      return ctx.json({ code: 0, data: record });
    } catch (error) {
      console.error('Add usage record error:', error);
      return ctx.json({ code: 500, message: 'Internal Server Error' });
    }
  });

  // List Records
  router.get('/list/:targetId', async (ctx) => {
    try {
      const targetId = ctx.req.param('targetId');
      const { targetType, actionType } = ctx.req.query();

      const query: any = { targetId };
      if (targetType) query.targetType = targetType;
      if (actionType) query.actionType = actionType;

      const records = await UsageRecord.find(query).sort({ createdAt: -1 });

      return ctx.json({ code: 0, data: records });
    } catch (error) {
      console.error('List usage records error:', error);
      return ctx.json({ code: 500, message: 'Internal Server Error' });
    }
  });

  return '/usageRecord'
}
