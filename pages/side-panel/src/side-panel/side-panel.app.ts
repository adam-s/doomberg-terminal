// External libraries
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Disposable } from 'vs/base/common/lifecycle';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

// Shared services and utilities
import { ILogService, LogService } from '@shared/services/log.service';
import { ISettingsService } from '@shared/services/settings.service';
import { IRequestService } from '@shared/services/request.service';
import { MessageClient } from '@shared/ipc/message/MessageClient';
import { MessageServer } from '@shared/ipc/message/MessageServer';
import { DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE } from '@shared/utils/message';
import { IPCClientService } from '@shared/ipc/ipc-client.service';
import { RemoteMessageClient } from '@shared/ipc/remoteMessage/RemoteMessageClient';
import { INewsService, NewsService } from '@shared/features/news/news.service';
import { NewsDataAccessObject } from '@shared/features/news/NewsDataAccessObject';
import {
  ICalendarService as ISharedCalendarService,
  CalendarService as SharedCalendarService,
} from '@shared/features/calendar/calendar.service';
import { CalendarDataAccessObject } from '@shared/features/calendar/CalendarDataAccessObject';
import {
  ILocalAsyncStorage,
  LocalAsyncStorageService,
} from '@doomberg-terminal/shared/src/storage/localAsyncStorage/localAsyncStorage.service';

// Local services
import { renderSidePanel } from '@src/side-panel/index';
import { DataService, IDataService } from '@src/services/data.service';
import { ITraderService, TraderService } from '../services/trader/trader.service';
import {
  ISidePanelMachineService,
  SidePanelMachineService,
} from '../services/sidePanelMachine.service';
import { SocketClientFactory } from '@doomberg-terminal/shared/src/ipc/remoteMessage/SocketClientFactory';
import { IRemoteMarketDataService } from '@doomberg-terminal/shared/src/serviceContracts/remoteMarketData.service';
import {
  TradeSimulatorService,
  ITradeSimulatorService,
} from '@src/services/simulators/tradeSimulator/tradeSimulator.service';
import { ITimerService, TimerService } from '@src/services/timer.service';
import { RequestProxyService } from '@src/services/requestProxy/requestProxy.service';
import {
  ITradingGameService,
  TradingGameService,
} from '@src/services/tradingGame/tradingGame.service';
import { IAppNewsService, AppNewsService } from '@src/services/news/appNews.service';
import { IChatService, ChatService } from '@src/services/chat/chat.service'; // Added import
import { IChatGPTService, ChatGPTService } from '@src/services/chat/chatgpt.service';
import { ITabService, TabService } from '@src/services/utils/TabService';

// Worker-related imports
import { createPortSidePanel2Worker } from './worker/ipc/createPortSidePanel2Worker';
import { IComputationService } from './worker/computation/computationService';
import { IASR_SERVICE_ID, IAsrService } from './worker/asr/asr.service';
import {
  IMAGE_TO_TEXT_SERVICE_ID,
  IImageToTextService,
} from './worker/imageToText/imageToText.service';

import { createAppDatabase } from '@shared/storage/dexie/createAppDatabase';
import {
  ITextToTextService,
  TEXT_TO_TEXT_SERVICE_ID,
} from './worker/textToText.ts/textToText.service';
import { ITextContextService } from '@shared/services/text-context.service';
import {
  ExtensionClientLifecycle,
  IExtensionClientLifecycle,
} from '@src/services/utils/ExtensionClientLifecycle';
import { IConnectionManager, ConnectionManager } from '@shared/ipc/message/ConnectionManger';

export interface ISidePanelConfiguration {}

// Define a basic schema for your local async storage
// You can expand this with specific keys and types as needed
interface SidePanelStorageSchema {
  [key: string]: unknown;
  // Example: openAiApiKey?: string;
}
export class SidePanelApp extends Disposable {
  private _windowId!: number;

  private _textContextInterval?: NodeJS.Timeout;

  constructor(private readonly configuration: ISidePanelConfiguration) {
    super();
    this._registerListeners();
    setTimeout(() => {
      this._sendReloadMessageToContentScripts;
    }, 200);
  }

  get windowId() {
    return this._windowId;
  }

  // Because constructors can't be async, we need to call this method
  // after creating the instance.
  async start() {
    this._windowId = await new Promise(resolve =>
      chrome.windows.getCurrent(window => resolve(window.id!)),
    );

    try {
      const instantiationService = await this._initServices();
      renderSidePanel(instantiationService);
    } catch (error) {
      console.log(error);
    }
  }

