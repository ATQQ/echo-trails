import mongoose from 'mongoose';

const operatorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  token: { type: String, required: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  operators: { type: [operatorSchema], default: [] },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export type IUser = mongoose.InferSchemaType<typeof userSchema>;
export const User = mongoose.model('User', userSchema);
