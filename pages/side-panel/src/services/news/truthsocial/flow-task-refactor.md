# Flow and Task Refactor

Below is a high‐level proposal for how to peel apart your monolithic `TruthSocialService` into two layers:

1. **Top-Level Flows**
   These orchestration classes coordinate “when things happen” (e.g. “poll every minute,” “process each status,” “tear down on dispose,” etc.). You’ll end up with maybe two or three flows:

   * **PollingFlow**: “Fetch from TruthSocial API every minute, dedupe, and hand new items off to the ProcessingFlow.”
   * **ProcessingFlow**: “Given a single `TruthSocialStatus`, run it through media transcription, GPT analysis, mapping to `INewsItemModel`, and finally persist or skip.”
   * (Optionally) **ShutdownFlow** or **LifecycleFlow**: “On dispose, stop polling and clean up any open tabs or timers.”

2. **Top-Level Tasks**
   Each Task is a single, reusable unit of work that takes a clearly defined input and produces a clearly defined output (or throws). For example:

   * **FetchStatusesTask**: “Call fetch, validate array, return `TruthSocialStatus[]`.”
   * **FilterAndEnqueueTask**: “Given `TruthSocialStatus[]`, compare against processed-IDs set and DB, and return only the brand-new ones.”
   * **TranscribeMediaTask**: “Given one `TruthSocialStatus`, do image OCR + video transcription, produce a `MediaTranscriptData[]` plus a merged‐text blob.”
   * **EconomicAnalysisTask** (or **GeminiAnalysisTask**): “Given status content + merged media text + API key, call `createGeminiCompletion(...)`, parse JSON, return `IParsedAnalysisResult` (or throw if invalid).”
   * **MapToNewsItemTask**: “Given `TruthSocialStatus` and an `IParsedAnalysisResult` plus `MediaTranscriptData[]`, return an `Omit<INewsItemModel,…>` (the plain object to send to the DB).”
   * **PersistNewsItemTask**: “Given that mapped object, call `createNewsItem(...)`; catch duplicates, etc.”
   * **CloseChatTabTask**: “Given a `chatTabId`, close it if open, swallowing errors.”

The key is that each “Task” can be tested in isolation (you give it input, it returns output or throws), and each “Flow” simply chains Tasks together in the right order and handles retries/timers/subscriptions.

---

## 1. PollingFlow

```ts
// PollingFlow.ts
import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';
import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';
import { ISharedNewsService } from '@shared/features/news/news.service';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { Disposable } from 'vs/base/common/lifecycle';
import { FetchStatusesTask } from './tasks/FetchStatusesTask';
import { FilterAndEnqueueTask } from './tasks/FilterAndEnqueueTask';
import { ProcessingFlow } from './ProcessingFlow';

const POLL_INTERVAL_MS = 60_000;

export class PollingFlow extends Disposable {
  private _timer?: NodeJS.Timeout;
  private _isPolling = false;
  private readonly _processingFlow: ProcessingFlow;
  private readonly _fetchTask: FetchStatusesTask;
  private readonly _filterEnqueueTask: FilterAndEnqueueTask;

  constructor(
    private readonly _asrService: IAsrService,
    private readonly _imageToTextService: IImageToTextService,
    private readonly _textToTextService: ITextToTextService,
    private readonly _sharedNewsService: ISharedNewsService,
    private readonly _localStorage: ILocalAsyncStorage<any>
  ) {
    super();
    // Build the tasks and sub-flow:
    this._fetchTask = new FetchStatusesTask();
    this._filterEnqueueTask = new FilterAndEnqueueTask(this._sharedNewsService);

    this._processingFlow = new ProcessingFlow(
      this._asrService,
      this._imageToTextService,
      this._textToTextService,
      this._sharedNewsService,
      this._localStorage
    );
  }

  public start(): void {
    if (this._isPolling) return;
    this._isPolling = true;
    // Immediately invoke once, then set interval
    this._pollCycle();
    this._timer = setInterval(() => this._pollCycle(), POLL_INTERVAL_MS);
  }

  public stop(): void {
    if (!this._isPolling) return;
    this._isPolling = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private async _pollCycle(): Promise<void> {
    try {
      console.log('[PollingFlow] Fetching statuses…');
      const statuses = await this._fetchTask.execute();
      if (statuses.length === 0) {
        console.log('[PollingFlow] No statuses returned');
        return;
      }
      // Filter out already-processed or DB-existing ones
      const newStatuses = await this._filterEnqueueTask.execute(statuses);
      if (newStatuses.length > 0) {
        console.log(`[PollingFlow] ${newStatuses.length} new statuses; passing to ProcessingFlow`);
        for (const status of newStatuses) {
          // Hand each one off (fire-and-forget; ProcessingFlow manages its own queue)
          this._processingFlow.enqueue(status);
        }
      } else {
        console.log('[PollingFlow] No new statuses to process');
      }
    } catch (e) {
      console.error('[PollingFlow] Error during polling cycle:', e);
    }
  }

  public override dispose(): void {
    this.stop();
    super.dispose();
  }
}
```

