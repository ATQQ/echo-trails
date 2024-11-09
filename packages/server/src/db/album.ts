import * as mongoose from 'mongoose';

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
  style: { type: Number, default: AlbumStyle.Small }
});

export type Album = mongoose.InferSchemaType<typeof albumSchema>;
export const Album = mongoose.model('Photo', albumSchema);
