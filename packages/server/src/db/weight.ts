import mongoose from 'mongoose';

const weightSchema = new mongoose.Schema({
  username: { type: String, required: true },
  operator: { type: String, required: true },
  familyId: { type: String, required: true },
  weight: { type: Number, required: true },
  date: { type: Date, required: true },
  tips: { type: String, default: '' },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export type IWeight = mongoose.InferSchemaType<typeof weightSchema>;
export const Weight = mongoose.model('Weight', weightSchema);
