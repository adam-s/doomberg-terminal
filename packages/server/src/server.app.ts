import { type HttpLogger } from 'pino-http';
import { Server as HTTPServer } from 'http';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from '@shared/services/log.service';
import { IApplicationService, ApplicationService } from '@src/services/application.service';
import { IMathService } from '@shared/services/math.service';
import { ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { DataService, IDataService } from './services/data.service';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IRequestService } from '@shared/services/request.service';
import { IRemoteMarketDataService } from '@shared/serviceContracts/remoteMarketData.service';
import { RemoteMessageServer } from '@shared/ipc/remoteMessage/RemoteMessageServer';
import { RemoteMarketDataService } from './services/marketData/remoteMarketData.service';
import { DatabaseService, IDatabaseService } from './services/database/database.service';

export interface IServerConfiguration {
  server: HTTPServer;
  logger: HttpLogger['logger'];
}

export interface IServerApp {
  start(): Promise<void>;
}

export class ServerApp extends Disposable implements IServerApp {
  static createWebsocketServer() {}

  constructor(private readonly _configuration: IServerConfiguration) {
    super();
  }

  async start() {
    await this._registerListeners();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const instantiationService = await this._initServices();
  }

  close() {
    super.dispose();
  }

  async _registerListeners() {}

  async _initServices(): Promise<InstantiationService> {
    const serviceCollection = new ServiceCollection();
    const disposables = this._register(new DisposableStore());
    const instantiationService = new InstantiationService(serviceCollection, true);

    const contributedServices = getSingletonServiceDescriptors();

    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    // Application Service
    const applicationService = new ApplicationService(
      this._configuration.server,
      this._configuration.logger,
    );
    serviceCollection.set(IApplicationService, applicationService);

    // Register DatabaseService first since other services depend on it
    const databaseService = new SyncDescriptor(DatabaseService);
    serviceCollection.set(IDatabaseService, databaseService);

    // Test database connection after registration
    try {
      const dbService = instantiationService.invokeFunction(accessor =>
        accessor.get(IDatabaseService),
      );
      await dbService.testConnection();
      this._configuration.logger.info('Database connection established successfully');
    } catch (error) {
      this._configuration.logger.error('Failed to initialize database:', error);
      throw error;
    }

    // Register RemoteMarketDataService after DatabaseService
    const remoteMarketDataService = new SyncDescriptor(RemoteMarketDataService);
    serviceCollection.set(IRemoteMarketDataService, remoteMarketDataService);

    // Data Service
    const dataService = new SyncDescriptor(DataService);
    serviceCollection.set(IDataService, dataService);

    instantiationService.invokeFunction(accessor => {
      const logService = accessor.get(ILogService);
      logService.debug('Core services initialized');
    });

    // Create message server for IPC
    const messageServer = new RemoteMessageServer(
      `documentId:remote`,
      RemoteMessageServer.createServer(this._configuration.server),
    );

    const requestService = ProxyChannel.toService<IRequestService>(
      messageServer.getChannel('requestService', new StaticRouter(() => true)),
    );
    serviceCollection.set(IRequestService, requestService);

    // Get the RemoteMarketDataService instance and register its channel
    const remoteMarketDataServiceInstance = instantiationService.invokeFunction(accessor =>
      accessor.get(IRemoteMarketDataService),
    );
    const remoteMarketDataServiceChannel = ProxyChannel.fromService(
      remoteMarketDataServiceInstance,
      disposables,
    );
    messageServer.registerChannel('remoteMarketDataService', remoteMarketDataServiceChannel);

    instantiationService.invokeFunction(accessor => {
      const mathServiceChannel = ProxyChannel.fromService(accessor.get(IMathService), disposables);
      messageServer.registerChannel('mathService', mathServiceChannel);
    });

    return instantiationService;
  }
}
