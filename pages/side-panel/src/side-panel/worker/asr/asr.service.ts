/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event as VsEvent } from 'vs/base/common/event';
import { ServiceEventType, ServiceEvent, IServiceWithProgressEvents } from '../utils/types';

interface Chunk {
  // Add properties if you need them, or leave empty for now
}

interface AutomaticSpeechRecognitionOutput {
  text: string;
  chunks?: Chunk[];
}

export const IASR_SERVICE_ID = 'asrService';
export const IAsrService = createDecorator<IAsrService>(IASR_SERVICE_ID);

export interface IAsrService extends IServiceWithProgressEvents {
  readonly _serviceBrand: undefined;
  textFromBuffer(pcmData: VSBuffer): Promise<string>;
}

export class AsrService implements IAsrService {
  public readonly _serviceBrand: undefined;
  public readonly onProgress: VsEvent<ServiceEvent>;
  private static _transcriber: Promise<AutomaticSpeechRecognitionPipeline>;
  private static readonly _supports_fp16: boolean = false;
  private static _queue: Promise<string> = Promise.resolve('');
  private static readonly _COMPONENT = 'AsrService';
  private readonly _emitter: Emitter<ServiceEvent>;

  public constructor() {
    this._emitter = new Emitter<ServiceEvent>();
    this.onProgress = this._emitter.event;
    if (env.backends.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = '';
    }
    if (!AsrService._transcriber) {
      this._emitter.fire({
        type: ServiceEventType.LOADING,
        data: {
          component: AsrService._COMPONENT,
          phase: 'initialization_start',
          message: 'Initializing ASR model',
        },
      });
      // @ts-ignore
      AsrService._transcriber = pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-base',
        {
          // @ts-ignore
          dtype: {
            embed_tokens: AsrService._supports_fp16 ? 'fp16' : 'fp32',
            encoder_model: 'q4',
            decoder_model_merged: 'q4',
          },
          device: 'webgpu',
          progress_callback: (progress: unknown) => {
            this._emitter.fire({
              type: ServiceEventType.LOADING,
              data: {
                component: AsrService._COMPONENT,
                phase: 'initialization_progress',
                progress,
                message: 'Model loading progress',
              },
            });
          },
        },
      ) as Promise<AutomaticSpeechRecognitionPipeline>;
      AsrService._transcriber
        .then(() => {
          this._emitter.fire({
            type: ServiceEventType.LOADING,
            data: {
              component: AsrService._COMPONENT,
              phase: 'initialization_complete',
              message: 'ASR model ready',
            },
          });
          this._emitter.fire({
            type: ServiceEventType.READY,
            data: { component: AsrService._COMPONENT },
          });
        })
        .catch((err: unknown) => {
          this._emitter.fire({
            type: ServiceEventType.ERROR,
            data: {
              component: AsrService._COMPONENT,
              error: String(err),
              stage: 'model_loading',
              rawError: err,
            },
          });
        });
    }
  }

  public textFromBuffer(data: VSBuffer): Promise<string> {
    const jobId = `asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    this._emitter.fire({
      type: ServiceEventType.PROCESSING_START,
      data: {
        component: AsrService._COMPONENT,
        jobId,
        inputDetails: { bufferLength: data.byteLength },
      },
    });
    const job = async (): Promise<string> => {
      try {
        const pcmData = new Float32Array(
          data.buffer.buffer,
          data.buffer.byteOffset,
          data.buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
        );
        const transcriber = await AsrService._transcriber;
        const result = (await transcriber(pcmData, {
          chunk_length_s: 30,
          stride_length_s: 5,
          language: 'en',
        })) as AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[];
        const text = Array.isArray(result)
          ? result
              .map(r => r.text)
              .join(' ')
              .trim()
          : result.text.trim();
        const durationMs = Date.now() - startTime;
        this._emitter.fire({
          type: ServiceEventType.PROCESSING_COMPLETE,
          data: { component: AsrService._COMPONENT, jobId, output: text, durationMs },
        });
        return text;
      } catch (err: unknown) {
        this._emitter.fire({
          type: ServiceEventType.ERROR,
          data: {
            component: AsrService._COMPONENT,
            jobId,
            error: String(err),
            stage: 'job_execution',
            rawError: err,
          },
        });
        throw err;
      }
    };
    const next = AsrService._queue
      .then(() => job())
      .catch(err => {
        // error already emitted
        throw err;
      });
    AsrService._queue = next.catch(() => '');
    return next;
  }
}