* **Responsibility**: “Every minute, fetch statuses, filter out old ones, and hand new ones to `ProcessingFlow`. Keep track of whether we’re already polling so we don’t start multiple timers.”

---

## 2. ProcessingFlow

```ts
// ProcessingFlow.ts
import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';
import { JobQueue } from '../utils/JobQueue';
import { TranscribeMediaTask } from './tasks/TranscribeMediaTask';
import { GeminiAnalysisTask } from './tasks/GeminiAnalysisTask';
import { MapToNewsItemTask } from './tasks/MapToNewsItemTask';
import { PersistNewsItemTask } from './tasks/PersistNewsItemTask';
import { CloseChatTabTask } from './tasks/CloseChatTabTask';
import { ISharedNewsService } from '@shared/features/news/news.service';
import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { SidePanelAppStorageSchema } from '@shared/storage/types/storage.types';

export class ProcessingFlow {
  private readonly _jobQueue: JobQueue<string>;

  constructor(
    private readonly _asrService: IAsrService,
    private readonly _imageToTextService: IImageToTextService,
    private readonly _textToTextService: ITextToTextService,
    private readonly _sharedNewsService: ISharedNewsService,
    private readonly _localStorage: ILocalAsyncStorage<SidePanelAppStorageSchema>
  ) {
    this._jobQueue = new JobQueue<string>({
      maxRetries: 3,
      initialBackoffMs: 10_000,
      maxBackoffMs: 300_000,
    });

    // Kick off the queue processor on interval or as soon as jobs arrive:
    setInterval(() => this._processNext(), 5_000);
  }

  /** Called by PollingFlow to add a brand-new status. */
  public enqueue(status: TruthSocialStatus) {
    this._jobQueue.addJob(status.id, status);
  }

  private async _processNext(): Promise<void> {
    await this._jobQueue.processQueue(async (status: TruthSocialStatus) => {
      let chatTabId: number | undefined;
      try {
        // Double‐check DB one more time
        const existing = await this._sharedNewsService.getNewsItemBySourceId(
          'TruthSocial',
          status.id
        );
        if (existing) {
          console.log(`[ProcessingFlow] Already in DB (${existing.id}), skipping.`);
          return;
        }

        // 1) Transcribe all media → returns Array<MediaTranscriptData> + mergedMediaText
        const { mediaTranscripts, mergedMediaText } = await new TranscribeMediaTask(
          this._asrService,
          this._imageToTextService
        ).execute(status);

        // 2) Run GPT analysis → returns IParsedAnalysisResult and maybe chatTabId if we opened a tab
        const { parsedAnalysis, chatTab } = await new GeminiAnalysisTask(
          this._textToTextService,
          this._localStorage
        ).execute(status, mergedMediaText);
        chatTabId = chatTab;

        // 3) Map to NewsItemModel DTO
        const dto = await new MapToNewsItemTask().execute(status, parsedAnalysis, mediaTranscripts);

        // 4) Persist into DB (catches duplicates internally)
        const newsItemId = await new PersistNewsItemTask(this._sharedNewsService).execute(dto);
        console.log(`[ProcessingFlow] Created news item ${newsItemId}`);

      } catch (err) {
        console.error('[ProcessingFlow] Error processing status:', status.id, err);
        throw err; // let JobQueue retry if configured
      } finally {
        // 5) Always attempt to close any ChatTab we opened
        if (chatTabId !== undefined) {
          await new CloseChatTabTask().execute(chatTabId).catch(() => {
            console.warn(`[ProcessingFlow] Failed to close tab ${chatTabId}`);
          });
        }
      }
    });
  }
}
```

