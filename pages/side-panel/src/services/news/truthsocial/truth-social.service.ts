import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { TruthSocialStatus } from './truth-social.types';
import { Event as VSEvent, Emitter } from 'vs/base/common/event';
import { IServiceWithProgressEvents, ServiceEvent } from '@src/side-panel/worker/utils/types';
import { INewsService as ISharedNewsService } from '@shared/features/news/news.service';
import {
  INewsItemModel,
  INewMediaItem,
  MediaType,
  INewsItemAnalysis,
  IHistoricalPrecedent,
} from '@shared/features/news/NewsDataAccessObject';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { SidePanelAppStorageSchema, StorageKeys } from '@shared/storage/types/storage.types';
import {
  generateTitleFromContent,
  mapSentimentToEnum,
  IParsedAnalysisResult,
} from '../../utils/commonUtils';
import { JobQueue } from '../../utils/JobQueue';
import type { ITruthSocialAnalysis } from './truth-social-analysis'; // Use import type
import { MediaTranscriptData, TruthSocialAnalysis } from './truth-social-analysis';
import { IPollingService, PollingService } from '../../utils/polling'; // Corrected import path

const TRUTH_SOCIAL_API_URL =
  'https://truthsocial.com/api/v1/accounts/107780257626128497/statuses?exclude_replies=true&only_replies=false&with_muted=true';
const POLL_INTERVAL_MS = 60000; // 1 minute

