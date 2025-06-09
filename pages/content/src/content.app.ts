import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { createDocumentId, requestInformation, requestWindowId } from '@shared/utils/utils';
import { ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { Server } from '@shared/ipc/server';
import { createPortEvent } from './ipc/createPortEvent';
import { IRequestService } from '@shared/services/request.service';
import { ISettingsService, SidePanelStatusEvent } from '@shared/services/settings.service';
import { Event } from 'vs/base/common/event';
import { MessageClient } from '@shared/ipc/message/MessageClient';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MathService } from '@shared/services/math.service';

export interface ISidePanelState {
  isSidePanelOpen: () => Promise<boolean>;
  onDidSidePanelOpenOrClose: Event<SidePanelStatusEvent>;
}

const createSidePanelState = (
  settingsService: ISettingsService,
  windowId: number,
): ISidePanelState => {
  return {
    isSidePanelOpen: async (): Promise<boolean> => {
      return settingsService.isSidePanelOpen(windowId);
    },

    onDidSidePanelOpenOrClose: Event.filter(
      settingsService.onDidSidePanelOpenOrClose,
      (e: SidePanelStatusEvent) => e.windowId === windowId,
    ),
  };
};

export interface IContentConfiguration {}

export class ContentApp extends Disposable {
  private _documentId!: string;

  private _windowId!: number;

  private _sidePanelDisposables = new DisposableStore();

  private _sidePanelInstantiationService: IInstantiationService | undefined;

  constructor(private readonly configuration: IContentConfiguration) {
    super();
  }

  get documentId() {
    return this._documentId;
  }

  get windowId() {
    return this._windowId;
  }

  // Because constructors can't be async, we need to call this method after creating the instance.
  async start() {
    this._windowId = await requestWindowId();

    const tabInfo = await requestInformation();

    this._documentId = createDocumentId(
      tabInfo.documentId!,
      tabInfo.windowId,
      tabInfo.tabId,
      tabInfo.frameId,
    );

    // Register listeners first
    await this.registerListeners();

    const instantiationService = await this.initServices();
    await this.manageSidePanel(instantiationService);
  }

  async registerListeners() {
    // Maybe we have to be more aggressive with the dispose

    // Add beforeunload event listener
    window.addEventListener('beforeunload', () => {
      this.dispose();
    });
  }

  async initServices() {
    const serviceCollection = new ServiceCollection();

    // Instantiate the services
    const instantiationService = new InstantiationService(serviceCollection, true);

    // All Contributed Services
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    // Register serviceWorkerMessageClient as a disposable
    const serviceWorkerMessageClient = this._register(
      new MessageClient(`documentId:${this.documentId}`, 'documentId:service-worker'),
    );

    const settingsService = ProxyChannel.toService<ISettingsService>(
      serviceWorkerMessageClient.getChannel('settingsService'),
    );
    serviceCollection.set(ISettingsService, settingsService);

    settingsService.onDidChangeActive(value => {
      console.log('settingsService.onDidChangeActive: ', value);
    });

    // MAIN Server
    const onCreateMessageChannel = createPortEvent();
    const MAINServer = this._register(new Server(onCreateMessageChannel));

    const mainContentRouter = new StaticRouter(() => true);
    const requestService = ProxyChannel.toService<IRequestService>(
      MAINServer.getChannel('requestService', mainContentRouter),
    );
    serviceCollection.set(IRequestService, requestService);

    return instantiationService;
  }

  async manageSidePanel(instantiationService: InstantiationService) {
    const disposables = this._sidePanelDisposables;
    const serviceCollection = new ServiceCollection();
    const [settingsService] = await new Promise<[ISettingsService]>(resolve =>
      instantiationService.invokeFunction(accessor => {
        const settingsService = accessor.get(ISettingsService);
        serviceCollection.set(ISettingsService, settingsService);

        const requestService = accessor.get(IRequestService);
        serviceCollection.set(IRequestService, requestService);

        resolve([settingsService]);
      }),
    );

    const sidePanelState = createSidePanelState(settingsService, this.windowId);

    if (await sidePanelState.isSidePanelOpen()) {
      this._sidePanelInstantiationService = await this.initSidePanelServices(
        instantiationService,
        disposables,
      );
    } else {
      disposables.clear();
    }

    sidePanelState.onDidSidePanelOpenOrClose(async event => {
      if (event.status === 'open') {
        if (!this._sidePanelInstantiationService) {
          this._sidePanelInstantiationService = await this.initSidePanelServices(
            instantiationService,
            disposables,
          );
        }
      } else {
        this._sidePanelInstantiationService?.dispose();
        this._sidePanelInstantiationService = undefined;
        disposables.clear();
      }
    });
  }

  async initSidePanelServices(
    instantiationService: InstantiationService,
    disposables: DisposableStore,
  ): Promise<IInstantiationService> {
    const serviceCollection = new ServiceCollection();
    const sidePanelInstantiationService = disposables.add(
      instantiationService.createChild(serviceCollection),
    );
    const sidePanelMessageClient = disposables.add(
      new MessageClient(
        `documentId:${this.documentId}`,
        `documentId:side-panel:content:${this.windowId}`,
      ),
    );

    sidePanelInstantiationService.invokeFunction(accessor => {
      const requestService = accessor.get(IRequestService);

      const requestServiceChannel = ProxyChannel.fromService(requestService, disposables);

      sidePanelMessageClient.registerChannel('requestService', requestServiceChannel);

      const mathService = sidePanelInstantiationService.createInstance(MathService);
      const mathServiceChannel = ProxyChannel.fromService(mathService, disposables);

      sidePanelMessageClient.registerChannel('mathService', mathServiceChannel);
    });

    return sidePanelInstantiationService;
  }

  dispose(): void {
    super.dispose();
    this._sidePanelDisposables.dispose();
  }
}