* **Responsibility**: “Maintain its own internal `JobQueue`. For each status, run TranscribeMedia → GeminiAnalysis → MapToNewsItem → PersistNewsItem → CloseChatTab. Throw if any intermediate step fails so the queue can retry.”

---

## 3. Task Stubs

Below are minimal skeletons for each Task. Each Task gets exactly what it needs as constructor params (e.g. services, API key), and its `execute(...)` returns a strongly typed result or throws on error. You can write unit tests against each class in isolation.

---

### 3.1 FetchStatusesTask

```ts
// tasks/FetchStatusesTask.ts
import { TruthSocialStatus } from '../truthsocial.types';

export class FetchStatusesTask {
  private static readonly API_URL =
    'https://truthsocial.com/api/v1/accounts/107780257626128497/statuses?exclude_replies=true&only_replies=false&with_muted=true';

  public async execute(): Promise<TruthSocialStatus[]> {
    try {
      const response = await fetch(FetchStatusesTask.API_URL, {
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          Cookie: '',
          'Cache-Control': 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Expected array of statuses');
      }
      // Validate items have an “id” field
      return data.filter(
        (item: any): item is TruthSocialStatus => item && typeof item.id === 'string'
      );
    } catch (err) {
      console.error('[FetchStatusesTask] Error fetching:', err);
      return [];
    }
  }
}
```

---

### 3.2 FilterAndEnqueueTask

```ts
// tasks/FilterAndEnqueueTask.ts
import { TruthSocialStatus } from '../truthsocial.types';
import { ISharedNewsService } from '@shared/features/news/news.service';

export class FilterAndEnqueueTask {
  private _processedIds: Set<string> = new Set();

  constructor(private readonly _sharedNewsService: ISharedNewsService) {}

  /**
   * Returns only statuses that:
   *  - have an ID
   *  - have not been seen in processedIds set
   *  - do not already exist in the DB (via ISharedNewsService.getNewsItemBySourceId)
   */
  public async execute(statuses: TruthSocialStatus[]): Promise<TruthSocialStatus[]> {
    const result: TruthSocialStatus[] = [];

    for (const status of statuses) {
      if (!status.id) continue;
      if (this._processedIds.has(status.id)) continue;

      try {
        const existing = await this._sharedNewsService.getNewsItemBySourceId('TruthSocial', status.id);
        if (existing) {
          this._processedIds.add(status.id);
          continue;
        }
      } catch {
        // swallow; we’ll just enqueue in the worst case
      }

      this._processedIds.add(status.id);
      result.push(status);
    }
    return result;
  }
}
```

---

### 3.3 TranscribeMediaTask

