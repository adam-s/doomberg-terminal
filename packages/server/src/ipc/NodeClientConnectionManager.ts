import { Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { ClientConnectionManager } from '@shared/ipc/remote/Client';

export class NodeClientConnectionManager extends ClientConnectionManager {
  static fromHttpServer(httpServer: HTTPServer): NodeClientConnectionManager {
    const address = httpServer.address() as AddressInfo;
    const host = address.address === '::' ? 'localhost' : address.address;
    const port = address.port;
    return new NodeClientConnectionManager(host, port);
  }
}
