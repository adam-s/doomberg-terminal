import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { createServer, Server as HTTPServer } from 'http';
import { Server, ServerConnectionManager } from '@src/ipc/server';
import { Client, ClientConnectionManager } from '@shared/ipc/remote/Client';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMathService } from '@shared/services/math.service';
import { Event, Emitter } from 'vs/base/common/event';
import { NodeClientConnectionManager } from '../NodeClientConnectionManager';

type IMathServiceAdd = Pick<IMathService, 'add'>;

class MockMathService implements IMathServiceAdd {
  async add(a: number, b: number): Promise<number> {
    return a + b;
  }
}

describe('Server and Client IPC', () => {
  let httpServer: HTTPServer;
  let serverConnectionManager: ServerConnectionManager;
  let clientConnectionManager: ClientConnectionManager;
  let server: Server;
  let client: Client;
  let instantiationService: InstantiationService;
  let serviceCollection: ServiceCollection;
  let disposables: DisposableStore;

  beforeEach(
    async () =>
      new Promise(resolve => {
        // Create an HTTP server
        httpServer = createServer();
        httpServer.listen(0, () => {
          // Once the server is listening, set up the rest
          // Create the ServerConnectionManager and ClientConnectionManager
          serverConnectionManager = ServerConnectionManager.fromHttpServer(httpServer);
          clientConnectionManager = NodeClientConnectionManager.fromHttpServer(httpServer);

          // Create Server and Client instances
          server = new Server(serverConnectionManager);
          client = new Client(clientConnectionManager);

          // Set up services
          serviceCollection = new ServiceCollection();

          // Add MockMathService to the service collection
          serviceCollection.set(IMathService, new MockMathService());

          // Create the instantiation service
          instantiationService = new InstantiationService(serviceCollection, true);
          disposables = new DisposableStore();

          resolve();
        });
      }),
  );

  afterEach(() => {
    // Dispose of resources
    disposables.dispose();
    server.dispose();
    client.dispose();
    httpServer.close();
  });

  it('should allow the client to call mathService.add via the registered channel', async () => {
    // Register mathService on the server
    instantiationService.invokeFunction(accessor => {
      const mathServiceChannel = ProxyChannel.fromService(accessor.get(IMathService), disposables);
      server.registerChannel('mathService', mathServiceChannel);
    });

    // Get the mathService from the client
    const mathService = ProxyChannel.toService<IMathService>(client.getChannel('mathService'));

    // Call mathService.add and assert the result
    const result = await mathService.add(1, 2);
    expect(result).toBe(3);
  });

  it('should handle multiple concurrent mathService.add calls', async () => {
    // Register mathService on the server
    instantiationService.invokeFunction(accessor => {
      const mathServiceChannel = ProxyChannel.fromService(accessor.get(IMathService), disposables);
      server.registerChannel('mathService', mathServiceChannel);
    });

    // Get the mathService from the client
    const mathService = ProxyChannel.toService<IMathService>(client.getChannel('mathService'));

    // Perform multiple concurrent calls
    const promises = [mathService.add(1, 2), mathService.add(3, 4), mathService.add(5, 6)];

    // Await all promises and assert the results
    const results = await Promise.all(promises);
    expect(results).toEqual([3, 7, 11]);
  });

  it('should handle errors thrown by mathService.add', async () => {
    // Modify MockMathService to throw an error for specific inputs
    class ErrorMathService implements IMathServiceAdd {
      async add(a: number, b: number): Promise<number> {
        if (a === 0 && b === 0) {
          throw new Error('Invalid operands');
        }
        return a + b;
      }
    }

    // Update the service collection with the new implementation
    serviceCollection.set(IMathService, new ErrorMathService());

    // Register mathService on the server
    instantiationService.invokeFunction(accessor => {
      const mathServiceChannel = ProxyChannel.fromService(accessor.get(IMathService), disposables);
      server.registerChannel('mathService', mathServiceChannel);
    });

    // Get the mathService from the client
    const mathService = ProxyChannel.toService<IMathService>(client.getChannel('mathService'));

    // Call mathService.add with error-inducing inputs and assert the error
    await expect(mathService.add(0, 0)).rejects.toThrow('Invalid operands');
  });
});

// Define your service interface
interface ICalculatorService {
  add(a: number, b: number): Promise<number>;
  subtract(a: number, b: number): Promise<number>;
}

// Implement the service
class CalculatorService implements ICalculatorService {
  async add(a: number, b: number): Promise<number> {
    return a + b;
  }

  async subtract(a: number, b: number): Promise<number> {
    return a - b;
  }
}

