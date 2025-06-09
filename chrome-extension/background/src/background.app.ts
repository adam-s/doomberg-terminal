import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { WindowsService, IWindowsService } from '@src/services/windows/windows.service';
import { IMathService, MathService } from '@src/services/math.service';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { getDocumentId, getInformation, getWindowId, sendErrorResponse } from '@src/utils/utils';
import {
  DocumentMessage,
  DocumentResponse,
  DOOMBERG_DISCONNECT,
  DOOMBERG_HELLO,
  DOOMBERG_MESSAGE,
  DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE,
  DOOMBERG_SIDE_PANEL_RELOAD,
} from '@shared/utils/message';
import { ISettingsService, SettingsService } from '@shared/services/settings.service';
import { MessageServer } from '@shared/ipc/message/MessageServer';
import { ISidePanelVisibilityService } from './services/sidePanelVisibility.service';
import { MessageServerManagerService } from './services/messageServerManager.service';

export class BackgroundApp extends Disposable {
  constructor() {
    super();
  }

  async start() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const instantiationService = await this.initServices();
    this.registerListeners();
  }

  async initServices(): Promise<InstantiationService> {
    // Initialize containers
    const serviceCollection = new ServiceCollection();
    const disposables = this._register(new DisposableStore());
    const instantiationService = new InstantiationService(serviceCollection, true);

    // Add all services registered in own file with
    const contributedServices = getSingletonServiceDescriptors();

    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    const settingsService = instantiationService.createInstance(SettingsService);
    serviceCollection.set(ISettingsService, settingsService);

    // Message Server
    const messageServer = new MessageServer(`documentId:service-worker`);
    instantiationService.createInstance(MessageServerManagerService).start();

    const settingsServiceChannel = ProxyChannel.fromService(settingsService, disposables);
    messageServer.registerChannel('settingsService', settingsServiceChannel);

    // windows service
    const windowsService = new WindowsService();
    serviceCollection.set(IWindowsService, windowsService);

    const mathService = instantiationService.createInstance(MathService);
    serviceCollection.set(IMathService, mathService);

    // Provide access to accessor for services that need configuration to instantiate
    instantiationService.invokeFunction(async accessor => {
      accessor.get(ISidePanelVisibilityService);
      const windowsService = accessor.get(IWindowsService);
      windowsService.start();

      const mathServiceChannel = ProxyChannel.fromService(mathService, disposables);
      messageServer.registerChannel('mathService', mathServiceChannel);
    });

    return instantiationService;
  }

  registerListeners() {
    chrome.runtime.onMessage.addListener(
      (
        message: DocumentMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: DocumentResponse) => void,
      ) => {
        if (!message?.type) {
          sendErrorResponse('Invalid message format', sendResponse);
          return false;
        }

        switch (message.type) {
          case 'doomberg:requestDocumentId':
            getDocumentId(sender)
              .then(documentId => {
                sendResponse({ documentId });
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'doomberg:requestWindowId':
            getWindowId(sender)
              .then(windowId => {
                sendResponse({ windowId });
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'doomberg:requestInformation':
            getInformation(sender)
              .then(info => {
                sendResponse(info);
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'doomberg:console.log':
            console.log('console.log ', message, sender);
            return false;

          case DOOMBERG_HELLO:
          case DOOMBERG_MESSAGE:
          case DOOMBERG_DISCONNECT:
          case DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE:
          case DOOMBERG_SIDE_PANEL_RELOAD:
            return false;

          default:
            sendErrorResponse(
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              `Unknown message type: ${message.type}`,
              sendResponse,
            );
            return false;
        }
      },
    );
  }
}
