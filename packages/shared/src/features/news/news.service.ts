import { INewsItemModel, NewsDataAccessObject } from './NewsDataAccessObject';
import { ILogService } from '@shared/services/log.service';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { generateUuid } from 'vs/base/common/uuid';
import { NewsValidator, ValidationError } from './news.validator';
import { SortOrder, Pager } from '@shared/storage/dexie/dataAccessObject/Pager';
import { liveQuery, type Subscription } from 'dexie';
import { IObservable, observableValue } from 'vs/base/common/observable';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';

const LATEST_NEWS_PAGE_SIZE = 20;
const LATEST_NEWS_SORT_INDEX: keyof INewsItemModel = 'publishedTimestamp';

export interface INewsService extends IDisposable {
  readonly _serviceBrand: undefined;
  readonly latestNews$: IObservable<INewsItemModel[]>; // Added
  createNewsItem(itemData: Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>): Promise<string>;
  getNewsItem(id: string): Promise<INewsItemModel | undefined>;
  updateNewsItem(
    id: string,
    updates: Partial<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>>,
  ): Promise<void>;
  deleteNewsItem(id: string): Promise<void>;
  listNewsItems(
    query?: Partial<Record<keyof INewsItemModel, unknown>>,
    options?: {
      pageSize?: number;
      sortOrder?: SortOrder;
      sortIndex?: keyof INewsItemModel;
    },
  ): Promise<INewsItemModel[]>;
  getNewsItemBySourceId(
    newsSource: string,
    originalSourceId: string,
  ): Promise<INewsItemModel | undefined>;
}

export const INewsService = createDecorator<INewsService>('newsService');

export class NewsService extends Disposable implements INewsService {
  public readonly _serviceBrand: undefined;

  private readonly _latestNewsValue$ = observableValue<INewsItemModel[]>('latestNews', []);
  public readonly latestNews$: IObservable<INewsItemModel[]> = this._latestNewsValue$;
  private _latestNewsSubscription: Subscription | undefined;

  public constructor(
    private readonly _logService: ILogService,
    private readonly _newsDAO: NewsDataAccessObject,
  ) {
    super();
    this._initializeLatestNewsObservable();
  }

  private _initializeLatestNewsObservable(): void {
    this._latestNewsSubscription = liveQuery(() =>
      this._newsDAO.table
        .orderBy(LATEST_NEWS_SORT_INDEX)
        .reverse()
        .limit(LATEST_NEWS_PAGE_SIZE)
        .toArray(),
    ).subscribe({
      next: (result: INewsItemModel[]) => {
        this._latestNewsValue$.set(result, undefined);
        this._logService.trace('[NewsService] Latest news updated via liveQuery:', result.length);
      },
      error: (error: unknown) => {
        this._logService.error('[NewsService] Live query error for latest news:', error);
      },
    });

    this._register({
      dispose: () => {
        if (this._latestNewsSubscription) {
          this._latestNewsSubscription.unsubscribe();
          this._logService.trace('[NewsService] Unsubscribed from latest news liveQuery.');
        }
      },
    });
  }

  public async createNewsItem(
    itemData: Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>,
  ): Promise<string> {
    this._logService.trace('[NewsService] Attempting to create news item:', itemData);
    try {
      NewsValidator.validate(itemData, true);
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        this._logService.warn(
          '[NewsService] Validation failed for new news item:',
          error.errors, // No cast needed
        );
        throw error;
      }
      this._logService.error('[NewsService] Unexpected error during validation:', error);
      throw new Error('An unexpected error occurred during validation.');
    }

    const id = generateUuid();
    const retrievedTimestamp = Date.now();
    const newsItem: INewsItemModel = {
      ...itemData,
      id,
      retrievedTimestamp,
      media: itemData.media || [],
    };

    if (itemData.newsSource && itemData.originalSourceId) {
      const existing = await this.getNewsItemBySourceId(
        itemData.newsSource,
        itemData.originalSourceId,
      );
      if (existing) {
        this._logService.warn(
          `[NewsService] News item with source ${itemData.newsSource} and ID ${itemData.originalSourceId} already exists with id ${existing.id}.`,
        );
        throw new Error(
          `Duplicate: News item from source '${itemData.newsSource}' with original ID '${itemData.originalSourceId}' already exists.`,
        );
      }
    }

