/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  PreTrainedTokenizer,
  PreTrainedModel,
  env,
  type ProgressCallback,
  type Tensor, // Added Tensor type import
  StoppingCriteriaList, // Added import
} from '@huggingface/transformers';
import { Emitter, Event as VsEvent } from 'vs/base/common/event';
import {
  ServiceEventType,
  ServiceEvent,
  IServiceWithProgressEvents,
  LoadingPhase,
} from '../utils/types'; // Added LoadingPhase

export const TEXT_TO_TEXT_SERVICE_ID = 'textToTextService';
export const ITextToTextService = createDecorator<ITextToTextService>(TEXT_TO_TEXT_SERVICE_ID);

export interface ITextToTextService extends IServiceWithProgressEvents {
  readonly _serviceBrand: undefined;
  generateText(
    prompt: string,
    options?: { max_new_tokens?: number; streaming?: boolean },
  ): Promise<string>;
  interruptGeneration(): void;
}

interface ChatMessage {
  role: 'user' | 'system'; // Simplified roles if system prompt is fixed or minimal
  content: string;
}

// Removed ModelGenerationInputs interface

// Adjusted to be more generic, as the exact structure might vary or include more than defined.
// This avoids overly strict typing if the library returns additional, unexpected fields.
interface ChatTemplateOutput extends Record<string, unknown> {
  input_ids: Tensor;
  attention_mask: Tensor;
}

if (env.backends.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = ''; // Adjust path if wasm files are hosted elsewhere
}

class HFTextPipeline {
  private static tokenizer: PreTrainedTokenizer | null = null;
  private static model: PreTrainedModel | null = null;
  private static readonly MODEL_ID = 'onnx-community/Phi-3.5-mini-instruct-onnx-web'; // Example model
  private static isInitializing = false;
  private static initializationPromise: Promise<{
    tokenizer: PreTrainedTokenizer;
    model: PreTrainedModel;
  }> | null = null;

