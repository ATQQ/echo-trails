import * as mongoose from 'mongoose';
const albumSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: false },
  cover: { type: String, required: false },
  createdAt: { type: Date, default: () => new Date() },
});

export type Album = mongoose.InferSchemaType<typeof albumSchema>;
export const Album = mongoose.model('Photo', albumSchema);
