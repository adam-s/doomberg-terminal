import { Port } from '@shared/ipc/protocol';
interface CreateWorkerPortMessage {
  type: 'doomberg:createWorkerPort';
  idBuffer: SharedArrayBuffer;
}

export async function createPortSidePanel2Worker(worker: Worker): Promise<(id: string) => Port> {
  return (id: string) => {
    const { port1, port2 } = new MessageChannel();

    const encoder = new TextEncoder();
    const idBytes = encoder.encode(id);
    const sharedBuffer = new SharedArrayBuffer(idBytes.byteLength);
    new Uint8Array(sharedBuffer).set(idBytes);

    const msg: CreateWorkerPortMessage = {
      type: 'doomberg:createWorkerPort',
      idBuffer: sharedBuffer,
    };

    try {
      worker.postMessage(msg, [port2]);
    } catch (error) {
      console.error('[Side Panel] Error during worker.postMessage:', error);
    }

    port1.start();
    port2.start();

    return {
      name: 'sidePanelToWorker',
      postMessage: m => port1.postMessage(m),
      disconnect: () => port1.close(),
      onMessage: {
        addListener: cb => (port1.onmessage = e => cb(e.data)),
        removeListener: () => (port1.onmessage = null),
      },
      onDisconnect: {
        addListener: () => {},
        removeListener: () => {},
      },
    };
  };
}
