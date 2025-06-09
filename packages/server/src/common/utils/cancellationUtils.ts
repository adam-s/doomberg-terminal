// cancellationUtils.ts

/*---------------------------------------------------------------------------------------------
 *  Cancellation Utilities Module
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { promiseWithResolvers } from 'vs/base/common/async';

interface TimeoutError extends Error {
  code: string;
  syscall: string;
}

/**
 * Creates a CancellationToken that will be canceled after a specified timeout.
 */
export function createTimeoutCancellation(millis: number): CancellationToken {
  const source = new CancellationTokenSource();
  setTimeout(() => source.cancel(), millis);
  return source.token;
}

/**
 * Combines two CancellationTokens into one. The combined token is canceled if either of the input tokens is canceled.
 */
export function combineTimeoutCancellation(
  a: CancellationToken,
  b: CancellationToken,
): CancellationToken {
  if (a.isCancellationRequested || b.isCancellationRequested) {
    return CancellationToken.Cancelled;
  }
  const source = new CancellationTokenSource();
  a.onCancellationRequested(() => source.cancel());
  b.onCancellationRequested(() => source.cancel());
  return source.token;
}

/**
 * A Promise that can be canceled with a CancellationToken, rejecting with a timeout error if canceled.
 */
export class PromiseWithTimeout<T> {
  private _state: 'pending' | 'resolved' | 'rejected' | 'timedout';
  private readonly _disposables: DisposableStore;
  public readonly promise: Promise<T>;
  private readonly _resolvePromise: (value: T) => void;
  private readonly _rejectPromise: (err: Error) => void;

  public get didTimeout(): boolean {
    return this._state === 'timedout';
  }

  constructor(timeoutCancellationToken: CancellationToken) {
    this._state = 'pending';
    this._disposables = new DisposableStore();

    ({
      promise: this.promise,
      resolve: this._resolvePromise,
      reject: this._rejectPromise,
    } = promiseWithResolvers<T>());

    if (timeoutCancellationToken.isCancellationRequested) {
      this._timeout();
    } else {
      this._disposables.add(
        timeoutCancellationToken.onCancellationRequested(() => this._timeout()),
      );
    }
  }

  public registerDisposable(disposable: IDisposable): void {
    if (this._state === 'pending') {
      this._disposables.add(disposable);
    } else {
      disposable.dispose();
    }
  }

  private _timeout(): void {
    if (this._state !== 'pending') {
      return;
    }
    this._disposables.dispose();
    this._state = 'timedout';
    this._rejectPromise(this._createTimeoutError());
  }

  private _createTimeoutError(): TimeoutError {
    const err = new Error('Time limit reached') as TimeoutError;
    err.code = 'ETIMEDOUT';
    err.syscall = 'connect';
    return err;
  }

  public resolve(value: T): void {
    if (this._state !== 'pending') {
      return;
    }
    this._disposables.dispose();
    this._state = 'resolved';
    this._resolvePromise(value);
  }

  public reject(err: Error): void {
    if (this._state !== 'pending') {
      return;
    }
    this._disposables.dispose();
    this._state = 'rejected';
    this._rejectPromise(err);
  }
}
