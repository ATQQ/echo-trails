import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Todo } from "../db/todo";

const TODO_FIELDS = [
  'title',
  'note',
  'quadrant',
  'dueDate',
] as const;

type TodoPayload = Partial<Record<typeof TODO_FIELDS[number], any>>;

function pickTodoPayload(body: Record<string, any>): TodoPayload {
  const payload: TodoPayload = {};
  for (const key of TODO_FIELDS) {
    if (body[key] !== undefined) {
      payload[key] = body[key];
    }
  }
  return payload;
}

function formatTodoResponse(t: any) {
  return {
    id: t._id?.toString?.() || t.id,
    title: t.title,
    note: t.note || '',
    quadrant: t.quadrant,
    completed: !!t.completed,
    dueDate: t.dueDate || '',
    completedAt: t.completedAt ? new Date(t.completedAt).getTime() : null,
    createdAt: new Date(t.createdAt).getTime(),
    updatedAt: new Date(t.updatedAt).getTime(),
  };
}

export default function todoRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // List Todos
  router.get('list', async (ctx) => {
    const username = ctx.get('username');

    const todos = await Todo.find({ username, deleted: false })
      .sort({ completed: 1, createdAt: -1 });

    return ctx.json({ code: 0, data: todos.map(formatTodoResponse) });
  });

  // Create Todo
  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');
    const payload = pickTodoPayload(body);

    if (!payload.title) {
      return ctx.json({ code: 1, message: 'title is required' });
    }
    const quadrant = Number(payload.quadrant);
    if (![1, 2, 3, 4].includes(quadrant)) {
      return ctx.json({ code: 1, message: 'quadrant is invalid' });
    }

    const todo = new Todo({
      title: payload.title,
      note: payload.note || '',
      quadrant,
      dueDate: payload.dueDate || '',
      username,
      createdBy: operator,
      updatedBy: operator
    });
    await todo.save();

    return ctx.json({ code: 0, data: formatTodoResponse(todo) });
  });

  // Update Todo
  router.put('update', async (ctx) => {
    const { id, ...body } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');
    const updates = pickTodoPayload(body);

    const todo = await Todo.findOne({ _id: id, username });
    if (!todo) return ctx.json({ code: 1, message: 'not found' });

    if (updates.title !== undefined) todo.title = updates.title;
    if (updates.note !== undefined) todo.note = updates.note;
    if (updates.dueDate !== undefined) todo.dueDate = updates.dueDate;
    if (updates.quadrant !== undefined) {
      const quadrant = Number(updates.quadrant);
      if (![1, 2, 3, 4].includes(quadrant)) {
        return ctx.json({ code: 1, message: 'quadrant is invalid' });
      }
      todo.quadrant = quadrant;
    }
    todo.updatedBy = operator;
    await todo.save();

    return ctx.json({ code: 0, data: formatTodoResponse(todo) });
  });

  // Toggle Todo completion
  router.put('toggle', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const todo = await Todo.findOne({ _id: id, username });
    if (!todo) return ctx.json({ code: 1, message: 'not found' });

    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? new Date() : (null as any);
    todo.updatedBy = operator;
    await todo.save();

    return ctx.json({ code: 0, data: formatTodoResponse(todo) });
  });

  // Delete Todo
  router.delete('delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');

    await Todo.updateOne({ _id: id, username }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  return 'todo';
}
