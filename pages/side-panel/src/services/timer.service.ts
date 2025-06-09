/**
 * Timer Service - Efficient Timer Management System
 *
 * This service provides timer functionality using a single base timer
 * that drives all individual timers for optimal resource usage.
 *
 * Architecture Diagram:
 * ```mermaid
 * flowchart TD
 *     %% Core components
 *     Client([Client Code])
 *     TimerService[Timer Service]
 *     TimerStore[(Timer Store)]
 *     BaseTimer[Base Timer\nticks every 100ms]
 *
 *     Client -->|API Calls| TimerService
 *     TimerService -->|stores timers| TimerStore
 *     TimerService -->|manages| BaseTimer
 *     BaseTimer -->|checks & updates| TimerStore
 *
 *     %% Key concepts
 *     subgraph "Core Concepts"
 *         direction TB
 *         SingleTimer[Single Base Timer]
 *         EfficientTracking[Efficient Tick Tracking]
 *         OptimalResource[Optimal Resource Usage]
 *
 *         SingleTimer -->|drives all timers| EfficientTracking
 *         EfficientTracking -->|stops when idle| OptimalResource
 *     end
 *
 *     %% Timer flow
 *     subgraph "Timer Lifecycle"
 *         direction LR
 *         Create[Create/Get Timer]
 *         Start[Start Timer]
 *         Tick[Timer Ticks]
 *         Stop[Stop Timer]
 *
 *         Create --> Start
 *         Start --> Tick
 *         Tick --> Stop
 *     end
 * ```
 */

import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import {
  IObservable,
  ISettableObservable,
  observableValue,
  autorun,
} from 'vs/base/common/observable';

interface Timer {
  interval: number;
  tick$: ISettableObservable<number>;
  isRunning: boolean;
  lastTickTime: number; // Track when this timer last ticked
}

/**
 * Interface for a time provider that returns the current time in milliseconds
 */
export interface ITimeProvider {
  /**
   * Gets the current time in milliseconds
   */
  now(): number;
}

/**
 * Default system time provider that uses performance.now() or Date.now()
 */
export class SystemTimeProvider implements ITimeProvider {
  now(): number {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }
}

export interface ITimerService {
  readonly _serviceBrand: undefined;

  /**
   * Creates or gets a timer with the specified ID and interval
   * @param id Unique identifier for this timer
   * @param interval Interval in milliseconds
   * @returns The timer ID for reference
   */
  createTimer(id: string, interval: number): string;

  /**
   * Gets the observable tick for a specific timer
   * @param id Timer identifier
   */
  getTick(id: string): IObservable<number>;

  /**
   * Starts a timer
   * @param id Timer identifier
   */
  startTimer(id: string): void;

  /**
   * Stops a timer
   * @param id Timer identifier
   */
  stopTimer(id: string): void;

  /**
   * Updates a timer's interval
   * @param id Timer identifier
   * @param interval New interval in milliseconds
   */
  updateInterval(id: string, interval: number): void;

  /**
   * Subscribes to a timer with a callback function that runs on each tick
   * @param id Timer identifier
   * @param intervalOrObservable Interval in ms or an observable that tracks interval changes
   * @param callback Function to call on each timer tick
   * @returns A disposable that unsubscribes from the timer
   */
  subscribeToTimer(
    id: string,
    intervalOrObservable: number | IObservable<number>,
    callback: () => void,
  ): IDisposable;

  /**
   * Manually triggers a tick for a specific timer
   * This is primarily used for replay/simulation scenarios
   * where ticks should be driven by external events rather than time
   * @param id Timer identifier
   * @param ticks Number of ticks to add (default: 1)
   */
  triggerTick(id: string, ticks?: number): void;

  /**
   * Sets a custom time provider to be used by the timer service.
   * This is useful for replay scenarios where "now" is a historical timestamp.
   * @param timeProvider The time provider to use
   */
  setTimeProvider(timeProvider: ITimeProvider): void;

  /**
   * Gets the current time provider
   */
  getTimeProvider(): ITimeProvider;
}

export const ITimerService = createDecorator<ITimerService>('timerService');