  private async _initServices() {
    const serviceCollection = new ServiceCollection();
    const instantiationService = new InstantiationService(serviceCollection, true);

    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    // Register the database
    const db = createAppDatabase([NewsDataAccessObject.plugin, CalendarDataAccessObject.plugin]);

    // Register ILogService
    const logService = instantiationService.createInstance(LogService);
    serviceCollection.set(ILogService, logService);

    // Register LocalAsyncStorageService
    const localAsyncStorageService = this._register(
      instantiationService.createInstance(LocalAsyncStorageService<SidePanelStorageSchema>),
    );
    serviceCollection.set(ILocalAsyncStorage, localAsyncStorageService);
    await localAsyncStorageService.start();

    // Register NewsDataAccessObject and NewsService
    const newsDAO = new NewsDataAccessObject(db);
    const newsService = new NewsService(logService, newsDAO);
    serviceCollection.set(INewsService, newsService);

    // Register CalendarDataAccessObject and SharedCalendarService
    const calendarDAO = new CalendarDataAccessObject(db);
    const sharedCalendarService = new SharedCalendarService(logService, calendarDAO);
    serviceCollection.set(ISharedCalendarService, sharedCalendarService);

    // Register the TimerService
    const timerService = this._register(instantiationService.createInstance(TimerService));
    serviceCollection.set(ITimerService, timerService);

    const messageClient = new MessageClient( // Message Client
      `documentId:side-panel:${this.windowId}`,
      'documentId:service-worker',
    );

    const settingsService = ProxyChannel.toService<ISettingsService>(
      messageClient.getChannel('settingsService'),
    );

    serviceCollection.set(ISettingsService, settingsService);
    settingsService.setSidePanelStatus(true, this.windowId); // Set the side panel to open immediately

    const sidePanelMachineService = this._register(
      instantiationService.createInstance(SidePanelMachineService),
    );
    serviceCollection.set(ISidePanelMachineService, sidePanelMachineService);

    // #region Content Script
    const channelId = `documentId:side-panel:content:${this.windowId}`;
    const server = new MessageServer(channelId);

    const contentRouter = new StaticRouter(() => true);

    // Instantiate and register TabService
    const tabService = this._register(instantiationService.createInstance(TabService));
    serviceCollection.set(ITabService, tabService);

    // Get the original request service
    const originalRequestService = ProxyChannel.toService<IRequestService>(
      server.getChannel('requestService', contentRouter),
    );

    // Register ExtensionClientLifecycle service
    serviceCollection.set(IExtensionClientLifecycle, new SyncDescriptor(ExtensionClientLifecycle));

    // Register ConnectionManager service
    serviceCollection.set(IConnectionManager, new SyncDescriptor(ConnectionManager));

    // #region Content Injected Script
    const serverChannelId = `documentId:side-panel:content-injected:${this.windowId}`;
    const textContextServer = new MessageServer(serverChannelId);
    // Create connection manager using instantiation service
    const connectionManager = instantiationService.createInstance(
      ConnectionManager,
      textContextServer,
    );
    serviceCollection.set(IConnectionManager, connectionManager);

    // Register TextContextService from content-injected context
    const textContextServiceProxy = ProxyChannel.toService<ITextContextService>(
      textContextServer.getChannel('textContextService', new StaticRouter(() => true)),
    );
    serviceCollection.set(ITextContextService, textContextServiceProxy);

    const chatGptServiceInstance = this._register(
      instantiationService.createInstance(ChatGPTService),
    );
    serviceCollection.set(IChatGPTService, chatGptServiceInstance);

    // #region Remote Server
    // Socket client connection still uses port 3001 (default from SocketFactory)
    const socket = SocketClientFactory.createClientSocket();

    // Create remote message client with the socket
    const remoteMessageClient = new RemoteMessageClient(
      `documentId:side-panel:${this.windowId}`,
      'documentId:remote',
      socket,
    );

    // Register RemoteMarketData service
    const remoteMarketDataService = ProxyChannel.toService<IRemoteMarketDataService>(
      remoteMessageClient.getChannel('remoteMarketDataService'),
    );
    serviceCollection.set(IRemoteMarketDataService, remoteMarketDataService);

    // Create the request proxy service using instantiation service
    const requestService = new SyncDescriptor(RequestProxyService, [
      originalRequestService,
      remoteMarketDataService,
      logService,
    ]);

    // Register the proxy instead of the original service
    serviceCollection.set(IRequestService, requestService);

    const dataService = this._register(instantiationService.createInstance(DataService));
    serviceCollection.set(IDataService, dataService);
    await dataService.start();

    const traderService = this._register(instantiationService.createInstance(TraderService));
    serviceCollection.set(ITraderService, traderService);

    // Register TradingGameService
    const tradingGameService = this._register(
      instantiationService.createInstance(TradingGameService),
    );
    serviceCollection.set(ITradingGameService, tradingGameService);

    const tradeSimulatorService = await this._register(
      instantiationService.createInstance(TradeSimulatorService),
    ).start();
    serviceCollection.set(ITradeSimulatorService, tradeSimulatorService);

    //#region workers
    // --- Web Worker Integration ---
    const worker = new Worker(new URL('./worker/worker.ts', import.meta.url), { type: 'module' });
    const makePort = await createPortSidePanel2Worker(worker);
    const workerIpcClient = new IPCClientService('side-panel-worker', makePort);

    // --- ASR Worker Integration ---
    const asrWorker = new Worker(new URL('./worker/workerASR.ts', import.meta.url), {
      type: 'module',
    });
    const makeAsrPort = await createPortSidePanel2Worker(asrWorker);
    const asrWorkerIpcClient = new IPCClientService('side-panel-asr-worker', makeAsrPort);

    // --- ImageToText Worker Integration ---
    const imageToTextWorker = new Worker(
      new URL('./worker/workerImageToText.ts', import.meta.url),
      { type: 'module' },
    );
    const makeImageToTextPort = await createPortSidePanel2Worker(imageToTextWorker);
    const imageToTextWorkerIpcClient = new IPCClientService(
      'side-panel-image-to-text-worker',
      makeImageToTextPort,
    );

    // --- TextToText Worker Integration ---
    const textToTextWorker = new Worker(new URL('./worker/workerTextToText.ts', import.meta.url), {
      type: 'module',
    });
    const makeTextToTextPort = await createPortSidePanel2Worker(textToTextWorker);
    const textToTextWorkerIpcClient = new IPCClientService(
      'side-panel-text-to-text-worker',
      makeTextToTextPort,
    );

    // Register ASR Service from ASR worker IPC
    const asrService = ProxyChannel.toService<IAsrService>(
      asrWorkerIpcClient.getChannel(IASR_SERVICE_ID),
    );
    serviceCollection.set(IAsrService, asrService);

    // Register ImageToText Service from ImageToText worker IPC
    const imageToTextService = ProxyChannel.toService<IImageToTextService>(
      imageToTextWorkerIpcClient.getChannel(IMAGE_TO_TEXT_SERVICE_ID),
    );
    serviceCollection.set(IImageToTextService, imageToTextService);

    // Register TextToText Service from TextToText worker IPC
    const textToTextService = ProxyChannel.toService<ITextToTextService>(
      textToTextWorkerIpcClient.getChannel(TEXT_TO_TEXT_SERVICE_ID),
    );
    serviceCollection.set(ITextToTextService, textToTextService);

    // Register ComputationService from worker IPC
    const computationService = ProxyChannel.toService<IComputationService>(
      workerIpcClient.getChannel(IComputationService.toString()),
    );
    serviceCollection.set(IComputationService, computationService);

    // Instantiate and register the new AppNewsService
    const appNewsService = this._register(instantiationService.createInstance(AppNewsService));
    serviceCollection.set(IAppNewsService, appNewsService);

    // Instantiate and register ChatService
    const chatService = this._register(instantiationService.createInstance(ChatService));
    serviceCollection.set(IChatService, chatService);

    // Handle Worker lifecycle (optional but recommended)
    this._register({ dispose: () => worker.terminate() });
    this._register({ dispose: () => asrWorker.terminate() });
    this._register({ dispose: () => imageToTextWorker.terminate() });
    this._register({ dispose: () => textToTextWorker.terminate() });
    return instantiationService;
  }

  private _sendReloadMessageToContentScripts(): void {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'DOOMBERG_SIDE_PANEL_RELOAD' }).catch(() => {
            // Ignore errors for tabs that don't have content scripts
          });
        }
      });
    });
  }

  private _registerListeners(): void {
    document.addEventListener('visibilitychange', () => {
      const listener = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message: any,
        _: chrome.runtime.MessageSender,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendResponse: (response?: any) => void,
      ) => {
        if (message.type === `doomberg:sidePanelVisibilityChangeTest:${this.windowId}`) {
          setTimeout(() => {
            sendResponse();
          }, 100);
          chrome.runtime.onMessage.removeListener(listener);
          return true;
        }
        return false;
      };
      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime
        .sendMessage({
          type: DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE,
          windowId: this.windowId,
        })
        .catch(error => {
          console.log('sending visibility message error: ', error);
        });
    });
  }
}
