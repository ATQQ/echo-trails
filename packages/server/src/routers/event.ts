import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import dayjs from 'dayjs'
import { Event, EventRecord } from "../db/event";

const EVENT_FIELDS = ['name', 'emoji', 'sortOrder'] as const;
type EventPayload = Partial<Record<typeof EVENT_FIELDS[number], any>>;

function pickEventPayload(body: Record<string, any>): EventPayload {
  const payload: EventPayload = {};
  for (const key of EVENT_FIELDS) {
    if (body[key] !== undefined) {
      payload[key] = body[key];
    }
  }
  return payload;
}

function formatEventResponse(e: any) {
  return {
    id: e._id?.toString?.() || e.id,
    familyId: e.familyId || 'default',
    name: e.name,
    emoji: e.emoji || '',
    sortOrder: e.sortOrder ?? 0,
    createdAt: new Date(e.createdAt).getTime(),
    updatedAt: new Date(e.updatedAt).getTime(),
  };
}

function formatRecordResponse(r: any) {
  return {
    id: r._id?.toString?.() || r.id,
    familyId: r.familyId || 'default',
    eventId: r.eventId,
    eventName: r.eventName || '',
    emoji: r.emoji || '',
    occurredAt: new Date(r.occurredAt).getTime(),
    date: r.date || '',
    note: r.note || '',
    createdAt: new Date(r.createdAt).getTime(),
    updatedAt: new Date(r.updatedAt).getTime(),
  };
}

/** 从时间戳/ISO 字符串归一化为 Date */
function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** 取本地日期 YYYY-MM-DD（客户端传入优先，缺失时按 UTC+8 兜底计算） */
function resolveDate(occurredAt: Date, date?: string): string {
  const d = String(date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // 兜底：按 UTC+8 计算日期
  return dayjs(occurredAt.getTime() + 8 * 3600 * 1000).format('YYYY-MM-DD');
}

export default function eventRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // ==================== 事件定义 ====================

  router.get('list', async (ctx) => {
    const username = ctx.get('username');
    const familyId = ctx.req.query('familyId') || 'default';
    const events = await Event.find({ username, familyId, deleted: false })
      .sort({ createdAt: -1 });
    return ctx.json({ code: 0, data: events.map(formatEventResponse) });
  });

  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');
    const familyId = body.familyId || 'default';
    const payload = pickEventPayload(body);

    if (!payload.name || !String(payload.name).trim()) {
      return ctx.json({ code: 1, message: 'name is required' });
    }

    const count = await Event.countDocuments({ username, familyId, deleted: false });
    const event = new Event({
      name: String(payload.name).trim(),
      emoji: payload.emoji || '',
      sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : count,
      familyId,
      username,
      createdBy: operator,
      updatedBy: operator,
    });
    await event.save();
    return ctx.json({ code: 0, data: formatEventResponse(event) });
  });

  router.put('update', async (ctx) => {
    const { id, ...body } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');
    const updates = pickEventPayload(body);

    const event = await Event.findOne({ _id: id, username, deleted: false });
    if (!event) return ctx.json({ code: 1, message: 'not found' });

    if (updates.name !== undefined) event.name = String(updates.name).trim();
    if (updates.emoji !== undefined) event.emoji = updates.emoji;
    if (updates.sortOrder !== undefined) event.sortOrder = Number(updates.sortOrder);
    event.updatedBy = operator;
    await event.save();
    return ctx.json({ code: 0, data: formatEventResponse(event) });
  });

  router.delete('delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');
    await Event.updateOne({ _id: id, username, deleted: false }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  // ==================== 事件打卡记录 ====================

  router.get('record/list', async (ctx) => {
    const username = ctx.get('username');
    const familyId = ctx.req.query('familyId') || 'default';
    const eventId = ctx.req.query('eventId');
    const startDate = ctx.req.query('startDate');
    const endDate = ctx.req.query('endDate');
    const page = parseInt(ctx.req.query('page') || '1');
    const pageSize = parseInt(ctx.req.query('pageSize') || '2000');

    const query: any = { username, familyId, deleted: false };
    if (eventId) query.eventId = eventId;
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query.date = { $gte: startDate };
    } else if (endDate) {
      query.date = { $lte: endDate };
    }

    const list = await EventRecord.find(query)
      .sort({ occurredAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return ctx.json({ code: 0, data: list.map(formatRecordResponse) });
  });

  router.post('record/create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');
    const { eventId, occurredAt, date, note, familyId } = body;

    if (!eventId) {
      return ctx.json({ code: 1, message: 'eventId is required' });
    }

    const event = await Event.findOne({ _id: eventId, username, deleted: false });
    if (!event) {
      return ctx.json({ code: 1, message: 'event not found' });
    }

    const at = toDate(occurredAt) || new Date();
    const record = new EventRecord({
      username,
      familyId: familyId || event.familyId || 'default',
      eventId: event._id.toString(),
      eventName: event.name,
      emoji: event.emoji || '',
      occurredAt: at,
      date: resolveDate(at, date),
      note: note || '',
      createdBy: operator,
    });
    await record.save();
    return ctx.json({ code: 0, data: formatRecordResponse(record) });
  });

  router.delete('record/delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');
    await EventRecord.updateOne({ _id: id, username, deleted: false }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  return 'event';
}
