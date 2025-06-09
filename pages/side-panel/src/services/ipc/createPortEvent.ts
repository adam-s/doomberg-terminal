import { Port } from '@shared/ipc/protocol';
import { Emitter, Event } from 'vs/base/common/event';
import { createDocumentId } from '@shared/utils/utils';

export function createPortEvent(): Event<{ port: Port; id: string }> {
  const onCreateMessageChannel = new Emitter<{ port: Port; id: string }>();

  chrome.runtime.onConnect.addListener(async (port: chrome.runtime.Port) => {
    if (port.name.startsWith('doomberg:side-panel')) {
      const id =
        'documentId:' +
        createDocumentId(
          port.sender?.documentId || '',
          port.sender?.tab?.windowId,
          port.sender?.tab?.id,
          port.sender?.frameId,
        );
      onCreateMessageChannel.fire({ port: port as unknown as Port, id });
    }
  });

  return onCreateMessageChannel.event;
}
