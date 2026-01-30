import { Schema, model } from 'mongoose';

export interface IUsageRecord {
  targetId: string;
  targetType: string;
  actionType: string;
  description?: string;
  data?: any;
  createdAt: Date;
}

const usageRecordSchema = new Schema<IUsageRecord>({
  targetId: { type: String, required: true, index: true },
  targetType: { type: String, required: true },
  actionType: { type: String, required: true },
  description: { type: String },
  data: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true }
});

export const UsageRecord = model<IUsageRecord>('UsageRecord', usageRecordSchema);
