import { BaseDataAccessObject } from '@shared/storage/dexie/dataAccessObject/BaseDataAccessObject';
import { DatabasePlugin } from '@shared/storage/dexie/dataAccessObject/DatabasePlugin';
import { Dexie, type Table } from 'dexie';

export enum AnalysisSentiment {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  NEUTRAL = 'neutral',
}

export interface IHistoricalPrecedent {
  situation: string;
  immediateMarketEffect: string;
  oneWeekMarketEffect: string;
}

export interface INewsItemAnalysis {
  summary: string;
  sentiment: AnalysisSentiment;
  confidenceScore?: number;
  analysisTimestamp?: number;
  impactScore?: number; // Added impactScore
  historicalPrecedents?: IHistoricalPrecedent[]; // Added historicalPrecedents
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  ARTICLE = 'article',
  WEBSITE = 'website',
  PDF = 'pdf',
  // Add other types as needed
}

export interface IBaseMediaItem {
  uri: string; // URL or path to the media
  caption?: string;
  sourceProvider?: string; // Source of this specific media item, e.g., "Getty Images", "YouTube"
}

export interface IImageMediaItem extends IBaseMediaItem {
  mediaType: MediaType.IMAGE;
  ocrText?: string; // Corrected from orcText
  longDescription?: string; // AI-generated or user-provided detailed description
  width?: number;
  height?: number;
}

export interface IVideoMediaItem extends IBaseMediaItem {
  mediaType: MediaType.VIDEO;
  durationSeconds?: number;
  thumbnailUri?: string;
  transcription?: string;
  description?: string; // Specific description/summary of the video content
}

export interface IAudioMediaItem extends IBaseMediaItem {
  mediaType: MediaType.AUDIO;
  durationSeconds?: number;
  transcription?: string;
}

export interface IArticleMediaItem extends IBaseMediaItem {
  mediaType: MediaType.ARTICLE;
  publisher?: string; // e.g., "The Guardian" for the linked article
  headline?: string; // Headline of the linked article
}

export type INewMediaItem = IImageMediaItem | IVideoMediaItem | IAudioMediaItem | IArticleMediaItem;

export interface INewsItemModel {
  id: string; // Primary key, e.g., UUID
  title: string;
  contentSnippet?: string; // A short summary or snippet of the content from the source
  fullContentUri?: string; // Link to the full content if stored externally or too large
  analysis?: INewsItemAnalysis;
  media: INewMediaItem[];
  newsSource?: string; // Main news source, e.g., "Reuters", "TruthSocial", "Twitter"
  originalSourceId?: string; // ID of the item from the original source (e.g., status.id from TruthSocial)
  publishedTimestamp?: number; // Timestamp for sorting by date (from original source if available)
  retrievedTimestamp: number; // When the item was fetched/added by your system
  tags?: string[]; // For categorization
  // Add any other common properties for news items
}

// Define the schema for Dexie, using 'newsItems' as the table name
// ++id: Auto-incrementing primary key (if numbers) or just 'id' if you provide UUIDs and it's the primary key.
// For string UUIDs you provide, 'id' is fine. If you want Dexie to manage it as a primary key, '++id' is usually for auto-increment numbers.
// However, your BaseDAO seems to handle string IDs with '++id' in schema, so we'll follow that pattern.
// If 'id' is a user-generated UUID and the primary key, the schema string should just be 'id'.
// Let's assume 'id' is the primary key you provide.
// Added compound index for uniqueness: &[newsSource+originalSourceId]
export const newsItemSchemaDefinition = {
  1: 'id, title, newsSource, originalSourceId, publishedTimestamp, retrievedTimestamp, *tags, &[newsSource+originalSourceId], analysis.impactScore', // Added analysis.impactScore
};

export class NewsDataAccessObject extends BaseDataAccessObject<INewsItemModel, string> {
  public constructor(db: Dexie) {
    super(db.table('newsItems'), 'newsItems');
  }

  public get table(): Table<INewsItemModel, string> {
    return this._table;
  }

  // Example custom query methods:
  public async findByTag(tag: string): Promise<INewsItemModel[]> {
    return this.table.where('tags').equals(tag).toArray();
  }

  public async findRecent(limit: number = 10): Promise<INewsItemModel[]> {
    return this.table.orderBy('publishedTimestamp').reverse().limit(limit).toArray();
  }

  public async findBySourceAndOriginalId(
    newsSource: string,
    originalSourceId: string,
  ): Promise<INewsItemModel | undefined> {
    return this.table
      .where('[newsSource+originalSourceId]')
      .equals([newsSource, originalSourceId])
      .first();
  }

  public static plugin: DatabasePlugin<INewsItemModel, string> = {
    tableName: 'newsItems',
    schema: newsItemSchemaDefinition,
    modelClass: class NewsItemModelImpl implements INewsItemModel {
      public id!: string;
      public title!: string;
      public media!: INewMediaItem[];
      public retrievedTimestamp!: number;

      // Optional properties
      public contentSnippet?: string;
      public fullContentUri?: string;
      public analysis?: INewsItemAnalysis; // This will include impactScore
      public newsSource?: string;
      public originalSourceId?: string;
      public publishedTimestamp?: number;
      public tags?: string[];

      public constructor() {
        // Initialize arrays or default values if necessary
        this.media = [];
        this.tags = [];
      }
    },
    daoClass: NewsDataAccessObject,
  };
}
