import { Event as VsEvent } from 'vs/base/common/event';

export enum ServiceEventType {
  LOADING = 'loading',
  READY = 'ready',
  PROCESSING_START = 'processing_start',
  PROCESSING_STAGE_UPDATE = 'processing_stage_update',
  PROCESSING_COMPLETE = 'processing_complete',
  ERROR = 'error',
}

export type LoadingPhase =
  | 'initialization_start'
  | 'initialization_progress'
  | 'initialization_complete'
  | 'streaming_output'
  | 'intermediate_output';

export interface ServiceEventLoading {
  readonly type: ServiceEventType.LOADING;
  readonly data: {
    readonly component: string;
    readonly phase: LoadingPhase;
    readonly progress?: unknown;
    readonly message?: string;
    /**
     * Generic partial/intermediate output for streaming or stepwise models.
     * Can contain keys like 'thinking', 'draft', 'reasoning', etc.
     */
    readonly partial?: Record<string, unknown>;
  };
}

export interface ServiceEventReady {
  readonly type: ServiceEventType.READY;
  readonly data: {
    readonly component: string;
  };
}

export interface ServiceEventProcessingStart {
  readonly type: ServiceEventType.PROCESSING_START;
  readonly data: {
    readonly component: string;
    readonly jobId?: string;
    readonly inputDetails?: Record<string, unknown>;
  };
}

export interface ServiceEventProcessingStageUpdate {
  readonly type: ServiceEventType.PROCESSING_STAGE_UPDATE;
  readonly data: {
    readonly component: string;
    readonly jobId?: string;
    readonly stage: string;
    readonly message?: string;
    readonly progress?: number;
  };
}

export interface ServiceEventProcessingComplete<TOutput = unknown> {
  readonly type: ServiceEventType.PROCESSING_COMPLETE;
  readonly data: {
    readonly component: string;
    readonly jobId?: string;
    readonly output: TOutput;
    readonly durationMs?: number;
  };
}

export interface ServiceEventError {
  readonly type: ServiceEventType.ERROR;
  readonly data: {
    readonly component: string;
    readonly jobId?: string;
    readonly error: string;
    readonly stage?: string;
    readonly rawError?: unknown;
  };
}

export type ServiceEvent =
  | ServiceEventLoading
  | ServiceEventReady
  | ServiceEventProcessingStart
  | ServiceEventProcessingStageUpdate
  | ServiceEventProcessingComplete
  | ServiceEventError;

export interface IServiceWithProgressEvents {
  readonly onProgress: VsEvent<ServiceEvent>;
}
