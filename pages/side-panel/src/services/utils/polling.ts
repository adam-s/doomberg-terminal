import { Disposable } from 'vs/base/common/lifecycle';

export interface IPollingService extends Disposable {
  start(): void;
  stop(): void;
  isPolling(): boolean;
}

export interface PollingOptions {
  /** milliseconds between each invocation */
  pollIntervalMs: number;
  /** the async function to run on each tick */
  callback: () => Promise<void>;
  /** optional: if callback throws, this will be called. Defaults to console.error. */
  onError?: (err: unknown) => void;
  /** whether to run callback immediately on start. Defaults to true. */
  runImmediately?: boolean;
  /** friendly name for logging. Defaults to 'PollingService'. */
  serviceName?: string;
}

export class PollingService extends Disposable implements IPollingService {
  private _timer?: NodeJS.Timeout;
  private _running: boolean = false;
  private readonly _opts: Required<PollingOptions>;

  public constructor(options: PollingOptions) {
    super();

    const serviceName = options.serviceName || 'PollingService';
    const onErrorCallback =
      options.onError ||
      ((err: unknown) => {
        console.error(`[${serviceName}] Error during polling callback:`, err);
      });

    this._opts = {
      pollIntervalMs: options.pollIntervalMs,
      callback: options.callback,
      onError: onErrorCallback,
      runImmediately: options.runImmediately === undefined ? true : options.runImmediately,
      serviceName: serviceName,
    };

    this._register({ dispose: () => this.stop() });
  }

  public start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    // serviceName is guaranteed by Required<PollingOptions> via constructor logic
    console.log(
      `[${this._opts.serviceName}] Starting polling every ${this._opts.pollIntervalMs} ms`,
    );

    if (this._opts.runImmediately) {
      this._invokeCallback();
    }
    this._timer = setInterval(() => this._invokeCallback(), this._opts.pollIntervalMs);
  }

  public stop(): void {
    if (!this._running) {
      return;
    }
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    this._running = false;
    // serviceName is guaranteed by Required<PollingOptions>
    console.log(`[${this._opts.serviceName}] Polling stopped`);
  }

  public isPolling(): boolean {
    return this._running;
  }

  public override dispose(): void {
    this.stop(); // Ensure stop is called, though _register also handles this.
    super.dispose();
  }

  private async _invokeCallback(): Promise<void> {
    if (!this._running) {
      return;
    }
    try {
      await this._opts.callback();
    } catch (err) {
      // serviceName and onError are guaranteed by Required<PollingOptions> via constructor logic
      console.error(`[${this._opts.serviceName}] Error during callback execution:`, err);
      this._opts.onError(err);
    }
  }
}
