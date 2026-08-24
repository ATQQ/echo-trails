import mongoose from 'mongoose';

const todoSchema = new mongoose.Schema({
  username: { type: String, required: true },
  title: { type: String, required: true },
  note: { type: String, default: '' },
  // 四象限：1重要且紧急 2重要不紧急 3紧急不重要 4不重要不紧急
  quadrant: { type: Number, enum: [1, 2, 3, 4], required: true },
  completed: { type: Boolean, default: false },
  // 任务状态：todo(待开始) / in_progress(进行中) / done(已完成) / cancelled(已取消) 或用户自定义
  status: { type: String, default: 'todo' },
  dueDate: { type: String, default: '' }, // YYYY-MM-DD
  completedAt: { type: Date, default: null },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
  updatedBy: { type: String, required: false },
}, { timestamps: true });

todoSchema.index({ username: 1, deleted: 1 });

export type Todo = mongoose.InferSchemaType<typeof todoSchema>;
export const Todo = mongoose.model('Todo', todoSchema);
