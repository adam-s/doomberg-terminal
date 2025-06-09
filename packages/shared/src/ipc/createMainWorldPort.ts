// pages/content-main/src/ipc/createPort.ts

import { CreateMainPortMessage, RobindaHoodMessage } from '@shared/utils/main';
import { Port } from '@shared/ipc/protocol';

export async function createMainWorldPort(id: string): Promise<() => Port> {
  const { port1, port2 } = new MessageChannel();

  // Wait for server to initialize
  await new Promise<void>(resolve => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const message = event.data as RobindaHoodMessage;
      if (message.type === 'doomberg:initializeContentScript') {
        window.removeEventListener('message', handler);
        resolve();
      }
    };
    window.addEventListener('message', handler);
  });

  // Send create port message
  const createPortMessage: CreateMainPortMessage = {
    type: 'doomberg:createMAINPort',
    id,
  };
  window.postMessage(createPortMessage, '*', [port2]);

  // Wait for server response
  await new Promise<void>(resolve => {
    port1.onmessage = (event: MessageEvent) => {
      const message = event.data as RobindaHoodMessage;
      if (message.type === 'doomberg:hello') {
        port1.onmessage = null;
        resolve();
      }
    };
  });

  return () => ({
    name: 'doomberg:createMAINPort',
    postMessage: (msg: RobindaHoodMessage) => port1.postMessage(msg),
    disconnect: () => port1.close(),
    onMessage: {
      addListener: (callback: (msg: RobindaHoodMessage) => void) => {
        port1.onmessage = (event: MessageEvent) => callback(event.data);
      },
    },
    onDisconnect: {
      addListener: () => {
        // Implement if needed
      },
    },
  });
}
