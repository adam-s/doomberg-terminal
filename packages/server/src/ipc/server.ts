import { Socket, Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Emitter } from 'vs/base/common/event';
import { ClientConnectionEvent, IPCServer } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol, ISocket, SocketCloseEvent } from '@shared/ipc/remote/protocol';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';

export class Server extends IPCServer {
  constructor(readonly _manager: ServerConnectionManager) {
    super(_manager.onDidClientConnect);
  }
}

export class ServerConnectionManager {
  static fromHttpServer(httpServer: HTTPServer): ServerConnectionManager {
    return new ServerConnectionManager(httpServer);
  }

  // We need management connections

  private readonly _onDidClientConnect = new Emitter<ClientConnectionEvent>();
  public get onDidClientConnect() {
    return this._onDidClientConnect.event;
  }

  private readonly _onCreateMessageChannel = new Emitter<{ socket: Socket; id: string }>();

  private static readonly Clients = new Map<string, IDisposable>();
  // Remove the declaration of _managementConnections
  private readonly _managementConnections = new Map<string, ManagementConnection>();

  private _io: SocketIOServer;

  constructor(private readonly _httpServer: HTTPServer) {
    this._io = this._createServer(this._httpServer);
    this._io.on('connection', this._handleConnection.bind(this));
  }

  private _createServer(httpServer: HTTPServer) {
    return new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
      },
    });
  }

  private _handleConnection(socket: Socket) {
    const id = socket.handshake.query.id as string;
    const client = ServerConnectionManager.Clients.get(id);
    client?.dispose();
    const onDidClientReconnect = new Emitter<void>();
    ServerConnectionManager.Clients.set(
      id,
      toDisposable(() => onDidClientReconnect.fire()),
    );
    const onDidClientDisconnect = onDidClientReconnect.event;
    socket.on('disconnect', () => {
      onDidClientReconnect.fire();
    });
    const protocol = new PersistentProtocol({ socket: new IOSocket(socket) });
    this._onDidClientConnect.fire({ protocol, onDidClientDisconnect });
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
      console.error('Socket error', err);
    };

    let endTimeoutHandle: NodeJS.Timeout | number | undefined;
    this._closeListener = (hadError: boolean) => {
      if (hadError) {
        console.error('Socket closed due to an error');
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
      dispose: () => this.socket.off('message', listener),
    };
  }

  public onClose(listener: (e: SocketCloseEvent) => void): IDisposable {
    this.socket.on('close', listener);
    return {
      dispose: () => this.socket.off('close', listener),
    };
  }

  public onEnd(listener: () => void): IDisposable {
    this.socket.on('end', listener);
    return {
      dispose: () => this.socket.off('end', listener),
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

class ManagementConnection {}
