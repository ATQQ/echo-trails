import mongoose from 'mongoose';

const familySchema = new mongoose.Schema({
  familyId: { type: String, required: true },
  name: { type: String, required: true },
  username: { type: String, required: true }, // The account owner
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export type IFamily = mongoose.InferSchemaType<typeof familySchema>;
export const Family = mongoose.model('Family', familySchema);