async function mapStatusToNewsItemModel(
  status: TruthSocialStatus,
  parsedGptAnalysis: IParsedAnalysisResult,
  mediaTranscripts?: MediaTranscriptData[],
): Promise<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>> {
  const mediaItems: INewMediaItem[] = [];
  for (let i = 0; i < (status.media_attachments?.length ?? 0); i++) {
    const att = status.media_attachments[i];
    const mediaData = mediaTranscripts?.find(mt => mt.mediaIndex === i);
    if (att.type === 'image' && att.url) {
      mediaItems.push({
        mediaType: MediaType.IMAGE,
        uri: att.url,
        caption: mediaData?.description || att.description || undefined,
        sourceProvider: 'TruthSocial',
        width: att.meta?.original?.width,
        height: att.meta?.original?.height,
        ocrText: mediaData?.ocrText,
        longDescription: mediaData?.longDescription,
      });
    } else if (att.type === 'video') {
      const videoUri = mediaData?.videoUri;
      if (videoUri) {
        mediaItems.push({
          mediaType: MediaType.VIDEO,
          uri: videoUri,
          caption: att.description || undefined,
          thumbnailUri: att.preview_url || undefined,
          sourceProvider: 'TruthSocial',
          durationSeconds: att.meta?.original?.duration,
          transcription: mediaData?.transcript,
        });
      }
    }
  }

  let newsItemAnalysis: INewsItemAnalysis | undefined = undefined;

  if (parsedGptAnalysis.summary && parsedGptAnalysis.summary.trim() !== '') {
    let historicalPrecedents: IHistoricalPrecedent[] | undefined;
    if (Array.isArray(parsedGptAnalysis.historicalPrecedents)) {
      historicalPrecedents = parsedGptAnalysis.historicalPrecedents
        .filter(
          (
            p,
          ): p is {
            situation: string;
            immediateMarketEffect: string;
            oneWeekMarketEffect: string;
          } =>
            typeof p.situation === 'string' &&
            typeof p.immediateMarketEffect === 'string' &&
            typeof p.oneWeekMarketEffect === 'string',
        )
        .map(p => ({
          situation: p.situation,
          immediateMarketEffect: p.immediateMarketEffect,
          oneWeekMarketEffect: p.oneWeekMarketEffect,
        }));
    }
    newsItemAnalysis = {
      summary: parsedGptAnalysis.summary,
      sentiment: mapSentimentToEnum(parsedGptAnalysis.sentiment),
      analysisTimestamp: Date.now(),
      impactScore: parsedGptAnalysis.impactScore,
      historicalPrecedents,
    };
  } else {
    console.warn(
      `[mapStatusToNewsItemModel] No valid summary in parsed GPT analysis for status ID: ${status.id}. Analysis object will be omitted.`,
    );
  }

  let contentSnippetValue: string | undefined = parsedGptAnalysis.summary || undefined;

  if (!contentSnippetValue && status.content) {
    contentSnippetValue = convertHtmlToMarkdown(status.content).replace(/\s+/g, ' ').trim();
  }

  let finalTitle: string;
  if (parsedGptAnalysis.title && parsedGptAnalysis.title.trim() !== '') {
    finalTitle = parsedGptAnalysis.title.trim();
  } else {
    const plainTextContent = convertHtmlToMarkdown(status.content || '')
      .replace(/<[^>]*>?/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    finalTitle = generateTitleFromContent(
      plainTextContent || 'Truth Social Post',
      'Truth Social Post',
    );
  }
  if (finalTitle.length > 250) {
    finalTitle = `${finalTitle.substring(0, 247)}...`;
  }

  let finalContentSnippet: string | undefined;
  if (parsedGptAnalysis.summary && parsedGptAnalysis.summary.trim() !== '') {
    finalContentSnippet = parsedGptAnalysis.summary.trim();
  } else if (status.content) {
    const markdownSnippet = convertHtmlToMarkdown(status.content).replace(/\s+/g, ' ').trim();
    finalContentSnippet = markdownSnippet !== '' ? markdownSnippet : undefined;
  }

  return {
    title: finalTitle,
    contentSnippet: finalContentSnippet,
    fullContentUri: status.url || status.uri || undefined,
    analysis: newsItemAnalysis,
    media: mediaItems,
    newsSource: 'TruthSocial',
    originalSourceId: status.id,
    publishedTimestamp: status.created_at ? new Date(status.created_at).getTime() : Date.now(),
    tags:
      Array.isArray(parsedGptAnalysis.tags) && parsedGptAnalysis.tags.length > 0
        ? parsedGptAnalysis.tags
        : Array.isArray(status.tags)
          ? status.tags
              .filter(
                (tag: unknown): tag is { name: string } =>
                  typeof tag === 'object' &&
                  tag !== null &&
                  'name' in tag &&
                  typeof (tag as { name: unknown }).name === 'string',
              )
              .map(tag => tag.name)
          : [],
  };
}

export interface ITruthSocialService extends IServiceWithProgressEvents, Disposable {
  fetchTruthSocialData(): Promise<TruthSocialStatus[]>;
  readonly onStatusProcessed: VSEvent<TruthSocialStatus>; // Added from previous refactor
}

export const ITruthSocialService = createDecorator<ITruthSocialService>('truthSocialService');

export class TruthSocialService extends Disposable implements ITruthSocialService {
  declare readonly _serviceBrand: undefined;
  public readonly onProgress: VSEvent<ServiceEvent>;
  private readonly _onStatusProcessed = new Emitter<TruthSocialStatus>();
  public readonly onStatusProcessed = this._onStatusProcessed.event;

  private readonly _jobQueue: JobQueue<TruthSocialStatus>;
  private readonly _processedStatusIds: Set<string> = new Set();
  private readonly _analyzer: ITruthSocialAnalysis;
  private readonly _pollingService: IPollingService;
  private _jobQueueInterval: NodeJS.Timeout | undefined;

  constructor(
    @IInstantiationService private readonly _instantiationService: IInstantiationService,
    @ISharedNewsService private readonly _sharedNewsService: ISharedNewsService,
    @ILocalAsyncStorage
    private readonly _localAsyncStorage: ILocalAsyncStorage<SidePanelAppStorageSchema>,
  ) {
    super();
    this._analyzer = this._instantiationService.createInstance(TruthSocialAnalysis);
    this.onProgress = this._analyzer.onProgress; // Delegate onProgress to the analyzer

    this._jobQueue = new JobQueue<TruthSocialStatus>({
      maxRetries: 3,
      initialBackoffMs: 10000,
      maxBackoffMs: 300000,
    });

    this._pollingService = this._register(
      new PollingService({
        pollIntervalMs: POLL_INTERVAL_MS,
        callback: () => this._fetchAndEnqueueStatuses(),
        onError: err => console.error('[TruthSocialService] Polling callback error:', err),
        runImmediately: true,
        serviceName: 'TruthSocialServicePolling',
      }),
    );

    // Process the queue every 5 seconds
    this._jobQueueInterval = setInterval(() => this._processJobQueue(), 5000);

    // Start polling
    this._pollingService.start();
  }

  /**
   * Checks if a Gemini API key is configured
   */
  private async _hasGeminiApiKey(): Promise<boolean> {
    try {
      const storedKey = await this._localAsyncStorage.get(StorageKeys.GOOGLE_GEMINI_API_KEY);
      return typeof storedKey === 'string' && storedKey.trim() !== '';
    } catch (error) {
      console.error('[TruthSocialService] Error checking for Gemini API key:', error);
      return false;
    }
  }

  /**
   * Fetches data from Truth Social API
   */
  public async fetchTruthSocialData(): Promise<TruthSocialStatus[]> {
    try {
      const response = await fetch(TRUTH_SOCIAL_API_URL, {
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          Cookie: '',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('API response is not an array');
      }

      const statuses = data.filter(
        (item: unknown): item is TruthSocialStatus =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as TruthSocialStatus).id === 'string' &&
          typeof (item as TruthSocialStatus).created_at === 'string', // Added for robustness
      );
      // console.log(`[TruthSocialService] Fetched ${statuses.length} statuses`); // Log moved to _fetchAndEnqueueStatuses
      return statuses;
    } catch (error) {
      console.error('[TruthSocialService] Error fetching Truth Social data:', error);
      return [];
    }
  }

  /**
   * Invoked by PollingService on each tick.
   * Fetches new statuses from Truth Social and enqueues any that haven’t been processed yet.
   */
  private async _fetchAndEnqueueStatuses(): Promise<void> {
    // Check if API key is configured
    const hasApiKey = await this._hasGeminiApiKey();
    if (!hasApiKey) {
      console.log(
        '[TruthSocialService] Gemini API key not configured, skipping Truth Social processing',
      );
      return;
    }

    // console.log('[TruthSocialService] Polling Truth Social API for new statuses'); // Optional: log for each poll attempt
    let statuses: TruthSocialStatus[];
    try {
      statuses = await this.fetchTruthSocialData();
    } catch (error) {
      // Error is logged by fetchTruthSocialData, PollingService also logs.
      return; // fetchTruthSocialData returns [] on error, so no statuses to process.
    }

    if (statuses.length === 0) {
      // console.log('[TruthSocialService] No statuses fetched or an error occurred.'); // Optional log
      return;
    }

    let newCount = 0;
    for (const status of statuses) {
      if (!status.id) {
        // Should be caught by type guard, but good for safety
        console.warn('[TruthSocialService] Received status without ID, skipping');
        continue;
      }
      if (this._processedStatusIds.has(status.id)) {
        continue;
      }
      if (this._jobQueue.hasJob(status.id)) {
        continue;
      }

      try {
        const existing = await this._sharedNewsService.getNewsItemBySourceId(
          'TruthSocial',
          status.id,
        );
        if (existing) {
          this._processedStatusIds.add(status.id);
          continue;
        }
      } catch (error) {
        console.warn(`[TruthSocialService] Error checking DB for status ${status.id}:`, error);
        // Decide if you want to enqueue despite DB check error. Current logic enqueues.
      }

      const added = this._jobQueue.addJob(status.id, status);
      if (added) {
        newCount++;
      }
    }

    if (newCount > 0) {
      console.log(`[TruthSocialService] Added ${newCount} new statuses to queue`);
    } else {
      // console.log('[TruthSocialService] No new statuses to process or add to queue.'); // Optional log
    }
  }

  /**
   * Internal: process queued statuses one by one
   */
  private async _processJobQueue(): Promise<void> {
    await this._jobQueue.processQueue(async (status: TruthSocialStatus) => {
      console.log(`[TruthSocialService] Processing status ID: ${status.id}`);
      // chatTabId logic removed as per refactoring

      try {
        // Double-check in DB
        const existing = await this._sharedNewsService.getNewsItemBySourceId(
          'TruthSocial',
          status.id,
        );
        if (existing) {
          console.log(
            `[TruthSocialService] News item for status ${status.id} already exists (DB ID: ${existing.id}). Adding to processed set.`,
          );
          this._processedStatusIds.add(status.id); // Ensure it's marked processed
          return;
        }

        // Delegate all analysis to TruthSocialAnalysis
        const { mediaTranscripts, parsedAnalysis /*, analysisText */ } =
          await this._analyzer.analyzeStatus(status); // analysisText is available if needed

        // Map to NewsItemModel
        const newsItemData = await mapStatusToNewsItemModel(
          status,
          parsedAnalysis,
          mediaTranscripts,
        );

        try {
          const newsItemId = await this._sharedNewsService.createNewsItem(newsItemData);
          console.log(
            `[TruthSocialService] Created news item ${newsItemId} for status ${status.id}`,
          );
          this._processedStatusIds.add(status.id);
          this._onStatusProcessed.fire(status);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Duplicate: News item from source')) {
            console.warn(
              `[TruthSocialService] Duplicate news item for status ${status.id} during creation. Marking as processed.`,
            );
            this._processedStatusIds.add(status.id); // Mark as processed on duplicate error
          } else {
            console.error(
              `[TruthSocialService] Error creating news item for status ${status.id}:`,
              err,
            );
            throw err; // Let job queue handle retry for other errors
          }
        }
      } catch (error) {
        // Catch errors from _analyzer.analyzeStatus or other issues
        console.error(
          `[TruthSocialService] Error processing status ${status.id} in job queue:`,
          error,
        );
        throw error; // Rethrow to allow job queue to handle retries
      }
      // finally block with chatTabId.close removed
    });
  }

  public override dispose(): void {
    // PollingService is registered, so its dispose (which calls stop) is handled by super.dispose()
    if (this._jobQueueInterval) {
      clearInterval(this._jobQueueInterval);
      this._jobQueueInterval = undefined;
    }
    super.dispose();
  }
}