```ts
// tasks/TranscribeMediaTask.ts
import { TruthSocialStatus } from '../truthsocial.types';
import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';

export interface MediaTranscriptData {
  mediaIndex: number;
  transcript?: string;
  ocrText?: string;
  longDescription?: string;
  description?: string;
  videoUri?: string;
}

export class TranscribeMediaTask {
  constructor(
    private readonly _asrService: IAsrService,
    private readonly _imageToTextService: IImageToTextService
  ) {}

  public async execute(
    status: TruthSocialStatus
  ): Promise<{ mediaTranscripts: MediaTranscriptData[]; mergedMediaText: string }> {
    const mediaTranscripts: MediaTranscriptData[] = [];
    let mergedMediaText = '';

    const attachments = status.media_attachments ?? [];
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      // VIDEO case
      if (att.type === 'video') {
        let videoUri: string | undefined = att.url;
        if (att.external_video_id) {
          try {
            const resp = await fetch(
              `https://truthsocial.com/api/v1/truth/videos/${att.external_video_id}`
            );
            if (resp.ok) {
              const meta = await resp.json();
              const assetUrl = (meta.video?.assets?.video ?? [])[0]?.url;
              if (typeof assetUrl === 'string') {
                videoUri = assetUrl;
              }
            }
          } catch {}
        }
        if (!videoUri) {
          mediaTranscripts.push({ mediaIndex: i });
          continue;
        }
        const transcript = await this._asrService.transcribeMediaAttachment(
          { ...att, url: videoUri, remote_url: null },
          `job-${Date.now()}`,
          120
        );
        mediaTranscripts.push({ mediaIndex: i, transcript, videoUri });
        if (transcript) {
          mergedMediaText += `\n[Media ${i + 1} - Video]: ${transcript}`;
        }
      }
      // IMAGE case
      else if (att.type === 'image' && att.url) {
        try {
          const resp = await fetch(att.url);
          const arrayBuffer = await resp.arrayBuffer();
          const buffer = new Uint8Array(arrayBuffer);
          const vsBuffer = VSBuffer.wrap(buffer);
          const { ocrText, moreDetailedCaption, caption } =
            await this._imageToTextService.textFromBuffer(vsBuffer);
          mediaTranscripts.push({
            mediaIndex: i,
            ocrText,
            longDescription: moreDetailedCaption,
            description: caption,
          });
          const combined = [ocrText, moreDetailedCaption].filter(Boolean).join(' ');
          if (combined) {
            mergedMediaText += `\n[Media ${i + 1} - Image]: ${combined}`;
          }
        } catch {
          mediaTranscripts.push({ mediaIndex: i });
        }
      } else {
        mediaTranscripts.push({ mediaIndex: i });
      }
    }

    return { mediaTranscripts, mergedMediaText };
  }
}
```

---

### 3.4 GeminiAnalysisTask

```ts
// tasks/GeminiAnalysisTask.ts
import { TruthSocialStatus } from '../truthsocial.types';
import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import {
  ECONOMIC_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE,
  buildEconomicAnalysisPrompt,
  economicAnalysisSchema
} from '../prompt';
import { parseAnalysisJson } from '../utils/commonUtils';

export interface GeminiAnalysisResult {
  parsedAnalysis: IParsedAnalysisResult;
  chatTab?: number; // if you choose to open a tab, return its ID
}

export class GeminiAnalysisTask {
  constructor(
    private readonly _textToTextService: ITextToTextService,
    private readonly _localStorage: ILocalAsyncStorage<any>
  ) {}

