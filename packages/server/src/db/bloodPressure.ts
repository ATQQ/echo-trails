import mongoose from 'mongoose';

const bloodPressureSchema = new mongoose.Schema({
  username: { type: String, required: true },
  operator: { type: String, required: true },
  familyId: { type: String, required: true },
  sbp: { type: Number, required: true }, // 收缩压
  dbp: { type: Number, required: true }, // 舒张压
  heartRate: { type: Number, required: true }, // 脉搏
  bloodOxygen: { type: Number, required: false }, // 血氧饱和度
  date: { type: Date, required: true },
  note: { type: String, default: '' },
  isDelete: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export type IBloodPressure = mongoose.InferSchemaType<typeof bloodPressureSchema>;
export const BloodPressure = mongoose.model('BloodPressure', bloodPressureSchema);
