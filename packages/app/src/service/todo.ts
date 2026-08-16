import { api } from '@/lib/request'
import { isLocalMode } from '@/lib/serviceRouter'
import * as local from './local/todo'

export interface TodoItem {
  id: string;
  title: string;
  note: string;
  quadrant: number;
  completed: boolean;
  dueDate: string;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export async function fetchTodos(): Promise<TodoItem[]> {
  if (isLocalMode()) return local.fetchTodos()
  const res: any = await api.get('todo/list').json()
  if (res.code === 0) {
    return res.data.map((item: any) => ({
      id: item.id,
      title: item.title,
      note: item.note || '',
      quadrant: item.quadrant,
      completed: !!item.completed,
      dueDate: item.dueDate || '',
      completedAt: item.completedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
  }
  return []
}

export async function createTodo(data: Pick<TodoItem, 'title' | 'quadrant'> & Partial<Pick<TodoItem, 'note' | 'dueDate'>>) {
  if (isLocalMode()) return local.createTodo(data)
  const res: any = await api.post('todo/create', { json: data }).json()
  return res.data
}

export async function updateTodo(data: Partial<TodoItem> & { id: string }) {
  if (isLocalMode()) return local.updateTodo(data)
  const res: any = await api.put('todo/update', { json: data }).json()
  return res.data
}

export async function toggleTodo(id: string) {
  if (isLocalMode()) return local.toggleTodo(id)
  const res: any = await api.put('todo/toggle', { json: { id } }).json()
  return res.data
}

export async function deleteTodo(id: string) {
  if (isLocalMode()) return local.deleteTodo(id)
  const res: any = await api.delete('todo/delete', { json: { id } }).json()
  return res
}