  public async execute(
    status: TruthSocialStatus,
    mergedMediaText: string
  ): Promise<GeminiAnalysisResult> {
    // 1) load API key from storage
    let apiKey: string | undefined;
    try {
      const key = await this._localStorage.get('GOOGLE_GEMINI_API_KEY');
      if (typeof key === 'string' && key.trim()) {
        apiKey = key;
      } else {
        console.warn('[GeminiAnalysisTask] API key missing');
      }
    } catch (e) {
      console.error('[GeminiAnalysisTask] Error loading API key:', e);
    }

    // 2) build the prompt
    const merged = mergedMediaText || undefined;
    const temp: Partial<TruthSocialStatus> = { ...status, content: status.content || '' };
    const prompt = buildEconomicAnalysisPrompt(temp as any, merged);

    // 3) if no API key → return a fallback analysis
    if (!apiKey) {
      return {
        parsedAnalysis: {
          title: 'Analysis Skipped',
          summary:
            'Google Gemini API key missing. Economic analysis could not be performed.',
          impactScore: 1,
          tags: ['configuration-error', 'api-key-missing'],
          sentiment: 'neutral',
          historicalPrecedents: [],
        }
      };
    }

    // 4) perform the first-generation call
    console.log('[GeminiAnalysisTask] Calling Gemini for initial analysis');
    const initial = await createGeminiCompletion(
      prompt,
      apiKey,
      'gemini-2.0-flash',
      {
        enforceSchemaAndJsonOutput: true,
        responseSchema: economicAnalysisSchema,
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    );
    let parsed = parseAnalysisJson(initial.content);

    // 5) if impactScore > 1, do enhanced (Google Search) pass
    if (
      parsed.impactScore &&
      parsed.impactScore > 1 &&
      parsed.title !== 'Link content unavailable or non-economic' &&
      parsed.title !== 'No substantive content'
    ) {
      console.log('[GeminiAnalysisTask] Impact >1, doing enhanced analysis');
      const enhanced = await createGeminiCompletion(
        prompt + ECONOMIC_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE,
        apiKey,
        'gemini-2.0-flash',
        {
          enableGoogleSearch: true,
          enforceSchemaAndJsonOutput: true,
          responseSchema: economicAnalysisSchema,
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      );
      parsed = parseAnalysisJson(enhanced.content);
    }

    // 6) ensure summary is valid
    if (!parsed.summary || parsed.summary.trim() === '') {
      throw new Error(
        `[GeminiAnalysisTask] No valid summary returned for status ${status.id}`
      );
    }

    return { parsedAnalysis: parsed };
  }
}
```

---

### 3.5 MapToNewsItemTask

```ts
// tasks/MapToNewsItemTask.ts
import { TruthSocialStatus } from '../truthsocial.types';
import { INewMediaItem, MediaType } from '@shared/features/news/NewsDataAccessObject';
import {
  IParsedAnalysisResult
} from '../utils/commonUtils';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { generateTitleFromContent } from '../utils/commonUtils';

export class MapToNewsItemTask {
  public async execute(
    status: TruthSocialStatus,
    parsed: IParsedAnalysisResult,
    mediaTranscripts: Array<{ mediaIndex: number; transcript?: string; ocrText?: string; longDescription?: string; description?: string; videoUri?: string; }>
  ): Promise<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>> {
    // 1) build mediaItems[]
    const mediaItems: INewMediaItem[] = [];
    for (let i = 0; i < (status.media_attachments?.length ?? 0); i++) {
      const att = status.media_attachments[i];
      const mt = mediaTranscripts.find((m) => m.mediaIndex === i);
      if (att.type === 'image' && att.url) {
        mediaItems.push({
          mediaType: MediaType.IMAGE,
          uri: att.url,
          caption: mt?.description ?? att.description ?? undefined,
          sourceProvider: 'TruthSocial',
          width: att.meta?.original?.width,
          height: att.meta?.original?.height,
          ocrText: mt?.ocrText,
          longDescription: mt?.longDescription
        });
      } else if (att.type === 'video') {
        const videoUri = mt?.videoUri;
        if (videoUri) {
          mediaItems.push({
            mediaType: MediaType.VIDEO,
            uri: videoUri,
            caption: att.description ?? undefined,
            thumbnailUri: att.preview_url ?? undefined,
            sourceProvider: 'TruthSocial',
            durationSeconds: att.meta?.original?.duration,
            transcription: mt?.transcript
          });
        }
      }
    }

    // 2) build analysis object if summary exists
    let analysis: INewsItemAnalysis | undefined;
    if (parsed.summary && parsed.summary.trim() !== '') {
      const historicalPrecedents = Array.isArray(parsed.historicalPrecedents)
        ? parsed.historicalPrecedents.map((p) => ({
            situation: p.situation,
            immediateMarketEffect: p.immediateMarketEffect,
            oneWeekMarketEffect: p.oneWeekMarketEffect
          }))
        : undefined;

      analysis = {
        summary: parsed.summary,
        sentiment: mapSentimentToEnum(parsed.sentiment),
        analysisTimestamp: Date.now(),
        impactScore: parsed.impactScore,
        historicalPrecedents
      };
    } else {
      console.warn(`[MapToNewsItemTask] No valid summary for status ${status.id}`);
    }

    // 3) contentSnippet from parsed summary or fallback to markdown
    let contentSnippet: string | undefined = parsed.summary?.trim();
    if (!contentSnippet && status.content) {
      const md = convertHtmlToMarkdown(status.content).replace(/\s+/g, ' ').trim();
      contentSnippet = md || undefined;
    }

    // 4) decide title
    let finalTitle: string;
    if (parsed.title && parsed.title.trim()) {
      finalTitle = parsed.title.trim();
    } else {
      const plain = convertHtmlToMarkdown(status.content || '')
        .replace(/<[^>]*>?/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
      finalTitle = generateTitleFromContent(plain || 'Truth Social Post', 'Truth Social Post');
    }
    if (finalTitle.length > 250) {
      finalTitle = `${finalTitle.slice(0, 247)}...`;
    }

    // 5) build tags: from parsed.tags or from status.tags
    let tags: string[] = [];
    if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
      tags = parsed.tags;
    } else if (Array.isArray(status.tags)) {
      tags = status.tags
        .filter((t: any) => t && typeof t.name === 'string')
        .map((t: { name: string }) => t.name);
    }

    return {
      title: finalTitle,
      contentSnippet,
      fullContentUri: status.url || status.uri,
      analysis,
      media: mediaItems,
      newsSource: 'TruthSocial',
      originalSourceId: status.id,
      publishedTimestamp: status.created_at ? new Date(status.created_at).getTime() : Date.now(),
      tags
    };
  }
}
```

---

### 3.6 PersistNewsItemTask

```ts
// tasks/PersistNewsItemTask.ts
import { ISharedNewsService } from '@shared/features/news/news.service';
import { INewsItemModel } from '@shared/features/news/NewsDataAccessObject';

export class PersistNewsItemTask {
  constructor(private readonly _sharedNewsService: ISharedNewsService) {}

  public async execute(
    newsItem: Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>
  ): Promise<string> {
    try {
      const id = await this._sharedNewsService.createNewsItem(newsItem);
      return id;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // If duplicate, swallow and return something or rethrow if you want the queue to skip:
      if (msg.includes('Duplicate: News item from source')) {
        console.warn('[PersistNewsItemTask] Duplicate detected, skipping.');
        return 'DUPLICATE';
      }
      throw err;
    }
  }
}
```

---

### 3.7 CloseChatTabTask

```ts
// tasks/CloseChatTabTask.ts
export class CloseChatTabTask {
  public async execute(tabId: number): Promise<void> {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // swallow
    }
  }
}
```

---

## 4. Wiring Them All Together

Finally, your top‐level “Service” (formerly `TruthSocialService`) can simply instantiate and wire these flows:

```ts
// index.ts (or wherever you register your services)
import { PollingFlow } from './flows/PollingFlow';

export function registerTruthSocialService(
  asrService: IAsrService,
  imageToTextService: IImageToTextService,
  textToTextService: ITextToTextService,
  sharedNewsService: ISharedNewsService,
  localStorage: ILocalAsyncStorage<SidePanelAppStorageSchema>
): void {
  const pollingFlow = new PollingFlow(
    asrService,
    imageToTextService,
    textToTextService,
    sharedNewsService,
    localStorage
  );
  pollingFlow.start();

  // If using DI container: bind PollingFlow to ITruthSocialService, etc.
}
```

* There is no longer one giant class. Instead, you have:

  1. **PollingFlow** (“how often do we fetch?”)
  2. **ProcessingFlow** (“for each status, run these sub-Tasks in order”)
  3. **Seven small Tasks** (`FetchStatusesTask`, `FilterAndEnqueueTask`, `TranscribeMediaTask`, `GeminiAnalysisTask`, `MapToNewsItemTask`, `PersistNewsItemTask`, and `CloseChatTabTask`).

---

## 5. Benefits of This Split

1. **Single-Responsibility**

   * Each Task does exactly one thing (e.g. “call API and return raw statuses” or “turn status→DTO” or “persist to DB”).
   * Each Flow only orchestrates calls to its child Tasks on a schedule or queue.

2. **Testability**

   * You can write a unit test for `MapToNewsItemTask` by feeding it a mock `TruthSocialStatus` plus a fake `IParsedAnalysisResult` and asserting that the returned object matches your expected shape.
   * You can test `TranscribeMediaTask` by mocking `IAsrService`/`IImageToTextService`.
   * You can test `FetchStatusesTask` by stubbing `fetch(...)` (e.g. using `sinon` or `fetch‐mock`) and verifying your code handles non‐200s or invalid JSON gracefully.

3. **Clarity**

   * In `PollingFlow`, you see exactly: “fetch, filter, enqueue.” There’s no need to scroll through hundreds of lines mixing HTTP calls, DOM injection, GPT logic, etc.
   * In `ProcessingFlow`, you see: “process one job → transcribe → analyze → map → persist → close tab.”

4. **Incremental Refactoring**

   * You can extract one Task at a time. For example, extract `MapToNewsItem` first (move all mapping logic out of the old class). Then replace the old mapping code with a call to that Task, verify everything still works, and so on.

---

## 6. Next Steps

1. **Create a new directory structure**

   ```markdown
   src/services/TruthSocial/
     flows/
       PollingFlow.ts
       ProcessingFlow.ts
     tasks/
       FetchStatusesTask.ts
       FilterAndEnqueueTask.ts
       TranscribeMediaTask.ts
       GeminiAnalysisTask.ts
       MapToNewsItemTask.ts
       PersistNewsItemTask.ts
       CloseChatTabTask.ts
     truthsocial.types.ts
     (any shared utilities, e.g. commonUtils.ts)
   ```

2. **Copy/Paste or Move Code**

   * Take your existing `fetchAndLogTruthSocialData()` logic and paste into `FetchStatusesTask.execute()`.
   * Take the code that checked `_processedStatusIds`, DB existence, and job queue logic, and repurpose into `FilterAndEnqueueTask` and `ProcessingFlow.enqueue(...)`.
   * Take the big `prepareAndInjectStatus(...)` and copy the media loop into `TranscribeMediaTask`, and copy the Gemini calls into `GeminiAnalysisTask`.
   * Copy the mapping code into `MapToNewsItemTask`.
   * Copy your DB‐create logic into `PersistNewsItemTask`.

3. **Hook Up the Flows**

   * In your top‐level “TruthSocialService” file (or wherever your DI container is), replace the old class‐based polling with `new PollingFlow(...).start()`.
   * Remove all the monolithic logic from `TruthSocialService` one chunk at a time—confirm after each removal that the smaller Tasks/Flows still work.

---

### Summary

| Layer                    | “Does What”                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PollingFlow**          | Every minute: call `FetchStatusesTask` → call `FilterAndEnqueueTask` → hand results to `ProcessingFlow.enqueue(...)`.                                                  |
| **ProcessingFlow**       | Maintains a `JobQueue`. For each status in queue: run `TranscribeMediaTask` → `GeminiAnalysisTask` → `MapToNewsItemTask` → `PersistNewsItemTask` → `CloseChatTabTask`. |
| **FetchStatusesTask**    | HTTP GET → validate JSON array → return `TruthSocialStatus[]`.                                                                                                         |
| **FilterAndEnqueueTask** | Filter out already-seen IDs and DB-existing items → return new statuses.                                                                                               |
| **TranscribeMediaTask**  | Loop attachments: OCR images + transcribe videos → build `MediaTranscriptData[]` + `mergedMediaText`.                                                                  |
| **GeminiAnalysisTask**   | Build prompt + call `createGeminiCompletion(...)` (maybe twice) → parse JSON → return `IParsedAnalysisResult`.                                                         |
| **MapToNewsItemTask**    | Turn `(status, parsedAnalysis, mediaTranscripts)` → `Omit<INewsItemModel,…>` DTO.                                                                                      |
| **PersistNewsItemTask**  | Call `createNewsItem(dto)` on `ISharedNewsService` → catch duplicates.                                                                                                 |
| **CloseChatTabTask**     | If we opened a ChatGPT tab, close it via `chrome.tabs.remove(tabId)`.                                                                                                  |

By organizing code this way, you achieve:

* **Clear orchestration (Flows)** separated from
* **Pure business logic or I/O (Tasks)**.

From here, continue refactoring step by step: move each chunk of code into its new Task, wire it up, verify, and delete the old code. That gives you a much cleaner, maintainable, and testable structure.
