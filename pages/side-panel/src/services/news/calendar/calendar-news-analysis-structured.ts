import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event as VSEvent } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { ParsedEconomicEventData } from './economic-calendar-parser';
import { ILogService } from '@shared/services/log.service';
import { ServiceEvent } from '@src/side-panel/worker/utils/types';
import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { SidePanelAppStorageSchema, StorageKeys } from '@shared/storage/types/storage.types';
import {
  INewsItemModel,
  INewsItemAnalysis,
  IHistoricalPrecedent,
} from '@shared/features/news/NewsDataAccessObject';
import {
  parseAnalysisJson,
  IParsedAnalysisResult,
  mapSentimentToEnum,
  generateTitleFromContent,
} from '../../utils/commonUtils';
import { createGeminiCompletion } from '../../utils/googleGeminiToText';
import {
  buildEconomicEventAnalysisPrompt,
  economicEventAnalysisSchema,
  ECONOMIC_EVENT_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE,
} from './prompt';

export interface ICalendarNewsAnalysis extends Disposable {
  readonly onProgress: VSEvent<ServiceEvent>;
  analyzeEvent(
    event: ParsedEconomicEventData,
  ): Promise<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>>;
}

export const ICalendarNewsAnalysisService = createDecorator<ICalendarNewsAnalysis>(
  'calendarNewsAnalysisService',
);

async function mapEventToNewsItemModel(
  event: ParsedEconomicEventData,
  parsedGptAnalysis: IParsedAnalysisResult,
): Promise<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>> {
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
  }

  let finalTitle: string;
  if (parsedGptAnalysis.title && parsedGptAnalysis.title.trim() !== '') {
    finalTitle = parsedGptAnalysis.title.trim();
  } else {
    finalTitle = generateTitleFromContent(event.eventName, 'Economic Event');
  }
  if (finalTitle.length > 250) {
    finalTitle = `${finalTitle.substring(0, 247)}...`;
  }

  const tagsFromAnalysis = Array.isArray(parsedGptAnalysis.tags) ? parsedGptAnalysis.tags : [];
  const defaultTags = [
    event.country,
    event.currency,
    event.eventName.split(' ')[0], // e.g., "Fed" from "Fed Logan Speaks"
    'EconomicCalendar',
  ].filter(Boolean) as string[]; // Filter out null/undefined if any

  return {
    title: finalTitle,
    contentSnippet: parsedGptAnalysis.summary || `Analysis for ${event.eventName}`,
    fullContentUri: event.detailsPageUrl || undefined,
    analysis: newsItemAnalysis,
    media: [], // No media for calendar events
    newsSource: 'EconomicCalendar',
    originalSourceId: event.originalEventId,
    publishedTimestamp: event.eventTimestamp, // This is the event's future occurrence time
    tags: tagsFromAnalysis.length > 0 ? tagsFromAnalysis : defaultTags,
  };
}

export class CalendarNewsAnalysis extends Disposable implements ICalendarNewsAnalysis {
  private readonly _onProgress = this._register(new Emitter<ServiceEvent>());
  public readonly onProgress: VSEvent<ServiceEvent> = this._onProgress.event;

  constructor(
    @ILogService private readonly _logService: ILogService,
    @ITextToTextService private readonly _textToTextService: ITextToTextService,
    @ILocalAsyncStorage
    private readonly _localStorageService: ILocalAsyncStorage<SidePanelAppStorageSchema>,
  ) {
    super();
    this._logService.trace('[CalendarNewsAnalysis] initialized');
  }

