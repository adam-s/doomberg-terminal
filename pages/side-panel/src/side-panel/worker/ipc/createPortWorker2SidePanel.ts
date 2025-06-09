import { Emitter, Event } from 'vs/base/common/event';
import { Port } from '@shared/ipc/protocol';

interface CreateWorkerPortMessage {
  type: 'doomberg:createWorkerPort';
  idBuffer: SharedArrayBuffer;
}
interface WorkerHelloMessage {
  type: 'doomberg:workerHello';
}

export function createPortWorker2SidePanel(): Event<{ port: Port; id: string }> {
  const onPort = new Emitter<{ port: Port; id: string }>();

  const listener = (event: MessageEvent) => {
    const msg = event.data as CreateWorkerPortMessage;

    if (msg && msg.type === 'doomberg:createWorkerPort' && event.ports?.length) {
      const port2 = event.ports[0];

      if (!msg.idBuffer || !(msg.idBuffer instanceof SharedArrayBuffer)) {
        console.error(
          '[Worker] CRITICAL: msg.idBuffer is not a valid SharedArrayBuffer at the point of use!',
          'Actual value:',
          msg.idBuffer,
        );
        return;
      }

      try {
        const sharedView = new Uint8Array(msg.idBuffer);
        const idBytes = new Uint8Array(sharedView);
        const id = new TextDecoder().decode(idBytes);

        const hello: WorkerHelloMessage = { type: 'doomberg:workerHello' };
        port2.postMessage(hello);

        const wrapped: Port = {
          name: 'workerToSidePanel',
          postMessage: m => port2.postMessage(m),
          disconnect: () => port2.close(),
          onMessage: {
            addListener: cb => (port2.onmessage = e => cb(e.data)),
            removeListener: () => (port2.onmessage = null),
          },
          onDisconnect: {
            addListener: () => {},
            removeListener: () => {},
          },
        };

        onPort.fire({ port: wrapped, id });
        // self.removeEventListener('message', listener); // Consider if this is still needed or if the Emitter handles one-time listening
      } catch (error) {
        console.error(
          '[Worker] Error processing SharedArrayBuffer or setting up port:',
          error,
          'msg.idBuffer was:',
          msg.idBuffer,
        );
      }
    }
  };

  self.addEventListener('message', listener);
  return onPort.event;
}
