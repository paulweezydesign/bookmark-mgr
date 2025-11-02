import mongoose, { Schema } from 'mongoose';
import type { Document, Types } from 'mongoose';

export interface IBookmark extends Document {
  user: Types.ObjectId;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  folder?: string;
  visitCount: number;
  lastVisitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BookmarkSchema = new Schema<IBookmark>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  folder: {
    type: String,
    trim: true,
  },
  visitCount: {
    type: Number,
    default: 0,
  },
  lastVisitedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

BookmarkSchema.index({ user: 1, url: 1 }, { unique: true });
BookmarkSchema.index({
  title: 'text',
  description: 'text',
  url: 'text',
  tags: 'text',
});

export default mongoose.models.Bookmark
  || mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
