import { CancellationToken } from 'vs/base/common/cancellation';
import { PersistentProtocol } from '@shared/ipc/remote/protocol';
import { PromiseWithTimeout } from '@src/common/utils/cancellationUtils';

// Constants
export const RECONNECT_TIMEOUT = 10_000 * 6;

export interface HelloRequest {
  type: 'hello';
}

export interface AuthRequest {
  type: 'auth';
  auth: string;
}

export interface ErrorMessage {
  type: 'error';
  reason: string;
}

export interface OKMessage {
  type: 'ok';
}

export type HandshakeMessage = HelloRequest | ErrorMessage | AuthRequest | OKMessage;

export function isErrorMessage(msg: unknown): msg is ErrorMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as ErrorMessage).type === 'error' &&
    typeof (msg as ErrorMessage).reason === 'string'
  );
}

export function getErrorFromMessage(message: unknown): Error | null {
  if (isErrorMessage(message)) {
    const error = new Error(`Connection error: ${message.reason}`);
    // error.code = 'CONNECTION_ERROR';
    return error;
  }
  return null;
}

export function readOneControlMessage<T>(
  protocol: PersistentProtocol,
  timeoutCancellationToken: CancellationToken,
): Promise<T> {
  const result = new PromiseWithTimeout<T>(timeoutCancellationToken);
  result.registerDisposable(
    protocol.onControlMessage(raw => {
      const message: T = JSON.parse(raw.toString());
      const error = getErrorFromMessage(message);
      if (error) {
        result.reject(error);
      } else {
        result.resolve(message);
      }
    }),
  );
  return result.promise;
}
