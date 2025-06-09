import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAsrService } from '@src/side-panel/worker/asr/asr.service';
import { IImageToTextService } from '@src/side-panel/worker/imageToText/imageToText.service';
import { Event as VSEvent, Emitter } from 'vs/base/common/event';
import { IServiceWithProgressEvents, ServiceEvent } from '@src/side-panel/worker/utils/types';
import { TruthSocialMediaAttachment } from '../truthsocial/truth-social.types';
import { audioToText } from '../../utils/audioToText';
import { imageToText } from '../../utils/imageToText';
import { resizeImage } from '../../utils/resizeImage';

export interface IMediaTranscriberService extends IServiceWithProgressEvents {
  readonly _serviceBrand: undefined;
  transcribeMediaAttachment(
    attachment: TruthSocialMediaAttachment,
    jobId?: string,
    maxDurationInSeconds?: number, // Add optional parameter here
  ): Promise<string | undefined>;
}

export const IMediaTranscriberService =
  createDecorator<IMediaTranscriberService>('mediaTranscriberService');

export class MediaTranscriberService extends Disposable implements IMediaTranscriberService {
  declare readonly _serviceBrand: undefined;

  private readonly _onProgress = this._register(new Emitter<ServiceEvent>());
  public readonly onProgress: VSEvent<ServiceEvent> = this._onProgress.event;

  constructor(
    @IAsrService private readonly _asrService: IAsrService,
    @IImageToTextService private readonly _imageToTextService: IImageToTextService,
  ) {
    super();
    this._register(this._asrService.onProgress(e => this._onProgress.fire(e)));
    this._register(this._imageToTextService.onProgress(e => this._onProgress.fire(e)));
  }

  private static readonly MAX_IMAGE_DIMENSION = 512;

  public async transcribeMediaAttachment(
    attachment: TruthSocialMediaAttachment,
    jobId: string = 'transcription-job',
    maxDurationInSeconds?: number, // Add optional parameter here
  ): Promise<string | undefined> {
    if (attachment.type === 'video') {
      console.log(`[MediaTranscriberService] Processing video for job ${jobId}`);
      let videoUrl = attachment.url;
      if (!videoUrl && attachment.external_video_id) {
        try {
          const videoMetadataResponse = await fetch(
            `https://truthsocial.com/api/v1/truth/videos/${attachment.external_video_id}`,
          );
          if (!videoMetadataResponse.ok) {
            console.error(
              `[MediaTranscriberService] Failed to fetch video metadata for ${attachment.external_video_id}: ${videoMetadataResponse.status}`,
            );
            return undefined;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videoMetadata: any = await videoMetadataResponse.json();
          videoUrl = videoMetadata?.video?.assets?.video?.[0]?.url;
        } catch (error) {
          console.error(
            `[MediaTranscriberService] Error fetching video metadata for ${attachment.external_video_id}:`,
            error,
          );
          return undefined;
        }
      }
      if (!videoUrl) {
        console.warn(`[MediaTranscriberService] No video URL found for attachment in job ${jobId}`);
        return undefined;
      }
      try {
        // Pass maxDurationInSeconds to audioToText
        const transcript = await audioToText(videoUrl, this._asrService, maxDurationInSeconds);
        console.log(`[MediaTranscriberService] Transcript obtained for job ${jobId}`);
        return transcript;
      } catch (error) {
        console.error(
          `[MediaTranscriberService] Error transcribing video for job ${jobId}:`,
          error,
        );
        return undefined;
      }
    } else if (attachment.type === 'image') {
      console.log(`[MediaTranscriberService] Processing image for job ${jobId}`);
      if (!attachment.url) {
        console.warn(`[MediaTranscriberService] No image URL found for attachment in job ${jobId}`);
        return undefined;
      }
      try {
        const resizedImageDataUrl = await resizeImage(
          attachment.url,
          MediaTranscriberService.MAX_IMAGE_DIMENSION,
        );
        const imageDescription = await imageToText(resizedImageDataUrl, this._imageToTextService);
        console.log(`[MediaTranscriberService] Image text analysis obtained for job ${jobId}`);
        return imageDescription;
      } catch (error) {
        console.error(`[MediaTranscriberService] Error analyzing image for job ${jobId}:`, error);
        return undefined;
      }
    }
    console.log(
      `[MediaTranscriberService] Attachment type ${attachment.type} not supported for transcription in job ${jobId}.`,
    );
    return undefined;
  }
}