export class TimerService extends Disposable implements ITimerService {
  readonly _serviceBrand: undefined;

  private readonly timers = new Map<string, Timer>();
  private baseTimerHandle?: number;
  private baseTickInterval = 100; // Now a variable instead of a constant
  private activeTimersCount = 0;

  // Time provider - defaults to system time
  private timeProvider: ITimeProvider = new SystemTimeProvider();

  constructor() {
    super();
  }

  /**
   * Gets the current high-resolution time in milliseconds.
   * Uses performance.now() if available for better precision, otherwise Date.now()
   */
  private getCurrentTime(): number {
    return this.timeProvider.now();
  }

  /**
   * Calculates greatest common divisor of two numbers
   * Used to find optimal base timer interval
   */
  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  /**
   * Calculates the optimal base timer interval based on all active timers
   * @returns The optimal interval in milliseconds (minimum 10ms)
   */
  private calculateOptimalBaseInterval(): number {
    const MIN_INTERVAL = 10; // Minimum base interval (ms)
    const MAX_INTERVAL = 1000; // Maximum base interval (ms)

    // Get intervals of all running timers
    const intervals: number[] = [];
    for (const timer of this.timers.values()) {
      if (timer.isRunning) {
        intervals.push(timer.interval);
      }
    }

    if (intervals.length === 0) {
      return MAX_INTERVAL; // Default to 1000ms if no active timers
    }

    // Find GCD of all intervals
    let result = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      result = this.gcd(result, intervals[i]);
    }

