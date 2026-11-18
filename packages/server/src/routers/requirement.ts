import { BlankEnv, BlankSchema } from 'hono/types';
import { Hono } from 'hono';
import { Requirement } from '../db/requirement';

const kinds = ['project', 'idea', 'task'] as const;
type RequirementKind = typeof kinds[number];

function cleanData(kind: RequirementKind, input: Record<string, unknown>) {
  if (kind === 'project') {
    return {
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim(),
      color: String(input.color || '#388b7e'),
      archived: Boolean(input.archived),
    };
  }
  if (kind === 'idea') {
    return {
      title: String(input.title || '').trim(),
      body: String(input.body || '').trim(),
      tag: String(input.tag || '随手记录'),
      created: String(input.created || new Date().toISOString().slice(0, 10)),
      convertedToTaskId: input.convertedToTaskId ? String(input.convertedToTaskId) : '',
    };
  }
  return {
    title: String(input.title || '').trim(),
    projectId: String(input.projectId || ''),
    status: ['todo', 'active', 'done'].includes(String(input.status)) ? String(input.status) : 'todo',
    progress: Math.max(0, Math.min(100, Number(input.progress) || 0)),
    priority: ['high', 'medium', 'low'].includes(String(input.priority)) ? String(input.priority) : 'medium',
    due: String(input.due || ''),
    note: String(input.note || '').trim(),
  };
}

function format(item: any) {
  return { id: item._id.toString(), ...item.data, createdAt: item.createdAt?.getTime(), updatedAt: item.updatedAt?.getTime() };
}

export default function requirementRouter(router: Hono<BlankEnv, BlankSchema, '/'>) {
  router.get('list', async (ctx) => {
    const username = ctx.get('username');
    const items = await Requirement.find({ username, deleted: false }).sort({ updatedAt: -1 });
    const result = { projects: [] as any[], ideas: [] as any[], tasks: [] as any[] };
    for (const item of items) {
      const key = `${item.kind}s` as keyof typeof result;
      result[key].push(format(item));
    }
    return ctx.json({ code: 0, data: result });
  });

  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const kind = body.kind as RequirementKind;
    if (!kinds.includes(kind)) return ctx.json({ code: 1, message: 'kind is invalid' });
    const data = cleanData(kind, body.data || {});
    if ((kind === 'project' && !('name' in data && data.name)) || (kind !== 'project' && !('title' in data && data.title))) {
      return ctx.json({ code: 1, message: 'title or name is required' });
    }
    const item = await Requirement.create({ username: ctx.get('username'), kind, data });
    return ctx.json({ code: 0, data: format(item) });
  });

  router.put('update', async (ctx) => {
    const body = await ctx.req.json();
    const kind = body.kind as RequirementKind;
    if (!kinds.includes(kind) || !body.id) return ctx.json({ code: 1, message: 'id or kind is invalid' });
    const item = await Requirement.findOne({ _id: body.id, username: ctx.get('username'), kind, deleted: false });
    if (!item) return ctx.json({ code: 1, message: 'not found' });
    item.data = cleanData(kind, { ...item.data, ...body.data });
    await item.save();
    return ctx.json({ code: 0, data: format(item) });
  });

  router.delete('delete', async (ctx) => {
    const { id, kind } = await ctx.req.json();
    if (!kinds.includes(kind)) return ctx.json({ code: 1, message: 'kind is invalid' });
    await Requirement.updateOne({ _id: id, username: ctx.get('username'), kind, deleted: false }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  return 'requirement';
}