    await this._newsDAO.add(newsItem);
    this._logService.info(`[NewsService] News item created with ID: ${id}`);
    return id;
  }

  public async getNewsItem(id: string): Promise<INewsItemModel | undefined> {
    this._logService.trace(`[NewsService] Attempting to get news item with ID: ${id}`);
    return this._newsDAO.get(id);
  }

  public async getNewsItemBySourceId(
    newsSource: string,
    originalSourceId: string,
  ): Promise<INewsItemModel | undefined> {
    this._logService.trace(
      `[NewsService] Attempting to get news item by source: ${newsSource}, originalId: ${originalSourceId}`,
    );
    return this._newsDAO.findBySourceAndOriginalId(newsSource, originalSourceId);
  }

  public async updateNewsItem(
    id: string,
    updates: Partial<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>>,
  ): Promise<void> {
    this._logService.trace(`[NewsService] Attempting to update news item with ID: ${id}`, updates);
    try {
      NewsValidator.validate(updates, false);
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        this._logService.warn(
          `[NewsService] Validation failed for updating news item ID ${id}:`,
          error.errors, // No cast needed
        );
        throw error;
      }
      this._logService.error(
        `[NewsService] Unexpected error during validation for update ID ${id}:`,
        error,
      );
      throw new Error('An unexpected error occurred during validation.');
    }

    // The 'updates' object already has 'id' and 'retrievedTimestamp' excluded by its type.
    // No need to delete them.
    const validUpdates = updates;

    if (Object.keys(validUpdates).length === 0) {
      this._logService.info(`[NewsService] No valid fields to update for news item ID: ${id}`);
      return;
    }

    await this._newsDAO.update(id, validUpdates);
    this._logService.info(`[NewsService] News item updated with ID: ${id}`);
  }

  public async deleteNewsItem(id: string): Promise<void> {
    this._logService.trace(`[NewsService] Attempting to delete news item with ID: ${id}`);
    await this._newsDAO.delete(id);
    this._logService.info(`[NewsService] News item deleted with ID: ${id}`);
  }

  public async listNewsItems(
    query: Partial<Record<keyof INewsItemModel, unknown>> = {},
    options?: {
      pageSize?: number;
      sortOrder?: SortOrder;
      sortIndex?: keyof INewsItemModel;
    },
  ): Promise<INewsItemModel[]> {
    this._logService.trace(
      '[NewsService] Listing news items with query:',
      query,
      'options:',
      options,
    );
    const {
      pageSize = 20,
      sortOrder = SortOrder.DESC,
      sortIndex = 'publishedTimestamp',
    } = options || {};

    const criterionFunction = (item: INewsItemModel): boolean => {
      const queryKeys = Object.keys(query) as (keyof INewsItemModel)[];
      return queryKeys.every(key => {
        const itemValue = item[key];
        const queryValue = query[key]; // queryValue is unknown

        if (key === 'tags') {
          const itemTags = item.tags; // string[] | undefined
          // queryValue is query.tags, which is unknown
          if (
            Array.isArray(itemTags) &&
            Array.isArray(queryValue) &&
            queryValue.every((tag): tag is string => typeof tag === 'string')
          ) {
            // queryValue is now confirmed as string[]
            return queryValue.every(tagToFind => itemTags.includes(tagToFind));
          }
          return false; // Tags don't match criteria or types are incompatible
        }
        // For other properties, direct comparison.
        // This relies on queryValue being of a comparable type to itemValue at runtime.
        return itemValue === queryValue;
      });
    };

    const pager = new Pager<INewsItemModel, string>({
      table: this._newsDAO.table,
      index: sortIndex as keyof INewsItemModel & string,
      idProp: 'id',
      criterionFunction: Object.keys(query).length > 0 ? criterionFunction : undefined,
      sortOrder,
      pageSize,
    });

    const page = await pager.nextPage();
    this._logService.trace(`[NewsService] Found ${page.length} news items.`);
    return page;
  }

  public override dispose(): void {
    super.dispose();
  }
}
