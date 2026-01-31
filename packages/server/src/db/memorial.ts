import mongoose from 'mongoose';

const memorialSchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, default: '' }, // YYYY-MM-DD
  description: { type: String, default: '' },
  displayTitle: { type: String, default: '' },
  type: {
    type: String,
    enum: ['cumulative', 'countdown'],
    required: true
  },
  isLunar: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  coverImage: { type: String, default: '' },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
  updatedBy: { type: String, required: false },
}, { timestamps: true });

memorialSchema.index({ username: 1, deleted: 1 });

export type Memorial = mongoose.InferSchemaType<typeof memorialSchema>;
export const Memorial = mongoose.model('Memorial', memorialSchema);
