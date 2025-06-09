// filepath: /Users/adamsohn/Projects/robbin-da-hood-2/pages/content-injected/src/content-injected.app.ts
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITextContextService, TextContextService } from '@shared/services/text-context.service';
import { MessageClient } from '@shared/ipc/message/MessageClient';
import { createDocumentId, requestInformation, requestWindowId } from '@shared/utils/utils';

export interface IContentInjectedConfiguration {}

export class ContentInjectedApp extends Disposable {
  private _documentId!: string;

  private _windowId!: number;

  constructor(private readonly configuration: IContentInjectedConfiguration) {
    super();
  }

  get documentId(): string {
    return this._documentId;
  }

  get windowId(): number {
    return this._windowId;
  }

  // Because constructors can't be async, we need to call this method after creating the instance.
  async start(): Promise<void> {
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

    // Initialize side panel services for text context
    const disposables = this._register(new DisposableStore());
    await this.initSidePanelServices(instantiationService, disposables);
  }

  async registerListeners(): Promise<void> {
    // Add beforeunload event listener for proper cleanup
    window.addEventListener('beforeunload', () => {
      this.dispose();
    });
  }

  async initServices(): Promise<InstantiationService> {
    const serviceCollection = new ServiceCollection();
    // Instantiate the services
    const instantiationService = new InstantiationService(serviceCollection, true);

    // All Contributed Services
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    // Register the TextContextService
    serviceCollection.set(ITextContextService, new SyncDescriptor(TextContextService));

    return instantiationService;
  }

  async initSidePanelServices(
    instantiationService: InstantiationService,
    disposables: DisposableStore,
  ): Promise<InstantiationService> {
    const serviceCollection = new ServiceCollection();
    const sidePanelInstantiationService = disposables.add(
      instantiationService.createChild(serviceCollection),
    );

    const sidePanelMessageClient = disposables.add(
      new MessageClient(
        `documentId:${this.documentId}`,
        `documentId:side-panel:content-injected:${this._windowId}`,
      ),
    );

    sidePanelInstantiationService.invokeFunction(accessor => {
      const textContextService = accessor.get(ITextContextService);

      // Register the service channel
      const textContextServiceChannel = ProxyChannel.fromService(textContextService, disposables);
      sidePanelMessageClient.registerChannel('textContextService', textContextServiceChannel);
    });

    return sidePanelInstantiationService as InstantiationService;
  }
}
