import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { IPCClientService } from '@shared/ipc/ipc-client.service';
import { createMainWorldPort } from '../../../packages/shared/src/ipc/createMainWorldPort';
import { IMainProcessService } from '@shared/ipc/client.service';
import { generateUuid } from 'vs/base/common/uuid';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IInterceptorService, InterceptorService } from './services/interceptor.service';
import { IRequestService, RequestService } from '@shared/services/request.service';
// import { ILogService } from '@shared/services/log.service';

export interface IContentMainConfiguration {}

export class ContentMainApp extends Disposable {
  private _documentId = generateUuid();

  constructor(private readonly configuration: IContentMainConfiguration) {
    super();
  }

  get documentId() {
    return this._documentId;
  }

  // Because constructors can't be async, we need to call this method after creating the instance.
  async start() {
    // Register listeners first
    await this.registerListeners();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const instantiationService = await this.initServices();
  }

  async registerListeners() {}

  async initServices() {
    const serviceCollection = new ServiceCollection();
    // Instantiate the services
    const instantiationService = new InstantiationService(serviceCollection, true);

    const disposables = this._register(new DisposableStore());

    // All Contributed Services
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }
    const ipcClientService = this._register(
      new IPCClientService(this.documentId, await createMainWorldPort(this.documentId)),
    );
    serviceCollection.set(IMainProcessService, ipcClientService);

    const interceptorService = this._register(new InterceptorService());
    serviceCollection.set(IInterceptorService, interceptorService);

    const requestService = this._register(instantiationService.createInstance(RequestService));
    serviceCollection.set(IRequestService, requestService);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    instantiationService.invokeFunction(async accessor => {
      // Expose the request service to IPC
      const requestServiceChannel = ProxyChannel.fromService(requestService, disposables);
      ipcClientService.registerChannel('requestService', requestServiceChannel);
    });

    return instantiationService;
  }
}
