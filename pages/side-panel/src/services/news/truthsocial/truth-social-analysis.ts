import { VSBuffer } from 'vs/base/common/buffer';
import { parseAnalysisJson, IParsedAnalysisResult } from '../../utils/commonUtils';
import {
  ECONOMIC_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE,
  buildEconomicAnalysisPrompt,
  economicAnalysisSchema,
} from './prompt';
import { createGeminiCompletion } from '../../utils/googleGeminiToText';
import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';
import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';
import { ILocalAsyncStorage } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { SidePanelAppStorageSchema, StorageKeys } from '@shared/storage/types/storage.types';
import { MediaTranscriberService } from '@src/services/news/common/MediaTranscriberService';
// Remove the alias import for ITruthSocialAnalysis, it will be defined here.
import { TruthSocialStatus } from './truth-social.types';
import { Event as VSEvent } from 'vs/base/common/event';
import { ServiceEvent } from '@src/side-panel/worker/utils/types';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface MediaTranscriptData {
  mediaIndex: number;
  transcript?: string;
  ocrText?: string;
  longDescription?: string;
  description?: string;
  videoUri?: string;
}

// Define the new interface for the service
export interface ITruthSocialAnalysis extends Disposable {
  readonly onProgress: VSEvent<ServiceEvent>;
  analyzeStatus(status: TruthSocialStatus): Promise<{
    originalStatusId: string;
    analysisText: string;
    mediaTranscripts: MediaTranscriptData[];
    parsedAnalysis: IParsedAnalysisResult;
  }>;
}

// Update the service decorator to use the new interface
export const ITruthSocialAnalysisService = createDecorator<ITruthSocialAnalysis>(
  'truthSocialAnalysisService',
);

// TruthSocialAnalysis class now implements ITruthSocialAnalysis and extends Disposable
export class TruthSocialAnalysis extends Disposable implements ITruthSocialAnalysis {
  public readonly onProgress: VSEvent<ServiceEvent>;

  // Properties to satisfy ITruthSocialAnalysis - will be set in analyzeStatus
  public originalStatusId!: string;
  public analysisText!: string;
  public mediaTranscripts!: MediaTranscriptData[];
  public parsedAnalysis!: IParsedAnalysisResult;

  private readonly _mediaTranscriber: MediaTranscriberService;

  constructor(
    @IAsrService private readonly _asrService: IAsrService,
    @IImageToTextService private readonly _imageToTextService: IImageToTextService,
    @ITextToTextService private readonly _textToTextService: ITextToTextService,
    @ILocalAsyncStorage
    private readonly _localStorageService: ILocalAsyncStorage<SidePanelAppStorageSchema>,
  ) {
    super(); // Call super for Disposable

    // Initialize onProgress by aggregating progress from injected services
    this.onProgress = VSEvent.any(
      this._asrService.onProgress,
      this._imageToTextService.onProgress,
      this._textToTextService.onProgress,
    );

    this._mediaTranscriber = new MediaTranscriberService(
      this._asrService,
      this._imageToTextService,
    );
  }

