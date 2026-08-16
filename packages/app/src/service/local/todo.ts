import { invoke } from '@tauri-apps/api/core'

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

function mapTodo(row: any): TodoItem {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row
  return {
    id: row.id || row._id,
    title: data.title || row.title || '',
    note: data.note || row.note || '',
    quadrant: Number(row.quadrant ?? data.quadrant ?? 4),
    completed: !!row.completed,
    dueDate: data.dueDate || row.dueDate || '',
    completedAt: data.completedAt ? new Date(data.completedAt).getTime() : null,
    createdAt: data.createdAt ? new Date(data.createdAt).getTime() : (row.updated_at ? new Date(row.updated_at).getTime() : Date.now()),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }
}

export async function fetchTodos() {
  const result = await invoke<any>('db_todo_list')
  return (result.data || []).map(mapTodo)
}

export async function createTodo(data: Pick<TodoItem, 'title' | 'quadrant'> & Partial<Pick<TodoItem, 'note' | 'dueDate'>>) {
  const result = await invoke<any>('db_todo_create', {
    title: data.title,
    note: data.note || '',
    quadrant: data.quadrant,
    dueDate: data.dueDate || '',
  })
  return mapTodo(result.data)
}

export async function updateTodo(data: Partial<TodoItem> & { id: string }) {
  const result = await invoke<any>('db_todo_update', {
    id: data.id,
    title: data.title,
    note: data.note,
    quadrant: data.quadrant,
    dueDate: data.dueDate,
  })
  return mapTodo(result.data)
}

export async function toggleTodo(id: string) {
  const result = await invoke<any>('db_todo_toggle', { id })
  return mapTodo(result.data)
}

export async function deleteTodo(id: string) {
  return invoke('db_todo_delete', { id })
}
