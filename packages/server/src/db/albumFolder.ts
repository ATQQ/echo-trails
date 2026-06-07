import mongoose from 'mongoose';

const albumFolderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true },
  description: { type: String, required: false, default: '' },
  coverKey: { type: String, required: false, default: '' },
  createdAt: { type: Date, default: () => new Date() },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false, default: '' },
  updatedBy: { type: String, required: false, default: '' },
}, { timestamps: true });

export type AlbumFolder = mongoose.InferSchemaType<typeof albumFolderSchema>;
export const AlbumFolder = mongoose.model('AlbumFolder', albumFolderSchema);
