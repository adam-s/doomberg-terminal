import { Emitter, Event } from 'vs/base/common/event';

export interface Job<T> {
  id: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  lastError?: Error;
  lastAttemptTime?: number;
  nextRetryTime?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface JobQueueOptions {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

export class JobQueue<T> {
  private readonly _jobs: Map<string, Job<T>> = new Map();
  private _processing: boolean = false;
  private readonly _options: JobQueueOptions;

  private readonly _onJobAdded = new Emitter<Job<T>>();
  private readonly _onJobStarted = new Emitter<Job<T>>();
  private readonly _onJobCompleted = new Emitter<Job<T>>();
  private readonly _onJobFailed = new Emitter<Job<T>>();
  private readonly _onQueueEmpty = new Emitter<void>();

  public readonly onJobAdded: Event<Job<T>> = this._onJobAdded.event;
  public readonly onJobStarted: Event<Job<T>> = this._onJobStarted.event;
  public readonly onJobCompleted: Event<Job<T>> = this._onJobCompleted.event;
  public readonly onJobFailed: Event<Job<T>> = this._onJobFailed.event;
  public readonly onQueueEmpty: Event<void> = this._onQueueEmpty.event;

  constructor(options: Partial<JobQueueOptions> = {}) {
    this._options = {
      maxRetries: options.maxRetries ?? 3,
      initialBackoffMs: options.initialBackoffMs ?? 5000, // 5 seconds
      maxBackoffMs: options.maxBackoffMs ?? 300000, // 5 minutes
    };
  }

  public addJob(id: string, data: T): boolean {
    if (this._jobs.has(id)) {
      return false; // Job already exists
    }

    const job: Job<T> = {
      id,
      data,
      attempts: 0,
      maxAttempts: this._options.maxRetries + 1,
      status: 'pending',
    };

    this._jobs.set(id, job);
    this._onJobAdded.fire(job);

    return true;
  }

  public hasJob(id: string): boolean {
    return this._jobs.has(id);
  }

  public getJob(id: string): Job<T> | undefined {
    return this._jobs.get(id);
  }

  public async processQueue(processor: (job: T) => Promise<void>): Promise<void> {
    if (this._processing) {
      return;
    }

    this._processing = true;
    const now = Date.now();

    try {
      const pendingJobs = [...this._jobs.values()].filter(
        job =>
          job.status === 'pending' ||
          (job.status === 'failed' &&
            job.attempts < job.maxAttempts &&
            job.nextRetryTime !== undefined &&
            now >= job.nextRetryTime),
      );

      if (pendingJobs.length === 0) {
        if (
          this._jobs.size === 0 ||
          [...this._jobs.values()].every(
            job =>
              job.status === 'completed' ||
              (job.status === 'failed' && job.attempts >= job.maxAttempts),
          )
        ) {
          this._onQueueEmpty.fire();
        }
        return;
      }

      // Process jobs sequentially to avoid overwhelming the system
      for (const job of pendingJobs) {
        if (job.status === 'failed') {
          console.log(
            `[JobQueue] Retrying job ${job.id} (attempt ${job.attempts + 1}/${job.maxAttempts})`,
          );
        }

        job.status = 'processing';
        job.attempts++;
        job.lastAttemptTime = Date.now();

        this._onJobStarted.fire(job);

        try {
          await processor(job.data);
          job.status = 'completed';
          this._onJobCompleted.fire(job);
          this._jobs.delete(job.id);
        } catch (error) {
          const typedError = error instanceof Error ? error : new Error(String(error));
          job.lastError = typedError;

          if (job.attempts >= job.maxAttempts) {
            job.status = 'failed';
            console.error(
              `[JobQueue] Job ${job.id} failed permanently after ${job.attempts} attempts: ${typedError.message}`,
            );
            this._onJobFailed.fire(job);
            this._jobs.delete(job.id);
          } else {
            job.status = 'failed';
            // Calculate exponential backoff with jitter
            const backoff = Math.min(
              this._options.maxBackoffMs,
              this._options.initialBackoffMs * Math.pow(2, job.attempts - 1),
            );
            // Add some randomness (jitter) to prevent thundering herd problem
            const jitter = Math.random() * 0.3 * backoff;
            job.nextRetryTime = Date.now() + backoff + jitter;

            console.warn(
              `[JobQueue] Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}). ` +
                `Will retry in ${Math.round((backoff + jitter) / 1000)}s. Error: ${typedError.message}`,
            );
          }
        }
      }
    } finally {
      this._processing = false;
    }
  }

  public clear(): void {
    this._jobs.clear();
  }

  public get size(): number {
    return this._jobs.size;
  }

  public get pendingCount(): number {
    return [...this._jobs.values()].filter(job => job.status === 'pending').length;
  }

  public get processingCount(): number {
    return [...this._jobs.values()].filter(job => job.status === 'processing').length;
  }

  public get failedCount(): number {
    return [...this._jobs.values()].filter(
      job => job.status === 'failed' && job.attempts >= job.maxAttempts,
    ).length;
  }

  public getPendingJobs(): Job<T>[] {
    return [...this._jobs.values()].filter(job => job.status === 'pending');
  }
}
