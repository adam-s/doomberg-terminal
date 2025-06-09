/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { VSBuffer } from 'vs/base/common/buffer';
import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  env,
  Tensor,
  ModelOutput,
} from '@huggingface/transformers';
import { Emitter, Event as VSCodeEvent } from 'vs/base/common/event';
import { ServiceEventType, ServiceEvent, IServiceWithProgressEvents } from '../utils/types';

// Define the shape of the progress object passed to the callback
interface ProgressInfo {
  status: string;
  file: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

// Type extensions for HuggingFace transformers methods
interface ExtendedAutoProcessor extends AutoProcessor {
  (image: RawImage): Promise<Record<string, unknown>>; // More specific return type
  construct_prompts(task: string): unknown; // Keep as unknown if structure varies
  post_process_generation(
    text: string, // This is typically decoded IDs, not raw text
    task: string,
    imageSize: { width: number; height: number },
  ): Record<string, unknown>; // More specific return type
}

interface ExtendedAutoTokenizer extends AutoTokenizer {
  (
    prompts: unknown,
    options: { return_attention_mask: boolean; padding: boolean; truncation: boolean },
  ): Record<string, unknown>; // More specific return type
  batch_decode(ids: ModelOutput | Tensor, decode_args: Record<string, unknown>): string[];
}

export const IMAGE_TO_TEXT_SERVICE_ID = 'imageToTextService';
export const IImageToTextService = createDecorator<IImageToTextService>(IMAGE_TO_TEXT_SERVICE_ID);

export interface IImageToTextService extends IServiceWithProgressEvents {
  // Extend with progress events
  readonly _serviceBrand: undefined;
  textFromBuffer(
    buffer: VSBuffer,
  ): Promise<{ ocrText: string; moreDetailedCaption: string; caption: string }>;
}

// -----------------------------------------------------------------------------
// Singleton loader for the Florence-2 model
// -----------------------------------------------------------------------------
class Florence2Model {
  private static readonly MODEL_ID = 'onnx-community/Florence-2-large-ft';
  private static readonly COMPONENT_NAME = 'Florence2Model';
  private static instance: Promise<{
    model: Florence2ForConditionalGeneration;
    tokenizer: ExtendedAutoTokenizer;
    processor: ExtendedAutoProcessor;
  }> | null = null;
  private static _isModelLoading: boolean = false;
  private static _modelReady: boolean = false;

  public static async getInstance(eventEmitter?: Emitter<ServiceEvent>): Promise<{
    // Pass emitter for progress
    model: Florence2ForConditionalGeneration;
    tokenizer: ExtendedAutoTokenizer;
    processor: ExtendedAutoProcessor;
  }> {
    if (Florence2Model._modelReady && Florence2Model.instance) {
      return Florence2Model.instance;
    }
    if (Florence2Model._isModelLoading && Florence2Model.instance) {
      return Florence2Model.instance; // Wait for existing loading process
    }

    Florence2Model._isModelLoading = true;
    eventEmitter?.fire({
      type: ServiceEventType.LOADING,
      data: {
        component: Florence2Model.COMPONENT_NAME,
        phase: 'initialization_start',
        message: `Initializing ${Florence2Model.MODEL_ID}`,
      },
    });

    if (env.backends.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = '';
    }

    const progressCallback = (progress: ProgressInfo) => {
      // Parameter is ProgressInfo
      eventEmitter?.fire({
        type: ServiceEventType.LOADING,
        data: {
          component: Florence2Model.COMPONENT_NAME,
          phase: 'initialization_progress',
          progress: progress, // Pass the whole progress object
          message: `Loading ${progress.file || Florence2Model.MODEL_ID}: ${progress.status}`,
        },
      });
    };

    Florence2Model.instance = (async () => {
      try {
        const processor = (await AutoProcessor.from_pretrained(this.MODEL_ID, {
          progress_callback: progressCallback as (info: unknown) => void, // Cast for compatibility if needed
        })) as unknown as ExtendedAutoProcessor;
        const tokenizer = (await AutoTokenizer.from_pretrained(this.MODEL_ID, {
          progress_callback: progressCallback as (info: unknown) => void,
        })) as unknown as ExtendedAutoTokenizer;
        const model = (await Florence2ForConditionalGeneration.from_pretrained(this.MODEL_ID, {
          device: 'webgpu',
          dtype: {
            embed_tokens: 'fp16',
            vision_encoder: 'fp16',
            encoder_model: 'q4',
            decoder_model_merged: 'q4',
          },
          progress_callback: progressCallback as (info: unknown) => void,
        })) as Florence2ForConditionalGeneration;

        Florence2Model._modelReady = true;
        Florence2Model._isModelLoading = false;
        eventEmitter?.fire({
          type: ServiceEventType.LOADING,
          data: {
            component: Florence2Model.COMPONENT_NAME,
            phase: 'initialization_complete',
            message: `${Florence2Model.MODEL_ID} initialized.`,
          },
        });
        eventEmitter?.fire({
          type: ServiceEventType.READY,
          data: { component: Florence2Model.COMPONENT_NAME },
        });
        return { model, tokenizer, processor };
      } catch (error: unknown) {
        Florence2Model._isModelLoading = false;
        Florence2Model.instance = null; // Reset on failure
        const errorMessage = error instanceof Error ? error.message : String(error);
        eventEmitter?.fire({
          type: ServiceEventType.ERROR,
          data: {
            component: Florence2Model.COMPONENT_NAME,
            error: `Model initialization failed: ${errorMessage}`,
            stage: 'model_loading',
            rawError: error,
          },
        });
        console.error(`[${Florence2Model.COMPONENT_NAME}] Model loading failed:`, error);
        throw error; // Re-throw
      }
    })();
    return Florence2Model.instance;
  }
}

// Define task constants based on the Florence-2 model's expected tokens
const TASK_OCR = '<OCR>';
const TASK_MORE_DETAILED_CAPTION = '<MORE_DETAILED_CAPTION>';
const TASK_CAPTION = '<CAPTION>';

export class ImageToTextService implements IImageToTextService {
  public readonly _serviceBrand: undefined;
  private static readonly _COMPONENT_NAME = 'ImageToTextService';

