import mongoose from 'mongoose';

const driveFileSchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, required: true },
  kind: { type: String, enum: ['file', 'folder'], required: true },
  parentId: { type: String, default: '' }, // '' = 根目录
  key: { type: String, default: '' }, // S3 对象 key（folder 为空）
  size: { type: Number, default: 0 },
  mimeType: { type: String, default: '' },
  // 来源云标识，为后续多云扩展预留
  provider: { type: String, default: 'bitiful' },
  bucket: { type: String, default: '' },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
  updatedBy: { type: String, required: false },
}, { timestamps: true });

driveFileSchema.index({ username: 1, parentId: 1, deleted: 1 });

export type DriveFile = mongoose.InferSchemaType<typeof driveFileSchema>;
export const DriveFile = mongoose.model('DriveFile', driveFileSchema);
