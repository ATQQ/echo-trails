import * as mongoose from 'mongoose';
const photoSchema = new mongoose.Schema({
  username: { type: String, required: true },
  key: { type: String, required: true },
  uploadDate: { type: Date, required: true },
  lastModified: { type: Date, required: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  fileType: { type: String, required: true },
  type: { type: String, required: true },
  bucket: { type: String, required: false },
  deleted: { type: Boolean, required: false, default: false },
  description: { type: String, required: false, default: '' },
  exif: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
});

export type Photo = mongoose.InferSchemaType<typeof photoSchema>;
export const Photo = mongoose.model('Photo', photoSchema);
