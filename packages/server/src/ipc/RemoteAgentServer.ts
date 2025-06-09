import { Socket, Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { PersistentProtocol, ISocket, SocketCloseEvent } from '@shared/ipc/remote/protocol';
import { IDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';

import { ProcessTimeRunOnceScheduler } from 'vs/base/common/async';
import { ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import {
  AuthRequest,
  ErrorMessage,
  HandshakeMessage,
  readOneControlMessage,
  RECONNECT_TIMEOUT,
} from './utils';
import { createTimeoutCancellation } from '@src/common/utils/cancellationUtils';
import {
  ClientConnectionEvent,
  IMessagePassingProtocol,
  IPCServer,
} from 'vs/base/parts/ipc/common/ipc';
import { Emitter, Event } from 'vs/base/common/event';

export type TContext = string;

export class RemoteAgentServer extends IPCServer<TContext> {
  static createServer(httpServer: HTTPServer): Server {
    return new Server(httpServer, {
      cors: {
        origin: '*',
      },
    });
  }

  static fromHttpServer(httpServer: HTTPServer): RemoteAgentServer {
    const io = RemoteAgentServer.createServer(httpServer);
    return new RemoteAgentServer(io);
  }

  private _onDidConnectEmitter: Emitter<ClientConnectionEvent>;
  public readonly onDidConnect: Event<ClientConnectionEvent>;

  // Add back the declaration of _managementConnections
  private readonly _managementConnections = new Map<string, ManagementConnection>();

  constructor(private readonly _io: Server) {
    const emitter = new Emitter<ClientConnectionEvent>();
    super(emitter.event);
    this._onDidConnectEmitter = emitter;
    this.onDidConnect = emitter.event;

    this._io.on('connection', this._handleConnection.bind(this));
  }

  private async _handleConnection(rawSocket: Socket) {
    const cancellationToken = createTimeoutCancellation(RECONNECT_TIMEOUT);
    const socket = new IOSocket(rawSocket);
    const protocol = new PersistentProtocol({ socket });
    try {
      const reconnectionToken = rawSocket.handshake.query.reconnectionToken;
      if (typeof reconnectionToken !== 'string') {
        this._rejectWebSocketConnection(protocol, 'Invalid reconnection token');
      } else {
        // Send HelloRequest control in order to let client know that handshake can commence

        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'hello' })));

        // Capture the AuthMessage

        const authMessage = await readOneControlMessage<HandshakeMessage>(
          protocol,
          cancellationToken,
        );

        if (authMessage.type !== 'auth') {
          throw new Error('Handshake error: First step was not HelloRequest');
        }

        // Validate AuthMessage
        this._validateAuthRequest(authMessage);

        const existingConnection = this._managementConnections.get(reconnectionToken);
        if (existingConnection) {
          // If accepting the reconnection is successful then get the protocol from the existingConnection
          // protocol.dispose();
          existingConnection.acceptReconnection(socket, VSBuffer.alloc(0));
        } else {
          const connection = new ManagementConnection(protocol);
          this._acceptConnection(connection.protocol, connection.onClose);
          this._managementConnections.set(reconnectionToken, connection);
          await Promise.resolve();
          connection.onClose(() => {
            this._managementConnections.delete(reconnectionToken);
          });
        }

        // All finished

        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
      }
    } catch (error) {
      console.error('SERVER: Error during connection handling:', error);
      // Attempt to send error message to client
      try {
        // Assuming `protocol` is already initialized
        if (protocol) {
          const errMessage: ErrorMessage = {
            type: 'error',
            reason: error instanceof Error ? error.message : 'Unknown error',
          };

          protocol.sendControl(VSBuffer.fromString(JSON.stringify(errMessage)));
        }
      } catch (sendError) {
        console.error(
          'SERVER: Handshake error: Failed to send error message to client:',
          sendError,
        );
      }

      // Clean up protocol and sockets
      try {
        if (protocol) {
          protocol.dispose();
        }
        if (socket) {
          await socket.drain(); // Ensures all data is sent before closing
          socket.dispose();
        }
      } catch (cleanupError) {
        console.error('SERVER: Handshake error: Error during cleanup:', cleanupError);
      }
    }
  }

  private async _rejectWebSocketConnection(
    protocol: PersistentProtocol,
    reason: string,
  ): Promise<void> {
    const socket = protocol.getSocket();
    const errMessage: ErrorMessage = {
      type: 'error',
      reason: reason,
    };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(errMessage)));
    protocol.dispose();
    await socket.drain();
    socket.dispose();
  }

  private _validateAuthRequest(authRequest: AuthRequest) {
    if (authRequest.auth === 'pass') {
      return true;
    }

    throw new Error('Handshake error: failed to authenticate');
  }

  public _acceptConnection(
    protocol: IMessagePassingProtocol,
    onDidClientDisconnect: Event<void>,
  ): void {
    this._onDidConnectEmitter.fire({ protocol, onDidClientDisconnect });
  }
}

const socketEndTimeoutMs = 30_000;

export class IOSocket implements ISocket {
  public readonly socket: Socket;

  private readonly _errorListener: (err: Error) => void;
  private readonly _closeListener: (hadError: boolean) => void;
  private readonly _endListener: () => void;
  private _canWrite = true;