  public static getInstance(
    progressCallback?: ProgressCallback,
  ): Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> {
    if (this.tokenizer && this.model) {
      return Promise.resolve({ tokenizer: this.tokenizer, model: this.model });
    }

    if (this.isInitializing && this.initializationPromise) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    this.initializationPromise = (async () => {
      try {
        this.tokenizer = await AutoTokenizer.from_pretrained(this.MODEL_ID, {
          progress_callback: progressCallback,
        });
        this.model = await AutoModelForCausalLM.from_pretrained(this.MODEL_ID, {
          dtype: 'q4', // Example quantization, adjust as needed
          device: 'webgpu', // or 'wasm'
          use_external_data_format: true, // Use external data format for large models
          progress_callback: progressCallback,
        });

        if (!this.tokenizer || !this.model) {
          throw new Error('Failed to initialize Hugging Face tokenizer or model');
        }
        return { tokenizer: this.tokenizer, model: this.model };
      } catch (error) {
        this.tokenizer = null;
        this.model = null;
        this.initializationPromise = null; // Reset promise on failure
        throw error;
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initializationPromise;
  }
}

export class TextToTextService implements ITextToTextService {
  // Static fields
  private static readonly STATIC_SYSTEM_PROMPT =
    'You are a helpful AI assistant. Provide concise and accurate responses.'; // Optional: define a system prompt

  // Instance fields (public)
  public readonly _serviceBrand: undefined;
  public readonly onProgress: VsEvent<ServiceEvent>;

  // Instance fields (private)
  private readonly _emitter = new Emitter<ServiceEvent>();
  private _stoppingCriteria = new InterruptableStoppingCriteria();

  public constructor() {
    this.onProgress = this._emitter.event;
    // Constructor logic, if any
  }

  public async generateText(
    prompt: string,
    options: { max_new_tokens?: number; streaming?: boolean } = {},
  ): Promise<string> {
    const jobId = `${TEXT_TO_TEXT_SERVICE_ID}-${Date.now()}`;
    this._stoppingCriteria = new InterruptableStoppingCriteria(); // Reset for new generation
    const stoppingCriteriaList = new StoppingCriteriaList();
    stoppingCriteriaList.push(this._stoppingCriteria);

    const currentMaxNewTokens = 256;

    this._emitter.fire({
      type: ServiceEventType.PROCESSING_START,
      data: {
        component: TEXT_TO_TEXT_SERVICE_ID,
        jobId,
        inputDetails: { promptLength: prompt.length, options },
      },
    });

    try {
      const { tokenizer, model } = await HFTextPipeline.getInstance((progressInfo: unknown) => {
        const progress =
          typeof progressInfo === 'object' && progressInfo !== null && 'progress' in progressInfo
            ? (progressInfo as { progress?: number }).progress
            : undefined;
        this._emitter.fire({
          type: ServiceEventType.LOADING,
          data: {
            component: TEXT_TO_TEXT_SERVICE_ID,
            phase: 'PROCESSING' as LoadingPhase, // Use string literal and cast to LoadingPhase
            progress,
          },
        });
      });

      if (
        typeof tokenizer.pad_token_id === 'undefined' &&
        tokenizer.eos_token_id !== null &&
        typeof tokenizer.eos_token_id !== 'undefined'
      ) {
        tokenizer.pad_token_id = tokenizer.eos_token_id;
      } else if (
        typeof tokenizer.pad_token_id === 'undefined' &&
        (tokenizer.eos_token_id === null || typeof tokenizer.eos_token_id === 'undefined')
      ) {
        // Fallback if eos_token_id is also null, though unlikely for most models
        console.warn(
          `[${TEXT_TO_TEXT_SERVICE_ID}] Tokenizer does not have an EOS token, and pad_token_id is not set. Padding may not work as expected.`,
        );
        // tokenizer.pad_token_id = 0; // Or some other default, if appropriate for the model
      }

      const messages: ChatMessage[] = [];
      if (TextToTextService.STATIC_SYSTEM_PROMPT) {
        messages.push({ role: 'system', content: TextToTextService.STATIC_SYSTEM_PROMPT });
      }
      messages.push({ role: 'user', content: prompt });

      // Get the output from apply_chat_template, initially as unknown
      const templateResult: unknown = (
        tokenizer as PreTrainedTokenizer & {
          apply_chat_template: (
            messages: ChatMessage[],
            options: { add_generation_prompt: boolean; return_dict: boolean },
          ) => unknown; // Keep broad if lib types are complex, will cast later
        }
      ).apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true, // Ensures tensor outputs
      });

      // Perform runtime checks to ensure templateResult is a valid ChatTemplateOutput object
      if (
        typeof templateResult !== 'object' ||
        templateResult === null ||
        !('input_ids' in templateResult) || // Check for property existence
        !('attention_mask' in templateResult) || // Check for property existence
        typeof (templateResult as { input_ids: unknown }).input_ids !== 'object' || // Check if input_ids is an object (Tensor)
        typeof (templateResult as { attention_mask: unknown }).attention_mask !== 'object' // Check if attention_mask is an object (Tensor)
      ) {
        throw new Error(
          'Invalid output from apply_chat_template: input_ids or attention_mask missing or not valid Tensors.',
        );
      }

      // Now that checks have passed, cast to the specific ChatTemplateOutput interface
      const rawInputs = templateResult as ChatTemplateOutput;

      let finalText: string;

      if (options.streaming === false) {
        // Explicitly check for false for non-streaming
        // Non-streaming “batch” mode:
        const generationParams = {
          ...rawInputs, // Spread input_ids and attention_mask
          max_new_tokens: currentMaxNewTokens,
          stopping_criteria: stoppingCriteriaList,
        };
        // @ts-ignore
        const result = await model.generate(generationParams);
        // generate returns a `GenerateOutput` with `.sequences`
        // decode the first (and only) sequence into a single string:
        let decoded: string = '';
        if (
          result &&
          Array.isArray((result as { sequences?: unknown[] }).sequences) &&
          (result as { sequences: unknown[] }).sequences.length > 0
        ) {
          const sequence = (result as { sequences: unknown[] }).sequences[0];
          if (Array.isArray(sequence)) {
            decoded = tokenizer.decode(sequence as number[], {
              skip_special_tokens: true,
            });
          }
        }
        finalText = decoded;

        // Emit only once, with the final text
        this._emitter.fire({
          type: ServiceEventType.PROCESSING_COMPLETE,
          data: { component: TEXT_TO_TEXT_SERVICE_ID, jobId, output: finalText },
        });
        return finalText; // Return the raw text
      } else {
        // Streaming mode (existing logic)
        const outputBuffer: string[] = [];
        const streamer = new TextStreamer(tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true, // Clean the output from special tokens
          callback_function: (token: string) => {
            console.log(`[${TEXT_TO_TEXT_SERVICE_ID}] Streaming token:`, token);
            outputBuffer.push(token);
          },
        });

        const generationParamsStreaming = {
          ...rawInputs, // Spread input_ids and attention_mask
          max_new_tokens: currentMaxNewTokens,
          stopping_criteria: stoppingCriteriaList,
          streamer: streamer,
        };
        // @ts-ignore
        await model.generate(generationParamsStreaming);

        finalText = outputBuffer.join('');
        this._emitter.fire({
          type: ServiceEventType.PROCESSING_COMPLETE,
          data: {
            component: TEXT_TO_TEXT_SERVICE_ID,
            jobId,
            output: finalText,
          },
        });
        return finalText;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Ensure jobId is included in the error event if not already handled by specific error blocks
      const errorData: { component: string; jobId?: string; error: string; stage: string } = {
        component: TEXT_TO_TEXT_SERVICE_ID,
        error: errorMessage,
        stage: 'generation',
      };
      if (jobId) {
        errorData.jobId = jobId;
      }

      this._emitter.fire({
        type: ServiceEventType.ERROR,
        data: errorData,
      });
      console.error(`[${TEXT_TO_TEXT_SERVICE_ID}] Error in generateText:`, errorMessage);
      throw error; // Re-throw to allow caller to handle
    }
  }

  public interruptGeneration(): void {
    this._stoppingCriteria.interrupt();
    this._emitter.fire({
      type: ServiceEventType.LOADING, // Or a more specific INTERRUPTED event type
      data: {
        component: TEXT_TO_TEXT_SERVICE_ID,
        phase: 'PROCESSING' as LoadingPhase, // Use string literal and cast to LoadingPhase
        message: 'Text generation interrupted by user.',
      },
    });
  }
}
