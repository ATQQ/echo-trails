import mongoose from 'mongoose';

// 用户自定义的待办状态。系统预设状态（todo/in_progress/done/cancelled）不落库，由前端常量维护。
const todoStatusSchema = new mongoose.Schema({
  username: { type: String, required: true },
  key: { type: String, required: true }, // 状态唯一标识，前端生成
  name: { type: String, required: true },
  color: { type: String, default: '#969799' },
  sortOrder: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

todoStatusSchema.index({ username: 1, deleted: 1 });

export type TodoStatus = mongoose.InferSchemaType<typeof todoStatusSchema>;
export const TodoStatus = mongoose.model('TodoStatus', todoStatusSchema);