  constructor(socket: Socket) {
    this.socket = socket;

    this._errorListener = (err: Error) => {
      console.error('SERVER: Socket error', err);
    };
    let endTimeoutHandle: NodeJS.Timeout | number | undefined;
    this._closeListener = (hadError: boolean) => {
      if (hadError) {
        console.error('SERVER: Socket closed due to an error');
      }
      this._canWrite = false;
      if (endTimeoutHandle) {
        clearTimeout(endTimeoutHandle);
      }
    };
    this._endListener = () => {
      this._canWrite = false;
      endTimeoutHandle = setTimeout(() => socket.disconnect(), socketEndTimeoutMs);
    };

    this.socket.on('error', this._errorListener);
    this.socket.on('close', this._closeListener);
    this.socket.on('end', this._endListener);
  }

  public dispose(): void {
    this.socket.off('error', this._errorListener);
    this.socket.off('close', this._closeListener);
    this.socket.off('end', this._endListener);
    this.socket.disconnect();
  }

  public onData(_listener: (e: VSBuffer) => void): IDisposable {
    const listener = (buff: Uint8Array) => {
      _listener(VSBuffer.wrap(buff));
    };
    this.socket.on('message', listener);
    return {
      dispose: () => {
        this.socket.off('message', listener);
      },
    };
  }

  public onClose(listener: (e: SocketCloseEvent) => void): IDisposable {
    this.socket.on('close', listener);
    return {
      dispose: () => {
        this.socket.off('close', listener);
      },
    };
  }

  public onEnd(listener: () => void): IDisposable {
    this.socket.on('end', listener);
    return {
      dispose: () => {
        this.socket.off('end', listener);
      },
    };
  }

  public write(buffer: VSBuffer): void {
    this.socket.write(buffer.buffer);
  }

  public end(): void {
    this.socket.disconnect();
  }

  public drain(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Manages a persistent connection with support for reconnection logic.
 */
export class ManagementConnection {
  // The protocol used for persistent communication.
  public readonly protocol: PersistentProtocol;

  private _onClose = new Emitter<void>();
  public readonly onClose: Event<void> = this._onClose.event;

  // Indicates whether the connection has been disposed.
  private _disposed: boolean;

  // Scheduler for handling the main reconnection grace period.
  private _disconnectRunner1: ProcessTimeRunOnceScheduler;

  // Scheduler for handling a shortened reconnection grace period.
  private _disconnectRunner2: ProcessTimeRunOnceScheduler;

  /**
   * Initializes a new instance of the ManagementConnection class.
   * @param protocol The persistent protocol used for communication.
   */
  constructor(protocol: PersistentProtocol) {
    this.protocol = protocol;
    this._disposed = false;

    // Initialize the main reconnection scheduler with the standard grace time.
    this._disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => {
      this._cleanResources();
    }, ProtocolConstants.ReconnectionGraceTime);

    // Initialize the short reconnection scheduler with a shorter grace time.
    this._disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => {
      this._cleanResources();
    }, ProtocolConstants.ReconnectionShortGraceTime);

    // Listen for the protocol disposal event to clean up resources.
    this.protocol.onDidDispose(() => {
      this._cleanResources();
    });

    // Listen for the socket close event to start the reconnection grace period.
    this.protocol.onSocketClose(() => {
      this._disconnectRunner1.schedule();
    });
  }

  /**
   * Shortens the reconnection grace time if certain conditions are met.
   * This is typically called when another client connects, indicating
   * that the connection should be maintained for a shorter period.
   */
  public shortenReconnectionGraceTimeIfNecessary(): void {
    if (this._disconnectRunner2.isScheduled()) {
      // If the short reconnection timer is already running, no action is needed.

      return;
    }
    if (this._disconnectRunner1.isScheduled()) {
      // If the main reconnection timer is running, schedule the short grace time.

      this._disconnectRunner2.schedule();
    }
  }

  /**
   * Cleans up all resources associated with the connection.
   * This method ensures that the connection is properly disposed of
   * and that all related schedulers and protocols are terminated.
   */
  private _cleanResources(): void {
    if (this._disposed) {
      // If already disposed, no further action is needed.

      return;
    }
    this._disposed = true;

    // Dispose both reconnection schedulers to prevent any pending tasks.
    this._disconnectRunner1.dispose();
    this._disconnectRunner2.dispose();

    // Retrieve the underlying socket from the protocol.
    const socket = this.protocol.getSocket();

    // Send a disconnect message through the protocol.

    this.protocol.sendDisconnect();

    // Dispose of the protocol to release any associated resources.
    this.protocol.dispose();

    // Close the socket connection gracefully.

    socket.end();

    // Emit the onClose event

    this._onClose.fire();
  }

  /**
   * Accepts a reconnection attempt by reinitializing the protocol with the new socket.
   * @param socket The new socket connection from the client.
   * @param initialDataChunk The initial data received from the client upon reconnection.
   */
  public acceptReconnection(socket: ISocket, initialDataChunk: VSBuffer): void {
    // Cancel any pending reconnection timers since the client has reconnected.
    this._disconnectRunner1.cancel();
    this._disconnectRunner2.cancel();

    // Begin the reconnection process with the new socket and initial data.

    this.protocol.beginAcceptReconnection(socket, initialDataChunk);

    // Finalize the reconnection process.

    this.protocol.endAcceptReconnection();
  }
}