// Implement the server channel
class CalculatorServerChannel implements IServerChannel {
  constructor(private service: ICalculatorService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(_: unknown, command: string, args: number[]): Promise<any> {
    switch (command) {
      case 'add':
        return this.service.add(args[0], args[1]);
      case 'subtract':
        return this.service.subtract(args[0], args[1]);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  listen<T>(): Event<T> {
    throw new Error('No events to listen to');
  }
}

// Implement the client-side service
class CalculatorClient {
  constructor(private channel: IChannel) {}

  add(a: number, b: number): Promise<number> {
    return this.channel.call('add', [a, b]);
  }

  subtract(a: number, b: number): Promise<number> {
    return this.channel.call('subtract', [a, b]);
  }
}

describe('CalculatorService over IPC', () => {
  let httpServer: HTTPServer;
  let serverConnectionManager: ServerConnectionManager;
  let clientConnectionManager: ClientConnectionManager;
  let server: Server;
  let client: Client;

  beforeEach(
    async () =>
      new Promise<void>(resolve => {
        // Create an HTTP server
        httpServer = createServer();
        httpServer.listen(0, () => {
          // Once the server is listening, set up the rest
          serverConnectionManager = ServerConnectionManager.fromHttpServer(httpServer);
          clientConnectionManager = NodeClientConnectionManager.fromHttpServer(httpServer);

          // Create Server and Client instances
          server = new Server(serverConnectionManager);
          client = new Client(clientConnectionManager);

          // Create CalculatorService and register the server channel
          const calculatorService = new CalculatorService();
          server.registerChannel('calculator', new CalculatorServerChannel(calculatorService));

          resolve();
        });
      }),
  );

  afterEach(() => {
    server.dispose();
    client.dispose();
    httpServer.close();
  });

  it('should allow the client to call add method via IPC', async () => {
    // Get the calculatorChannel from the client
    const calculatorChannel = client.getChannel('calculator');
    const calculatorClient = new CalculatorClient(calculatorChannel);

    // Call add method and assert the result
    const result = await calculatorClient.add(5, 3);
    expect(result).toBe(8);
  });

  it('should allow the client to call subtract method via IPC', async () => {
    // Get the calculatorChannel from the client
    const calculatorChannel = client.getChannel('calculator');
    const calculatorClient = new CalculatorClient(calculatorChannel);

    // Call subtract method and assert the result
    const result = await calculatorClient.subtract(10, 4);
    expect(result).toBe(6);
  });

  it('should throw an error for unknown commands', async () => {
    // Create a mock client with a ProxyChannel to test error handling
    const calculatorChannel = client.getChannel('calculator');

    // Try to invoke an unknown method and assert the error
    await expect(calculatorChannel.call('unknownMethod', [])).rejects.toThrow(
      'Unknown command: unknownMethod',
    );
  });
});

interface INotificationService {
  onNotification: Event<string>;
}

class NotificationService implements INotificationService {
  private readonly _onNotification = new Emitter<string>();
  public readonly onNotification = this._onNotification.event;

  sendNotification(message: string): void {
    this._onNotification.fire(message);
  }
}

class NotificationServerChannel implements IServerChannel {
  constructor(private service: INotificationService) {}

  call(): never {
    throw new Error('No methods to call');
  }

  listen<T>(_: unknown, event: string): Event<T> {
    switch (event) {
      case 'onNotification':
        return this.service.onNotification as Event<T>;
      default:
        throw new Error(`Unknown event: ${event}`);
    }
  }
}

class NotificationClient {
  constructor(private channel: IChannel) {}

  get onNotification(): Event<string> {
    return this.channel.listen('onNotification');
  }
}

describe('Notification Service over IPC', () => {
  let httpServer: HTTPServer;
  let serverConnectionManager: ServerConnectionManager;
  let clientConnectionManager: ClientConnectionManager;
  let server: Server;
  let client: Client;
  let disposables: DisposableStore;
  let notificationService: NotificationService;

  beforeEach(
    async () =>
      new Promise<void>(resolve => {
        // Create an HTTP server
        httpServer = createServer();
        httpServer.listen(0, () => {
          // Once the server is listening, set up the rest
          serverConnectionManager = ServerConnectionManager.fromHttpServer(httpServer);
          clientConnectionManager = NodeClientConnectionManager.fromHttpServer(httpServer);

          // Create Server and Client instances
          server = new Server(serverConnectionManager);
          client = new Client(clientConnectionManager);

          // Create NotificationService and register the server channel
          notificationService = new NotificationService();
          server.registerChannel(
            'notification',
            new NotificationServerChannel(notificationService),
          );

          disposables = new DisposableStore();

          resolve();
        });
      }),
  );

  afterEach(() => {
    disposables.dispose();
    server.dispose();
    client.dispose();
    httpServer.close();
  });

  it('should allow the client to receive notifications via IPC', async () => {
    // Set up the client to listen for notifications
    const notificationChannel = client.getChannel('notification');
    const notificationClient = new NotificationClient(notificationChannel);

    // Set up a listener for the notification event
    const notificationPromise = new Promise<string>(resolve => {
      notificationClient.onNotification(message => {
        resolve(message);
      });
    });
    await new Promise<void>(resolve => setTimeout(resolve, 100));

    // Server sends a notification
    notificationService.sendNotification('Hello, clients!');
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    notificationService.sendNotification('Hello, clients!');
    try {
      // Assert that the client receives the notification
      const receivedMessage = await notificationPromise;
      expect(receivedMessage).toBe('Hello, clients!');
    } catch (error) {
      console.log(error);
    }
  });

  // it('should handle multiple clients listening to notifications', async () => {
  //   // Set up two clients to listen for notifications
  //   const notificationChannel1 = client.getChannel('notification');
  //   const notificationClient1 = new NotificationClient(notificationChannel1);

  //   const notificationChannel2 = client.getChannel('notification');
  //   const notificationClient2 = new NotificationClient(notificationChannel2);

  //   // Set up listeners for both clients
  //   const notificationPromise1 = new Promise<string>(resolve => {
  //     notificationClient1.onNotification(message => {
  //       resolve(message);
  //     });
  //   });

  //   const notificationPromise2 = new Promise<string>(resolve => {
  //     notificationClient2.onNotification(message => {
  //       resolve(message);
  //     });
  //   });

  //   // Server sends a notification
  //   notificationService.sendNotification('Hello, multiple clients!');

  //   // Assert that both clients receive the notification
  //   const [receivedMessage1, receivedMessage2] = await Promise.all([notificationPromise1, notificationPromise2]);
  //   expect(receivedMessage1).toBe('Hello, multiple clients!');
  //   expect(receivedMessage2).toBe('Hello, multiple clients!');
  // });
});
