import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { TodoStatus } from "../db/todoStatus";

function formatStatusResponse(s: any) {
  return {
    id: s._id?.toString?.() || s.id,
    key: s.key,
    name: s.name,
    color: s.color || '#969799',
    sortOrder: s.sortOrder ?? 0,
    isSystem: false,
    createdAt: new Date(s.createdAt).getTime(),
    updatedAt: new Date(s.updatedAt).getTime(),
  };
}

export default function todoStatusRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // List custom statuses
  router.get('list', async (ctx) => {
    const username = ctx.get('username');

    const list = await TodoStatus.find({ username, deleted: false })
      .sort({ sortOrder: 1, createdAt: 1 });

    return ctx.json({ code: 0, data: list.map(formatStatusResponse) });
  });

  // Create custom status
  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const { key, name, color } = body;

    if (!name || !String(name).trim()) {
      return ctx.json({ code: 1, message: 'name is required' });
    }
    if (!key || !String(key).trim()) {
      return ctx.json({ code: 1, message: 'key is required' });
    }

    // 同名 key 覆盖（防止重复创建）
    const existing = await TodoStatus.findOne({ username, key, deleted: false });
    if (existing) {
      return ctx.json({ code: 1, message: 'status key already exists' });
    }

    const count = await TodoStatus.countDocuments({ username, deleted: false });
    const status = new TodoStatus({
      username,
      key,
      name: String(name).trim(),
      color: color || '#969799',
      sortOrder: count,
    });
    await status.save();

    return ctx.json({ code: 0, data: formatStatusResponse(status) });
  });

  // Update custom status (rename / recolor)
  router.put('update', async (ctx) => {
    const { key, ...body } = await ctx.req.json();
    const username = ctx.get('username');

    const status = await TodoStatus.findOne({ username, key, deleted: false });
    if (!status) return ctx.json({ code: 1, message: 'not found' });

    if (body.name !== undefined) status.name = String(body.name).trim();
    if (body.color !== undefined) status.color = body.color;
    if (body.sortOrder !== undefined) status.sortOrder = Number(body.sortOrder);
    await status.save();

    return ctx.json({ code: 0, data: formatStatusResponse(status) });
  });

  // Delete custom status (soft delete)
  router.delete('delete', async (ctx) => {
    const { key } = await ctx.req.json();
    const username = ctx.get('username');

    await TodoStatus.updateOne({ username, key, deleted: false }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  return 'todoStatus';
}