  public async analyzeEvent(
    event: ParsedEconomicEventData,
  ): Promise<Omit<INewsItemModel, 'id' | 'retrievedTimestamp'>> {
    const jobId = `calendar-news-analysis-${event.originalEventId}-${Date.now()}`;
    this._logService.info(
      `[CalendarNewsAnalysis] Job ${jobId}: Starting analysis for event:`,
      event.eventName,
      event.originalEventId,
    );

    let apiKey: string | undefined;
    let currentParsedAnalysis: IParsedAnalysisResult = {};

    try {
      const storedKey = await this._localStorageService.get(StorageKeys.GOOGLE_GEMINI_API_KEY);
      if (typeof storedKey === 'string' && storedKey.trim() !== '') {
        apiKey = storedKey;
      } else {
        this._logService.warn(
          `[CalendarNewsAnalysis] Job ${jobId}: Google Gemini API key missing or empty. Skipping economic analysis.`,
        );
        currentParsedAnalysis = {
          title: `Analysis Skipped: ${event.eventName}`,
          summary:
            'Google Gemini API key not configured. Economic analysis could not be performed.',
          impactScore: event.impactLevel || 1,
          tags: [event.country, event.currency, 'configuration-error', 'api-key-missing'].filter(
            Boolean,
          ) as string[],
          sentiment: 'neutral',
          historicalPrecedents: [],
        };
      }
    } catch (error) {
      this._logService.error(
        `[CalendarNewsAnalysis] Job ${jobId}: Error loading Gemini API key:`,
        error,
      );
      currentParsedAnalysis = {
        title: `Analysis Failed: ${event.eventName}`,
        summary: 'Failed to load Google Gemini API key. Economic analysis could not be performed.',
        impactScore: event.impactLevel || 1,
        tags: [event.country, event.currency, 'configuration-error', 'api-key-error'].filter(
          Boolean,
        ) as string[],
        sentiment: 'neutral',
        historicalPrecedents: [],
      };
    }

    // If API key is available, proceed with actual analysis
    if (apiKey) {
      try {
        let prompt = buildEconomicEventAnalysisPrompt(event);

        const initialGeminiResponse = await createGeminiCompletion(
          prompt,
          apiKey,
          'gemini-2.0-flash',
          {
            enforceSchemaAndJsonOutput: true,
            responseSchema: economicEventAnalysisSchema,
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        );
        currentParsedAnalysis = parseAnalysisJson(initialGeminiResponse.content);

        const initialTitle = currentParsedAnalysis.title || '';
        if (
          currentParsedAnalysis.impactScore &&
          currentParsedAnalysis.impactScore > 1 &&
          !(
            initialTitle.startsWith('Analysis Skipped') ||
            initialTitle === 'No substantive content' ||
            initialTitle.toLowerCase().includes('no economic relevance')
          )
        ) {
          this._logService.info(
            `[CalendarNewsAnalysis] Job ${jobId}: High impact score (${currentParsedAnalysis.impactScore}). Performing enhanced search.`,
          );
          prompt += ECONOMIC_EVENT_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE;
          const enhancedGeminiResponse = await createGeminiCompletion(
            prompt,
            apiKey,
            'gemini-2.0-flash',
            {
              enableGoogleSearch: true,
              enforceSchemaAndJsonOutput: true,
              responseSchema: economicEventAnalysisSchema,
              temperature: 0.3,
              maxOutputTokens: 2048,
            },
          );
          currentParsedAnalysis = parseAnalysisJson(enhancedGeminiResponse.content);
        }

        if (
          !currentParsedAnalysis ||
          typeof currentParsedAnalysis !== 'object' ||
          !currentParsedAnalysis.summary ||
          currentParsedAnalysis.summary.trim() === ''
        ) {
          const errMsg = `Job ${jobId}: No valid summary in parsed analysis.`;
          this._logService.warn(
            `[CalendarNewsAnalysis] ${errMsg} Parsed content:`,
            initialGeminiResponse.content,
          );
          currentParsedAnalysis = {
            title: `Analysis Error: ${event.eventName}`,
            summary: 'Failed to obtain a valid analysis from the AI model.',
            impactScore: event.impactLevel || 1,
            tags: [event.country, event.currency, 'analysis-error'].filter(Boolean) as string[],
            sentiment: 'neutral',
            historicalPrecedents: [],
          };
        }
      } catch (error) {
        this._logService.error(
          `[CalendarNewsAnalysis] Job ${jobId}: Error during Gemini API call or processing for event ${event.originalEventId}:`,
          error,
        );
        currentParsedAnalysis = {
          title: `Analysis Exception: ${event.eventName}`,
          summary: `An exception occurred during analysis: ${error instanceof Error ? error.message : String(error)}`,
          impactScore: event.impactLevel || 1,
          tags: [event.country, event.currency, 'analysis-exception'].filter(Boolean) as string[],
          sentiment: 'neutral',
          historicalPrecedents: [],
        };
      }
    }
    // If API key was missing or loading failed, currentParsedAnalysis is already set
    // to a "skipped" or "failed" state.

    const newsItemData = await mapEventToNewsItemModel(event, currentParsedAnalysis);
    this._logService.info(
      `[CalendarNewsAnalysis] Job ${jobId}: Prepared news data for event ${event.originalEventId}. Title: "${newsItemData.title}"`,
    );
    return newsItemData;
  }
}
