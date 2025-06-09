import { describe, it, vi, expect } from 'vitest';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import {
  PromiseWithTimeout,
  createTimeoutCancellation,
  combineTimeoutCancellation,
} from '../utils/cancellationUtils';

describe('cancellationUtils', () => {
  describe('createTimeoutCancellation', () => {
    it('should cancel the token after the specified timeout', async () => {
      vi.useFakeTimers();

      const token = createTimeoutCancellation(100); // 100ms
      expect(token.isCancellationRequested).toBe(false);

      // Advance fake timers by 150ms
      vi.advanceTimersByTime(150);

      expect(token.isCancellationRequested).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('combineTimeoutCancellation', () => {
    it('should cancel the combined token when the first token is canceled', () => {
      const source1 = new CancellationTokenSource();
      const source2 = new CancellationTokenSource();
      const combinedToken = combineTimeoutCancellation(source1.token, source2.token);

      expect(combinedToken.isCancellationRequested).toBe(false);

      source1.cancel();

      expect(combinedToken.isCancellationRequested).toBe(true);
    });

    it('should cancel the combined token when the second token is canceled', () => {
      const source1 = new CancellationTokenSource();
      const source2 = new CancellationTokenSource();
      const combinedToken = combineTimeoutCancellation(source1.token, source2.token);

      expect(combinedToken.isCancellationRequested).toBe(false);

      source2.cancel();

      expect(combinedToken.isCancellationRequested).toBe(true);
    });

    it('should not cancel the combined token if neither token is canceled', () => {
      const source1 = new CancellationTokenSource();
      const source2 = new CancellationTokenSource();
      const combinedToken = combineTimeoutCancellation(source1.token, source2.token);

      expect(combinedToken.isCancellationRequested).toBe(false);
    });
  });

  describe('PromiseWithTimeout', () => {
    it('should reject with a timeout error when the token is canceled', async () => {
      vi.useFakeTimers();

      const timeoutToken = createTimeoutCancellation(100); // 100ms
      const promiseWithTimeout = new PromiseWithTimeout<void>(timeoutToken);
      const promise = promiseWithTimeout.promise;

      // Advance fake timers by 150ms to trigger the timeout
      vi.advanceTimersByTime(150);

      await expect(promise).rejects.toThrowError(/Time limit reached/);
      expect(promiseWithTimeout.didTimeout).toBe(true);

      vi.useRealTimers();
    });

    it('should resolve if the operation completes before the timeout', async () => {
      vi.useFakeTimers();

      const timeoutToken = createTimeoutCancellation(100); // 100ms
      const promiseWithTimeout = new PromiseWithTimeout<string>(timeoutToken);
      const promise = promiseWithTimeout.promise;

      // Simulate an asynchronous operation that completes before the timeout
      setTimeout(() => {
        promiseWithTimeout.resolve('Success');
      }, 50); // completes in 50ms

      // Advance fake timers by 50ms to trigger the resolve
      vi.advanceTimersByTime(50);

      const result = await promise;
      expect(result).toBe('Success');
      expect(promiseWithTimeout.didTimeout).toBe(false);

      vi.useRealTimers();
    });

    it('should not resolve or reject if already timed out', async () => {
      vi.useFakeTimers();

      const timeoutToken = createTimeoutCancellation(50); // 50ms
      const promiseWithTimeout = new PromiseWithTimeout<string>(timeoutToken);
      const promise = promiseWithTimeout.promise;

      // Advance fake timers by 60ms to trigger the timeout
      vi.advanceTimersByTime(60);

      // Attempt to resolve after the timeout has occurred
      setTimeout(() => {
        promiseWithTimeout.resolve('Success');
      }, 100); // attempts to resolve after 100ms

      // Advance fake timers by another 100ms
      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrowError(/Time limit reached/);
      expect(promiseWithTimeout.didTimeout).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('CancellationToken', () => {
    it('should fire onCancellationRequested when token is canceled', () => {
      vi.useFakeTimers();

      const cts = new CancellationTokenSource();
      const token: CancellationToken = cts.token;

      const cancellationSpy = vi.fn();

      // Register an event listener for cancellation
      token.onCancellationRequested(cancellationSpy);

      // At this point, cancellation has not been requested
      expect(token.isCancellationRequested).toBe(false);
      expect(cancellationSpy).not.toHaveBeenCalled();

      // Cancel the token
      cts.cancel();

      // Advance timers to process event loop
      vi.advanceTimersByTime(0);

      // Check that cancellation has been requested and the listener was called
      expect(token.isCancellationRequested).toBe(true);
      expect(cancellationSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should call onCancellationRequested listeners registered after cancellation', () => {
      vi.useFakeTimers();

      const cts = new CancellationTokenSource();
      const token: CancellationToken = cts.token;

      // Cancel the token before registering the listener
      cts.cancel();

      const cancellationSpy = vi.fn();

      // Register an event listener after cancellation
      token.onCancellationRequested(cancellationSpy);

      // Advance timers to process event loop
      vi.advanceTimersByTime(0);

      // The listener should still be called
      expect(cancellationSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should only fire onCancellationRequested once', () => {
      vi.useFakeTimers();

      const cts = new CancellationTokenSource();
      const token: CancellationToken = cts.token;

      const cancellationSpy = vi.fn();

      // Register multiple listeners
      token.onCancellationRequested(cancellationSpy);
      token.onCancellationRequested(cancellationSpy);

      // Cancel the token
      cts.cancel();

      // Advance timers
      vi.advanceTimersByTime(0);

      // Listener should be called twice (once per registration)
      expect(cancellationSpy).toHaveBeenCalledTimes(2);

      // Cancel again to ensure listeners are not called more than once
      cts.cancel();

      // Advance timers
      vi.advanceTimersByTime(0);

      // Listener count should remain the same
      expect(cancellationSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});

describe('cancellationUtils in real world examples', () => {
  it('should cancel a long-running operation when the token is canceled', async () => {
    vi.useFakeTimers();

    // Create a CancellationTokenSource and get the token
    const cts = new CancellationTokenSource();
    const token = cts.token;

    // Simulate a long-running asynchronous operation
    const longRunningOperation = async () => {
      for (let i = 0; i < 10; i++) {
        // Simulate work by waiting 100ms
        await new Promise(resolve => setTimeout(resolve, 100));

        // Periodically check if cancellation has been requested
        if (token.isCancellationRequested) {
          throw new Error('Operation canceled');
        }
      }
      return 'Operation completed';
    };

    // Start the long-running operation
    const promise = longRunningOperation();

    // After 250ms, cancel the operation
    vi.advanceTimersByTime(250);
    cts.cancel();

    // Advance timers to process any pending operations
    vi.advanceTimersByTime(0);

    // Expect the operation to be canceled
    await expect(promise).rejects.toThrowError('Operation canceled');

    vi.useRealTimers();
  });

  it('should cancel an HTTP request when the token is canceled', async () => {
    vi.useFakeTimers();

    // Create a CancellationTokenSource and get the token
    const cts = new CancellationTokenSource();
    const token = cts.token;

    // Mocking an HTTP request function
    const fetchData = (token: CancellationToken) => {
      return new Promise<string>((resolve, reject) => {
        // Simulate a network request that takes 500ms
        const timeoutId = setTimeout(() => {
          resolve('Data received');
        }, 500);

        // If cancellation is requested, abort the request
        token.onCancellationRequested(() => {
          clearTimeout(timeoutId);
          reject(new Error('Request canceled'));
        });
      });
    };

    // Start the HTTP request
    const promise = fetchData(token);

    // Cancel the request after 200ms
    vi.advanceTimersByTime(200);
    cts.cancel();

    // Advance timers to process any pending operations
    vi.advanceTimersByTime(0);

    // Expect the request to be canceled
    await expect(promise).rejects.toThrowError('Request canceled');

    vi.useRealTimers();
  });

  it('should timeout an operation using PromiseWithTimeout', async () => {
    vi.useFakeTimers();

    // Create a CancellationToken that cancels after 300ms
    const timeoutToken = createTimeoutCancellation(300);
    const promiseWithTimeout = new PromiseWithTimeout<string>(timeoutToken);

    // Simulate an operation that takes longer than the timeout
    setTimeout(() => {
      promiseWithTimeout.resolve('Operation completed');
    }, 500);

    // Advance timers by 300ms to trigger the timeout
    vi.advanceTimersByTime(300);

    // Expect the promise to reject due to timeout
    await expect(promiseWithTimeout.promise).rejects.toThrowError(/Time limit reached/);

    vi.useRealTimers();
  });

  it('should combine cancellation tokens to cancel an operation', async () => {
    vi.useFakeTimers();

    // Create two CancellationTokenSources
    const cts1 = new CancellationTokenSource();
    const cts2 = new CancellationTokenSource();

    // Combine the two tokens into one
    const combinedToken = combineTimeoutCancellation(cts1.token, cts2.token);

    const operation = async () => {
      let timer: NodeJS.Timeout;
      // Create a promise that resolves after 100ms to simulate work
      const workPromise = new Promise(resolve => {
        timer = setTimeout(() => {
          resolve('Operation completed');
        }, 100);
      });

      // Create a promise that rejects when the combined token is canceled
      const cancellationPromise = new Promise((_, reject) => {
        if (combinedToken.isCancellationRequested) {
          reject(new Error('Operation canceled'));
        } else {
          combinedToken.onCancellationRequested(() => {
            reject(new Error('Operation canceled'));
          });
        }
        clearTimeout(timer);
      });

      // Race the work against the cancellation
      return Promise.race([workPromise, cancellationPromise]);
    };

    // Start the operation
    const promise = operation();

    // Cancel one of the tokens after 50ms
    vi.advanceTimersByTime(50);
    cts2.cancel();

    // Advance timers to process any pending operations
    vi.advanceTimersByTime(0);

    // Expect the operation to be canceled due to combined token cancellation
    await expect(promise).rejects.toThrowError('Operation canceled');

    vi.useRealTimers();
  });
});
