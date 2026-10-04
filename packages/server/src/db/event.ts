import mongoose from 'mongoose';

// 事件定义：用户创建的、可一键打卡的事件（emoji + 名称，按家人隔离）
const eventSchema = new mongoose.Schema({
  username: { type: String, required: true },
  familyId: { type: String, default: 'default' },
  name: { type: String, required: true },
  emoji: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
  updatedBy: { type: String, required: false },
}, { timestamps: true });

eventSchema.index({ username: 1, familyId: 1, deleted: 1 });

export type Event = mongoose.InferSchemaType<typeof eventSchema>;
export const Event = mongoose.model('Event', eventSchema);

// 事件打卡记录：每一条 = 某事件在某时刻发生过
const eventRecordSchema = new mongoose.Schema({
  username: { type: String, required: true },
  familyId: { type: String, default: 'default' },
  eventId: { type: String, required: true },
  // 冗余快照：事件被改名/删除后，历史记录仍可展示与筛选
  eventName: { type: String, default: '' },
  emoji: { type: String, default: '' },
  occurredAt: { type: Date, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD，用于按天查询与聚合
  note: { type: String, default: '' },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
}, { timestamps: true });

eventRecordSchema.index({ username: 1, familyId: 1, deleted: 1, date: 1 });
eventRecordSchema.index({ username: 1, familyId: 1, eventId: 1, occurredAt: -1 });

export type EventRecord = mongoose.InferSchemaType<typeof eventRecordSchema>;
export const EventRecord = mongoose.model('EventRecord', eventRecordSchema);