  /**
   * Main entry point: accepts a TruthSocialStatus, performs media transcription, builds the Gemini prompt,
   * calls Google Gemini, and returns parsed analysis (plus raw JSON and media transcripts).
   */
  public async analyzeStatus(status: TruthSocialStatus): Promise<{
    originalStatusId: string;
    analysisText: string;
    mediaTranscripts: MediaTranscriptData[];
    parsedAnalysis: IParsedAnalysisResult;
  }> {
    const jobId = `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let geminiApiKey: string | undefined;
    let currentParsedAnalysis: IParsedAnalysisResult = {}; // Use a local variable for processing
    const currentMediaTranscripts: MediaTranscriptData[] = []; // Use a local variable for processing
    let mergedMediaContent = '';
    const effectiveStatusContent = status.content ?? ''; // Use const

    // 1) Load Google Gemini API key from storage
    try {
      const storedKey = await this._localStorageService.get(StorageKeys.GOOGLE_GEMINI_API_KEY);
      if (typeof storedKey === 'string' && storedKey.trim() !== '') {
        geminiApiKey = storedKey;
      } else {
        console.warn(
          `[TruthSocialAnalysis] Job ${jobId}: Google Gemini API key missing or empty. Skipping economic analysis.`,
        );
      }
    } catch (error) {
      console.error(`[TruthSocialAnalysis] Job ${jobId}: Error loading Gemini API key:`, error);
    }

    // 2) Media transcription loop
    try {
      const attachments = status.media_attachments ?? [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        if (att.type === 'video') {
          // Attempt to fetch a direct video URI if external_video_id is present
          let videoUri: string | undefined;
          if (att.external_video_id) {
            try {
              const resp = await fetch(
                `https://truthsocial.com/api/v1/truth/videos/${att.external_video_id}`,
              );
              if (resp.ok) {
                const meta = await resp.json();
                const assetUrl = meta.video?.assets?.video?.[0]?.url;
                videoUri = typeof assetUrl === 'string' ? assetUrl : undefined;
              }
            } catch (e) {
              console.error(
                `[TruthSocialAnalysis] Could not fetch video metadata for external_video_id ${att.external_video_id}`,
                e,
              );
            }
          }
          // Fallback to `url` or `remote_url`
          videoUri =
            videoUri ??
            att.url ??
            (typeof att.remote_url === 'string' ? att.remote_url : undefined);

          if (!videoUri) {
            currentMediaTranscripts.push({ mediaIndex: i });
            continue;
          }
          const attForTranscription = { ...att, url: videoUri, remote_url: null };
          const transcript = await this._mediaTranscriber.transcribeMediaAttachment(
            attForTranscription,
            jobId,
            120, // seconds
          );
          currentMediaTranscripts.push({ mediaIndex: i, transcript, videoUri });
          if (transcript) {
            mergedMediaContent += `\n[Media ${i + 1} - Video]: ${transcript}`;
          }
        } else if (att.type === 'image') {
          if (att.url) {
            try {
              const resp = await fetch(att.url);
              const arrayBuffer = await resp.arrayBuffer();
              const buffer = new Uint8Array(arrayBuffer);
              const vsBuffer = VSBuffer.wrap(buffer);
              const { ocrText, moreDetailedCaption, caption } =
                await this._imageToTextService.textFromBuffer(vsBuffer);
              currentMediaTranscripts.push({
                mediaIndex: i,
                ocrText,
                longDescription: moreDetailedCaption,
                description: caption,
              });
              const combined = [ocrText, moreDetailedCaption].filter(Boolean).join(' ');
              if (combined) {
                mergedMediaContent += `\n[Media ${i + 1} - Image]: ${combined}`;
              }
            } catch (error) {
              console.error(
                `[TruthSocialAnalysis] Error processing image ${att.url} for job ${jobId}:`,
                error,
              );
              currentMediaTranscripts.push({ mediaIndex: i });
            }
          } else {
            currentMediaTranscripts.push({ mediaIndex: i });
          }
        } else {
          currentMediaTranscripts.push({ mediaIndex: i });
        }
      }

      // 3) Build prompt (including merged media content if any)
      const tempForPrompt = { ...status, content: effectiveStatusContent };
      const prompt = buildEconomicAnalysisPrompt(tempForPrompt, mergedMediaContent || undefined);

      // 4) If no API key, return a minimal "skipped" analysis
      if (!geminiApiKey) {
        currentParsedAnalysis = {
          title: 'Analysis Skipped',
          summary:
            'Google Gemini API key not configured or failed to load. Economic analysis could not be performed.',
          impactScore: 1,
          tags: ['configuration-error', 'api-key-missing'],
          sentiment: 'neutral',
          historicalPrecedents: [],
        };
      } else {
        // 5) Perform initial Gemini call
        const apiKey = geminiApiKey;
        const initialGeminiResponse = await createGeminiCompletion(
          prompt,
          apiKey,
          'gemini-2.0-flash', // Model name from original file
          {
            enforceSchemaAndJsonOutput: true,
            responseSchema: economicAnalysisSchema,
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        );
        currentParsedAnalysis = parseAnalysisJson(initialGeminiResponse.content);

        // 6) If impactScore > 1 AND not a generic "no content" title, do enhanced search+analysis
        if (
          currentParsedAnalysis.impactScore &&
          currentParsedAnalysis.impactScore > 1 &&
          !(
            currentParsedAnalysis.title === 'Link content unavailable or non-economic' ||
            currentParsedAnalysis.title === 'No substantive content'
          )
        ) {
          const enhancedGeminiResponse = await createGeminiCompletion(
            prompt + ECONOMIC_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE,
            apiKey,
            'gemini-2.0-flash', // Model name from original file
            {
              enableGoogleSearch: true,
              enforceSchemaAndJsonOutput: true,
              responseSchema: economicAnalysisSchema,
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          );
          currentParsedAnalysis = parseAnalysisJson(enhancedGeminiResponse.content);
        }
      }

      // 7) Validate that we have at least a summary; otherwise throw to trigger a retry
      if (
        !currentParsedAnalysis ||
        typeof currentParsedAnalysis !== 'object' ||
        !currentParsedAnalysis.summary ||
        currentParsedAnalysis.summary.trim() === ''
      ) {
        const errMsg = `Job ${jobId}: No valid summary in parsed analysis.`;
        console.warn(`[TruthSocialAnalysis] ${errMsg} Parsed analysis:`, currentParsedAnalysis);
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error(`[TruthSocialAnalysis] Error analyzing status for job ${jobId}:`, err);
      throw err;
    }

    // 8) Assign to class members and return
    this.originalStatusId = status.id;
    this.analysisText = JSON.stringify(currentParsedAnalysis);
    this.mediaTranscripts = currentMediaTranscripts;
    this.parsedAnalysis = currentParsedAnalysis;

    return {
      originalStatusId: this.originalStatusId,
      analysisText: this.analysisText,
      mediaTranscripts: this.mediaTranscripts,
      parsedAnalysis: this.parsedAnalysis,
    };
  }
}
