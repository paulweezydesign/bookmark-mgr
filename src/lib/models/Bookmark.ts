import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type BookmarkVisitStatus = 'success' | 'failed' | 'unknown';

export interface IBookmark extends Document {
  owner: Types.ObjectId;
  title: string;
  url: string;
  normalizedUrl: string;
  description?: string;
  notes?: string;
  tags: string[];
  folder?: string;
  isFavorite: boolean;
  visitCount: number;
  lastVisitedAt?: Date;
  lastVisitStatus: BookmarkVisitStatus;
  isDead: boolean;
  deadLinkReason?: string;
  deadLinkCheckedAt?: Date;
  importSource?: string;
  importBatchId?: string;
  importOriginalId?: string;
  importHash?: string;
  importNotes?: string;
  importedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  hasDuplicate(): Promise<boolean>;
  recordVisit(successful: boolean, visitedAt?: Date): Promise<IBookmark>;
  flagDeadLink(reason?: string): IBookmark;
  clearDeadLinkFlag(): IBookmark;
}

export interface IBookmarkModel extends Model<IBookmark> {
  normalizeUrl(url: string): string;
  findDuplicate(ownerId: Types.ObjectId, url: string): Promise<IBookmark | null>;
}

const normalizeUrlValue = (value: string): string => {
  if (!value) {
    return '';
  }

  let normalized = value.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    parsed.hash = '';

    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (!pathname) {
      pathname = '/';
    }

    const search = parsed.search ?? '';
    return `${parsed.protocol}//${parsed.host}${pathname}${search}`.toLowerCase();
  } catch (error) {
    return normalized.toLowerCase();
  }
};

const BookmarkSchema = new Schema<IBookmark, IBookmarkModel>({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
  normalizedUrl: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
    set: (tags: string[]) => (Array.isArray(tags) ? tags.map((tag) => tag.trim()).filter(Boolean) : []),
  },
  folder: {
    type: String,
    trim: true,
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  visitCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastVisitedAt: Date,
  lastVisitStatus: {
    type: String,
    enum: ['success', 'failed', 'unknown'],
    default: 'unknown',
  },
  isDead: {
    type: Boolean,
    default: false,
  },
  deadLinkReason: {
    type: String,
    trim: true,
  },
  deadLinkCheckedAt: Date,
  importSource: {
    type: String,
    trim: true,
  },
  importBatchId: {
    type: String,
    trim: true,
  },
  importOriginalId: {
    type: String,
    trim: true,
  },
  importHash: {
    type: String,
    trim: true,
    index: true,
  },
  importNotes: {
    type: String,
    trim: true,
  },
  importedAt: Date,
}, {
  timestamps: true,
});

BookmarkSchema.pre<IBookmark>('validate', function (next) {
  if (this.title) {
    this.title = this.title.trim();
  }

  if (this.url) {
    this.url = this.url.trim();
    this.normalizedUrl = normalizeUrlValue(this.url);
  }

  if (this.folder) {
    this.folder = this.folder.trim();
  }

  if (Array.isArray(this.tags)) {
    const uniqueTags = Array.from(new Set(this.tags.map((tag) => tag.trim()).filter(Boolean)));
    this.tags = uniqueTags;
  }

  next();
});

BookmarkSchema.pre<IBookmark>('save', async function (next) {
  if (!this.normalizedUrl && this.url) {
    this.normalizedUrl = normalizeUrlValue(this.url);
  }

  if (!this.isModified('url') && !this.isNew) {
    return next();
  }

  try {
    const Bookmark = this.constructor as IBookmarkModel;
    const duplicate = await Bookmark.findOne({
      owner: this.owner,
      normalizedUrl: this.normalizedUrl,
      _id: { $ne: this._id },
    });

    if (duplicate) {
      return next(new Error('Bookmark URL already exists for this user.'));
    }

    return next();
  } catch (error) {
    return next(error as Error);
  }
});

BookmarkSchema.methods.hasDuplicate = async function (this: IBookmark) {
  const Bookmark = this.constructor as IBookmarkModel;
  const duplicate = await Bookmark.findOne({
    owner: this.owner,
    normalizedUrl: this.normalizedUrl,
    _id: { $ne: this._id },
  });

  return Boolean(duplicate);
};

BookmarkSchema.methods.recordVisit = async function (this: IBookmark, successful: boolean, visitedAt?: Date) {
  this.visitCount += 1;
  this.lastVisitedAt = visitedAt ?? new Date();
  this.lastVisitStatus = successful ? 'success' : 'failed';

  if (successful) {
    this.clearDeadLinkFlag();
  } else {
    this.flagDeadLink('Automatic visit check failed');
  }

  await this.save();
  return this;
};

BookmarkSchema.methods.flagDeadLink = function (this: IBookmark, reason?: string) {
  this.isDead = true;
  this.deadLinkReason = reason ?? this.deadLinkReason;
  this.deadLinkCheckedAt = new Date();
  this.lastVisitStatus = 'failed';
  return this;
};

BookmarkSchema.methods.clearDeadLinkFlag = function (this: IBookmark) {
  this.isDead = false;
  this.deadLinkReason = undefined;
  this.deadLinkCheckedAt = new Date();
  this.lastVisitStatus = 'success';
  return this;
};

BookmarkSchema.statics.normalizeUrl = normalizeUrlValue;

BookmarkSchema.statics.findDuplicate = async function (this: IBookmarkModel, ownerId: Types.ObjectId, url: string) {
  const normalizedUrl = normalizeUrlValue(url);
  return this.findOne({ owner: ownerId, normalizedUrl });
};

BookmarkSchema.index({ owner: 1, normalizedUrl: 1 }, { unique: true });
BookmarkSchema.index({ owner: 1, folder: 1, tags: 1, isDead: 1 });
BookmarkSchema.index({
  title: 'text',
  description: 'text',
  notes: 'text',
  url: 'text',
  tags: 'text',
}, {
  weights: {
    title: 5,
    description: 3,
    notes: 2,
    url: 1,
    tags: 2,
  },
  name: 'bookmark_text_search',
});

export default (mongoose.models.Bookmark as IBookmarkModel) || mongoose.model<IBookmark, IBookmarkModel>('Bookmark', BookmarkSchema);