    // Ensure the interval is reasonable (not too small or large)
    return Math.max(MIN_INTERVAL, Math.min(result, MAX_INTERVAL));
  }

  /**
   * Restarts the base timer with the optimal interval
   */
  private restartBaseTimer(): void {
    // Stop existing timer if running
    if (this.baseTimerHandle !== undefined) {
      window.clearInterval(this.baseTimerHandle);
      this.baseTimerHandle = undefined;
    }

    // Don't start if no active timers
    if (this.activeTimersCount === 0) {
      return;
    }

    // Calculate optimal interval
    this.baseTickInterval = this.calculateOptimalBaseInterval();

    // Start new timer with optimal interval
    this.baseTimerHandle = window.setInterval(() => {
      const currentTime = this.getCurrentTime();

      // Check each timer to see if it needs to tick
      for (const timer of this.timers.values()) {
        if (!timer.isRunning) {
          continue;
        }

        const elapsed = currentTime - timer.lastTickTime;

        if (elapsed >= timer.interval) {
          // Calculate how many ticks have passed
          const ticksToAdd = Math.floor(elapsed / timer.interval);

          if (ticksToAdd > 0) {
            // Update the tick value to trigger subscribers
            timer.tick$.set(timer.tick$.get() + ticksToAdd, undefined);

            // Increment lastTickTime by the exact elapsed time
            // This preserves fractional time and prevents drift
            timer.lastTickTime += ticksToAdd * timer.interval;
          }
        }
      }
    }, this.baseTickInterval);
  }

  private startBaseTimer(): void {
    if (this.baseTimerHandle !== undefined) {
      return; // Base timer already running
    }

    this.restartBaseTimer();
  }

  private stopBaseTimer(): void {
    if (this.baseTimerHandle !== undefined && this.activeTimersCount === 0) {
      window.clearInterval(this.baseTimerHandle);
      this.baseTimerHandle = undefined;
    }
  }

  public createTimer(id: string, interval: number): string {
    if (this.timers.has(id)) {
      const timer = this.timers.get(id)!;
      // Check if interval changed
      if (timer.interval !== interval) {
        timer.interval = interval;
        // If timer is running, recalculate base timer interval
        if (timer.isRunning) {
          this.restartBaseTimer();
        }
      }
      return id;
    }

    const tick$ = observableValue<number>(`timer-${id}`, 0);

    this.timers.set(id, {
      interval,
      tick$,
      isRunning: false,
      lastTickTime: this.getCurrentTime(),
    });

    return id;
  }

  public getTick(id: string): IObservable<number> {
    if (!this.timers.has(id)) {
      throw new Error(`Timer with ID '${id}' does not exist`);
    }

    return this.timers.get(id)!.tick$;
  }

  public startTimer(id: string): void {
    if (!this.timers.has(id)) {
      throw new Error(`Timer with ID '${id}' does not exist`);
    }

    const timer = this.timers.get(id)!;

    if (timer.isRunning) {
      return;
    }

    timer.isRunning = true;
    timer.lastTickTime = this.getCurrentTime(); // Reset last tick time
    this.activeTimersCount++;

    // Start the base timer if it's not already running
    this.startBaseTimer();

    // Recalculate base timer interval since we have a new active timer
    this.restartBaseTimer();
  }

  public stopTimer(id: string): void {
    if (!this.timers.has(id)) {
      return;
    }

    const timer = this.timers.get(id)!;

    if (timer.isRunning) {
      timer.isRunning = false;
      this.activeTimersCount--;

      // Recalculate base timer interval after stopping a timer
      this.restartBaseTimer();

      // Check if we can stop the base timer
      this.stopBaseTimer();
    }
  }

  public updateInterval(id: string, interval: number): void {
    if (!this.timers.has(id)) {
      throw new Error(`Timer with ID '${id}' does not exist`);
    }

    const timer = this.timers.get(id)!;

    // Only reset the timing if the interval actually changed
    if (timer.interval !== interval) {
      timer.interval = interval;

      if (timer.isRunning) {
        // Reset the lastTickTime to prevent immediate ticking after interval change
        timer.lastTickTime = this.getCurrentTime();

        // Recalculate base timer interval when a timer's interval changes
        this.restartBaseTimer();
      }
    }
  }

  public subscribeToTimer(
    id: string,
    intervalOrObservable: number | IObservable<number>,
    callback: () => void,
  ): IDisposable {
    // Create disposal container
    const disposables = new DisposableStore();

    // Handle interval setup based on whether it's a fixed value or an observable
    if (typeof intervalOrObservable === 'number') {
      const interval = intervalOrObservable;
      this.createTimer(id, interval);
      this.startTimer(id);
    } else {
      // For observable intervals, set up autorun to update when interval changes
      disposables.add(
        autorun(reader => {
          const interval = intervalOrObservable.read(reader);
          this.createTimer(id, interval);
          this.startTimer(id);
        }),
      );
    }

    // Set up tick subscription autorun
    disposables.add(
      autorun(reader => {
        this.getTick(id).read(reader);
        callback();
      }),
    );

    // Return a disposable that cleans up both autoruns and stops the timer
    return {
      dispose: () => {
        this.stopTimer(id);
        disposables.dispose();
      },
    };
  }

  /**
   * Manually triggers a timer tick, useful for replay/simulation
   */
  public triggerTick(id: string, ticks: number = 1): void {
    if (!this.timers.has(id)) {
      throw new Error(`Timer with ID '${id}' does not exist`);
    }

    const timer = this.timers.get(id)!;
    if (!timer.isRunning) {
      return; // Only trigger ticks for running timers
    }

    // Update the tick value to trigger subscribers
    timer.tick$.set(timer.tick$.get() + ticks, undefined);
    timer.lastTickTime = this.getCurrentTime(); // Update last tick time
  }

  /**
   * Sets a custom time provider
   */
  public setTimeProvider(timeProvider: ITimeProvider): void {
    this.timeProvider = timeProvider;

    // Update lastTickTime for all timers to prevent unwanted immediate ticks
    const currentTime = this.getCurrentTime();
    for (const timer of this.timers.values()) {
      timer.lastTickTime = currentTime;
    }
  }

  /**
   * Gets the current time provider
   */
  public getTimeProvider(): ITimeProvider {
    return this.timeProvider;
  }

  override dispose(): void {
    // Clean up base timer
    if (this.baseTimerHandle !== undefined) {
      window.clearInterval(this.baseTimerHandle);
      this.baseTimerHandle = undefined;
    }

    // Clean up all timers
    for (const id of this.timers.keys()) {
      this.stopTimer(id);
    }
    this.timers.clear();
    super.dispose();
  }
}