  private readonly _onProgress = new Emitter<ServiceEvent>();
  public readonly onProgress: VSCodeEvent<ServiceEvent> = this._onProgress.event;

  private static _queue: Promise<{
    ocrText: string;
    moreDetailedCaption: string;
    caption: string;
  }> = Promise.resolve({
    ocrText: '',
    moreDetailedCaption: '',
    caption: '',
  });

  constructor() {
    // Preload model in background, passing the service's emitter
    Florence2Model.getInstance(this._onProgress).catch((err: unknown) => {
      // Error is already emitted by Florence2Model.getInstance, console log is fine here
      // Or emit a service-level error if Florence2Model is critical for the service to even exist
      const errorMessage = err instanceof Error ? err.message : String(err);
      this._onProgress.fire({
        type: ServiceEventType.ERROR,
        data: {
          component: ImageToTextService._COMPONENT_NAME,
          error: `Critical model preloading failed: ${errorMessage}`,
          stage: 'initialization',
          rawError: err,
        },
      });
    });
  }

  private _emitEvent(event: ServiceEvent): void {
    this._onProgress.fire(event);
  }

  public async textFromBuffer(
    buffer: VSBuffer,
  ): Promise<{ ocrText: string; moreDetailedCaption: string; caption: string }> {
    const jobId = `img2txt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();

    this._emitEvent({
      type: ServiceEventType.PROCESSING_START,
      data: {
        component: ImageToTextService._COMPONENT_NAME,
        jobId,
        inputDetails: { bufferLength: buffer.byteLength },
      },
    });

    const job = async (): Promise<{
      ocrText: string;
      moreDetailedCaption: string;
      caption: string;
    }> => {
      try {
        if (buffer.byteLength === 0) {
          const errorMsg = 'Error: Empty image buffer received.';
          this._emitEvent({
            type: ServiceEventType.ERROR,
            data: {
              component: ImageToTextService._COMPONENT_NAME,
              jobId,
              error: errorMsg,
              stage: 'input_validation',
            },
          });
          return { ocrText: errorMsg, moreDetailedCaption: '', caption: '' };
        }

        const { model, tokenizer, processor } = await Florence2Model.getInstance(this._onProgress);

        this._emitEvent({
          type: ServiceEventType.PROCESSING_STAGE_UPDATE,
          data: {
            component: ImageToTextService._COMPONENT_NAME,
            jobId,
            stage: 'image_preprocessing',
            message: 'Preparing image...',
          },
        });
        const bytes = new Uint8Array(buffer.buffer);
        const blob = new Blob([bytes]);
        const image = await RawImage.fromBlob(blob);
        const imageSize = { width: image.width, height: image.height };
        const visionInputs = await processor(image);

        const generateTextForTask = async (
          taskName: string,
          taskConstant: string,
          maxNewTokens: number,
          numBeams: number,
        ): Promise<string> => {
          this._emitEvent({
            type: ServiceEventType.PROCESSING_STAGE_UPDATE,
            data: {
              component: ImageToTextService._COMPONENT_NAME,
              jobId,
              stage: taskName,
              message: `Generating ${taskName}...`,
            },
          });
          const prompt = processor.construct_prompts(taskConstant);
          const inputs = tokenizer(prompt, {
            return_attention_mask: false,
            padding: true,
            truncation: true,
          });

          // @ts-ignore - Known issue with transformers.js type definitions for generate
          const ids = await model.generate({
            ...visionInputs,
            ...inputs,
            max_new_tokens: maxNewTokens,
            num_beams: numBeams,
            do_sample: false,
          } as Record<string, unknown>);

          const [rawDecoded] = tokenizer.batch_decode(ids, { skip_special_tokens: false });
          const resultRaw = processor.post_process_generation(rawDecoded, taskConstant, imageSize);
          return (((resultRaw as Record<string, unknown>)?.[taskConstant] as string) || '').trim();
        };

        const ocrText = await generateTextForTask('ocr', TASK_OCR, 1024, 3);
        const moreDetailedCaption = await generateTextForTask(
          'more_detailed_caption',
          TASK_MORE_DETAILED_CAPTION,
          1024,
          5,
        );
        const caption = await generateTextForTask('caption', TASK_CAPTION, 1024, 3);

        const durationMs = Date.now() - startTime;
        this._emitEvent({
          type: ServiceEventType.PROCESSING_COMPLETE,
          data: {
            component: ImageToTextService._COMPONENT_NAME,
            jobId,
            output: { ocrText, moreDetailedCaption, caption },
            durationMs,
          },
        });
        return { ocrText, moreDetailedCaption, caption };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this._emitEvent({
          type: ServiceEventType.ERROR,
          data: {
            component: ImageToTextService._COMPONENT_NAME,
            jobId,
            error: `Image to text processing error: ${errorMessage}`,
            stage: 'job_execution',
            rawError: error,
          },
        });
        console.error(`[${ImageToTextService._COMPONENT_NAME}] job error:`, error);
        throw error;
      }
    };

    const next = ImageToTextService._queue
      .then(() => job())
      .catch(err => {
        throw err;
      });

    ImageToTextService._queue = next.catch(() => ({
      ocrText: '',
      moreDetailedCaption: '',
      caption: '',
    }));
    return next;
  }
}
