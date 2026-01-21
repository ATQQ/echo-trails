import mongoose from 'mongoose';
const photoSchema = new mongoose.Schema({
  username: { type: String, required: true },
  key: { type: String, required: true },
  uploadDate: { type: Date, required: true },
  lastModified: { type: Date, required: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  fileType: { type: String, required: false, default: '' },
  type: { type: String, required: true },
  bucket: { type: String, required: false },
  deleted: { type: Boolean, required: false, default: false },
  description: { type: String, required: false, default: '' },
  albumId: { type: [String], required: false, default: () => [] },
  isLiked: { type: Boolean, required: false, default: false },
  deletedAt: { type: Date, required: false, default: null },
  deleteS3At: { type: Date, required: false, default: null },
  exif: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
  },
  md5: { type: String, required: false, default: '' },
  createdBy: { type: String, required: false, default: '' },
  updatedBy: { type: String, required: false, default: '' },
});

export type Photo = mongoose.InferSchemaType<typeof photoSchema>;
export const Photo = mongoose.model('Photo', photoSchema);
