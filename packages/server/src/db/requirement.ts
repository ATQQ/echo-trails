import mongoose from 'mongoose';

const requirementSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  kind: { type: String, enum: ['project', 'idea', 'task'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

requirementSchema.index({ username: 1, kind: 1, deleted: 1, updatedAt: -1 });

export const Requirement = mongoose.model('Requirement', requirementSchema);
