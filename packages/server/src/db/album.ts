import mongoose from 'mongoose';

export enum AlbumStyle {
  Small,
  Large
}

const albumSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true },
  description: { type: String, required: false },
  coverKey: { type: String, required: false },
  createdAt: { type: Date, default: () => new Date() },
  style: { type: Number, default: AlbumStyle.Small },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false, default: '' },
  updatedBy: { type: String, required: false, default: '' },
  tags: { type: [String], required: false, default: [] },
});

export type Album = mongoose.InferSchemaType<typeof albumSchema>;
export const Album = mongoose.model('Album', albumSchema);
