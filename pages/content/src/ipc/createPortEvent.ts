// pages/content/src/ipc/createPortEvent.ts

import {
  HelloMessage,
  InitializeContentScriptMessage,
  RobindaHoodMessage,
} from '@shared/utils/main';
import { Port } from '@shared/ipc/protocol';
import { Emitter, Event } from 'vs/base/common/event';

export function createPortEvent(): Event<{ port: Port; id: string }> {
  const onCreateMessageChannel = new Emitter<{ port: Port; id: string }>();

  window.addEventListener('message', (event: MessageEvent) => {
    // Only accept messages from the same frame
    if (event.source !== window) {
      return;
    }

    const message = event.data as RobindaHoodMessage;

    if (message.type === 'doomberg:createMAINPort' && event.ports.length > 0) {
      const port2 = event.ports[0];
      const port: Port = {
        name: message.type,
        postMessage: (msg: RobindaHoodMessage) => {
          return port2.postMessage(msg);
        },
        disconnect: () => port2.close(),
        onMessage: {
          addListener: (callback: (msg: RobindaHoodMessage) => void) => {
            port2.onmessage = (event: MessageEvent) => {
              return callback(event.data);
            };
          },
        },
        onDisconnect: {
          addListener: (callback: () => void) => {
            port2.onmessageerror = () => callback();
          },
        },
      };
      onCreateMessageChannel.fire({ port, id: message.id });
      port2.postMessage({ type: 'doomberg:hello' } as HelloMessage);
    }
  });

  // Send initialize event
  const initializeMessage: InitializeContentScriptMessage = {
    type: 'doomberg:initializeContentScript',
  };
  window.postMessage(initializeMessage, '*');

  return onCreateMessageChannel.event;
}
