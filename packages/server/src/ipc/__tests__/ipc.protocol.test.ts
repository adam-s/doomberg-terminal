/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, assert, it, beforeEach, vi, expect } from 'vitest';
import { EventEmitter } from 'events';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { timeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import {
  createRandomIPCHandle,
  createStaticIPCHandle,
  WebSocketNodeSocket,
} from 'vs/base/parts/ipc/node/ipc.net';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import {
  ISocket,
  ILoadEstimator,
  PersistentProtocol,
  Protocol,
  ProtocolConstants,
  SocketCloseEvent,
} from '../../../../shared/src/ipc/remote/protocol';
import { Socket } from 'socket.io';

class MessageStream extends Disposable {
  private _currentComplete: ((data: VSBuffer) => void) | null;
  private _messages: VSBuffer[];

  constructor(x: Protocol | PersistentProtocol) {
    super();
    this._currentComplete = null;
    this._messages = [];
    this._register(
      x.onMessage(data => {
        this._messages.push(data);
        this._trigger();
      }),
    );
  }

  private _trigger(): void {
    if (!this._currentComplete) {
      return;
    }
    if (this._messages.length === 0) {
      return;
    }
    const complete = this._currentComplete;
    const msg = this._messages.shift()!;

    this._currentComplete = null;
    complete(msg);
  }

  public waitForOne(): Promise<VSBuffer> {
    return new Promise<VSBuffer>(complete => {
      this._currentComplete = complete;
      this._trigger();
    });
  }
}

class EtherStream extends EventEmitter {
  constructor(
    private readonly _ether: Ether,
    private readonly _name: 'a' | 'b',
  ) {
    super();
  }

  write(data: Buffer): boolean {
    if (!Buffer.isBuffer(data)) {
      throw new Error(`Invalid data`);
    }
    this._ether.write(this._name, data);
    return true;
  }

  disconnect(): void {
    this.emit('close');
  }

  destroy(): void {}
}

class Ether {
  private readonly _a: EtherStream;
  private readonly _b: EtherStream;

  private _ab: Buffer[];
  private _ba: Buffer[];

  public get a(): Socket {
    return <any>this._a;
  }

  public get b(): Socket {
    return <any>this._b;
  }

  constructor(private readonly _wireLatency = 0) {
    this._a = new EtherStream(this, 'a');
    this._b = new EtherStream(this, 'b');
    this._ab = [];
    this._ba = [];
  }

  public write(from: 'a' | 'b', data: Buffer): void {
    setTimeout(() => {
      if (from === 'a') {
        this._ab.push(data);
      } else {
        this._ba.push(data);
      }

      setTimeout(() => this._deliver(), 0);
    }, this._wireLatency);
  }

  private _deliver(): void {
    if (this._ab.length > 0) {
      const data = Buffer.concat(this._ab as unknown as readonly Uint8Array[]);
      this._ab.length = 0;
      this._b.emit('message', data);
      setTimeout(() => this._deliver(), 0);
      return;
    }

    if (this._ba.length > 0) {
      const data = Buffer.concat(this._ba as unknown as readonly Uint8Array[]);
      this._ba.length = 0;
      this._a.emit('message', data);
      setTimeout(() => this._deliver(), 0);
      return;
    }
  }
}

const socketEndTimeoutMs = 30_000;

export class NodeSocket implements ISocket {
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

describe('IPC, Socket Protocol', () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();

  let ether: Ether;

  beforeEach(() => {
    ether = new Ether();
  });

  it('read/write', async () => {
    const a = new Protocol(new NodeSocket(ether.a));
    const b = new Protocol(new NodeSocket(ether.b));
    const bMessages = new MessageStream(b);

    a.send(VSBuffer.fromString('foobarfarboo'));
    const msg1 = await bMessages.waitForOne();
    assert.strictEqual(msg1.toString(), 'foobarfarboo');

    const buffer = VSBuffer.alloc(1);
    buffer.writeUInt8(123, 0);
    a.send(buffer);
    const msg2 = await bMessages.waitForOne();
    assert.strictEqual(msg2.readUInt8(0), 123);

    bMessages.dispose();
    a.dispose();
    b.dispose();
  });

  it('read/write, object data', async () => {
    const a = new Protocol(new NodeSocket(ether.a));
    const b = new Protocol(new NodeSocket(ether.b));
    const bMessages = new MessageStream(b);

    const data = {
      pi: Math.PI,
      foo: 'bar',
      more: true,
      data: 'Hello World'.split(''),
    };

    a.send(VSBuffer.fromString(JSON.stringify(data)));
    const msg = await bMessages.waitForOne();
    assert.deepStrictEqual(JSON.parse(msg.toString()), data);

    bMessages.dispose();
    a.dispose();
    b.dispose();
  });

  it('issue #211462: destroy socket after end timeout', async () => {
    const socket = new EventEmitter();
    Object.assign(socket, { disconnect: () => socket.emit('close') });
    const protocol = ds.add(new Protocol(new NodeSocket(socket as any))); // Adjust type as necessary

    const disposed = vi.fn();
    vi.useFakeTimers();

    ds.add(toDisposable(() => vi.useRealTimers()));
    ds.add(protocol.onDidDispose(disposed));

    socket.emit('end');
    expect(disposed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(disposed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(disposed).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe('PersistentProtocol reconnection', () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  it('acks get piggybacked with messages', async () => {
    const ether = new Ether();
    const a = new PersistentProtocol({ socket: new NodeSocket(ether.a) });
    const aMessages = new MessageStream(a);
    const b = new PersistentProtocol({ socket: new NodeSocket(ether.b) });
    const bMessages = new MessageStream(b);

    a.send(VSBuffer.fromString('a1'));
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 0);

    a.send(VSBuffer.fromString('a2'));
    assert.strictEqual(a.unacknowledgedCount, 2);
    assert.strictEqual(b.unacknowledgedCount, 0);

    a.send(VSBuffer.fromString('a3'));
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);

    const a1 = await bMessages.waitForOne();
    assert.strictEqual(a1.toString(), 'a1');
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);

    const a2 = await bMessages.waitForOne();
    assert.strictEqual(a2.toString(), 'a2');
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);

    const a3 = await bMessages.waitForOne();
    assert.strictEqual(a3.toString(), 'a3');
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 0);

    b.send(VSBuffer.fromString('b1'));
    assert.strictEqual(a.unacknowledgedCount, 3);
    assert.strictEqual(b.unacknowledgedCount, 1);

    const b1 = await aMessages.waitForOne();
    assert.strictEqual(b1.toString(), 'b1');
    assert.strictEqual(a.unacknowledgedCount, 0);
    assert.strictEqual(b.unacknowledgedCount, 1);

    a.send(VSBuffer.fromString('a4'));
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 1);

    const b2 = await bMessages.waitForOne();
    assert.strictEqual(b2.toString(), 'a4');
    assert.strictEqual(a.unacknowledgedCount, 1);
    assert.strictEqual(b.unacknowledgedCount, 0);

    aMessages.dispose();
    bMessages.dispose();
    a.dispose();
    b.dispose();
  });

  it('ack gets sent after a while', async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
      const loadEstimator: ILoadEstimator = {
        hasHighLoad: () => false,
      };
      const ether = new Ether();
      const aSocket = new NodeSocket(ether.a);
      const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
      const aMessages = new MessageStream(a);
      const bSocket = new NodeSocket(ether.b);
      const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
      const bMessages = new MessageStream(b);

      // send one message A -> B
      a.send(VSBuffer.fromString('a1'));
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 0);
      const a1 = await bMessages.waitForOne();
      assert.strictEqual(a1.toString(), 'a1');
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 0);

      // wait for ack to arrive B -> A
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 0);
      assert.strictEqual(b.unacknowledgedCount, 0);

      aMessages.dispose();
      bMessages.dispose();
      a.dispose();
      b.dispose();
    });
  });

  it('messages that are never written to a socket should not cause an ack timeout', async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1000,
      },
      async () => {
        // Date.now() in fake timers starts at 0, which is very inconvenient
        // since we want to test exactly that a certain field is not initialized with Date.now()
        // As a workaround we wait such that Date.now() starts producing more realistic values
        await timeout(60 * 60 * 1000);

        const loadEstimator: ILoadEstimator = {
          hasHighLoad: () => false,
        };
        const ether = new Ether();
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator, sendKeepAlive: false });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator, sendKeepAlive: false });
        const bMessages = new MessageStream(b);

        // send message a1 before reconnection to get _recvAckCheck() scheduled
        a.send(VSBuffer.fromString('a1'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);

        // read message a1 at B
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), 'a1');
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);

        // send message b1 to send the ack for a1
        b.send(VSBuffer.fromString('b1'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);

        // read message b1 at A to receive the ack for a1
        const b1 = await aMessages.waitForOne();
        assert.strictEqual(b1.toString(), 'b1');
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 1);

        // begin reconnection
        aSocket.dispose();
        const aSocket2 = new NodeSocket(ether.a);
        a.beginAcceptReconnection(aSocket2, null);

        let timeoutListenerCalled = false;
        const socketTimeoutListener = a.onSocketTimeout(() => {
          timeoutListenerCalled = true;
        });

        // send message 2 during reconnection
        a.send(VSBuffer.fromString('a2'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);

        // wait for scheduled _recvAckCheck() to execute
        await timeout(2 * ProtocolConstants.TimeoutTime);

        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);
        assert.strictEqual(timeoutListenerCalled, false);

        a.endAcceptReconnection();
        assert.strictEqual(timeoutListenerCalled, false);

        await timeout(2 * ProtocolConstants.TimeoutTime);
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 0);
        assert.strictEqual(timeoutListenerCalled, false);

        socketTimeoutListener.dispose();
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      },
    );
  });

  it('acks are always sent after a reconnection', async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1000,
      },
      async () => {
        const loadEstimator: ILoadEstimator = {
          hasHighLoad: () => false,
        };
        const wireLatency = 1000;
        const ether = new Ether(wireLatency);
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
        const bMessages = new MessageStream(b);

        // send message a1 to have something unacknowledged
        a.send(VSBuffer.fromString('a1'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);

        // read message a1 at B
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), 'a1');
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);

        // wait for B to send an ACK message,
        // but resume before A receives it
        await timeout(ProtocolConstants.AcknowledgeTime + wireLatency / 2);
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);

        // simulate complete reconnection
        aSocket.dispose();
        bSocket.dispose();
        const ether2 = new Ether(wireLatency);
        const aSocket2 = new NodeSocket(ether2.a);
        const bSocket2 = new NodeSocket(ether2.b);
        b.beginAcceptReconnection(bSocket2, null);
        b.endAcceptReconnection();
        a.beginAcceptReconnection(aSocket2, null);
        a.endAcceptReconnection();

        // wait for quite some time
        await timeout(2 * ProtocolConstants.AcknowledgeTime + wireLatency);
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 0);

        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      },
    );
  });

  it('onSocketTimeout is emitted at most once every 20s', async () => {
    await runWithFakedTimers(
      {
        useFakeTimers: true,
        useSetImmediate: true,
        maxTaskCount: 1000,
      },
      async () => {
        const loadEstimator: ILoadEstimator = {
          hasHighLoad: () => false,
        };
        const ether = new Ether();
        const aSocket = new NodeSocket(ether.a);
        const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
        const aMessages = new MessageStream(a);
        const bSocket = new NodeSocket(ether.b);
        const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
        const bMessages = new MessageStream(b);

        // never receive acks
        b.pauseSocketWriting();

        // send message a1 to have something unacknowledged
        a.send(VSBuffer.fromString('a1'));

        // wait for the first timeout to fire
        await Event.toPromise(a.onSocketTimeout);

        let timeoutFiredAgain = false;
        const timeoutListener = a.onSocketTimeout(() => {
          timeoutFiredAgain = true;
        });

        // send more messages
        a.send(VSBuffer.fromString('a2'));
        a.send(VSBuffer.fromString('a3'));

        // wait for 10s
        await timeout(ProtocolConstants.TimeoutTime / 2);

        assert.strictEqual(timeoutFiredAgain, false);

        timeoutListener.dispose();
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
      },
    );
  });

  it('writing can be paused', async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
      const loadEstimator: ILoadEstimator = {
        hasHighLoad: () => false,
      };
      const ether = new Ether();
      const aSocket = new NodeSocket(ether.a);
      const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
      const aMessages = new MessageStream(a);
      const bSocket = new NodeSocket(ether.b);
      const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
      const bMessages = new MessageStream(b);

      // send one message A -> B
      a.send(VSBuffer.fromString('a1'));
      const a1 = await bMessages.waitForOne();
      assert.strictEqual(a1.toString(), 'a1');

      // ask A to pause writing
      b.sendPause();

      // send a message B -> A
      b.send(VSBuffer.fromString('b1'));
      const b1 = await aMessages.waitForOne();
      assert.strictEqual(b1.toString(), 'b1');

      // send a message A -> B (this should be blocked at A)
      a.send(VSBuffer.fromString('a2'));

      // wait a long time and check that not even acks are written
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 1);
      assert.strictEqual(b.unacknowledgedCount, 1);

      // ask A to resume writing
      b.sendResume();

      // check that B receives message
      const a2 = await bMessages.waitForOne();
      assert.strictEqual(a2.toString(), 'a2');

      // wait a long time and check that acks are written
      await timeout(2 * ProtocolConstants.AcknowledgeTime);
      assert.strictEqual(a.unacknowledgedCount, 0);
      assert.strictEqual(b.unacknowledgedCount, 0);

      aMessages.dispose();
      bMessages.dispose();
      a.dispose();
      b.dispose();
    });
  });
});

describe('IPC, create handle', () => {
  it('createRandomIPCHandle', { retry: 3 }, async () => {
    return testIPCHandle(createRandomIPCHandle());
  });

  it('createStaticIPCHandle', async () => {
    return testIPCHandle(createStaticIPCHandle(tmpdir(), 'test', '1.64.0'));
  });

  function testIPCHandle(handle: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const pipeName = createRandomIPCHandle();

      const server = createServer();

      server.on('error', () => {
        return new Promise(() => server.close(() => reject()));
      });

      server.listen(pipeName, () => {
        server.removeListener('error', reject);

        return new Promise(() => {
          server.close(() => resolve());
        });
      });
    });
  }
});
